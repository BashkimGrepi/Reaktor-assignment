# System Architecture

## Problem Statement

We need to ingest external match data (huge unknown amount of it, and from a unreliable upstream API), serve it reliably, AND broadcast live updates to multiple clients in real-time. The trick: do all this without letting upstream failures block the HTTP server.

---

## System Diagram

![Architecture Overview - Subsystems](../assets/architecture-subsystem.png)

---

## Component Breakdown

### 1. API Layer (Express)

**Responsibility:** Handle HTTP requests, validate inputs, return responses

**What it does:**

- Listens on port 3000 for incoming HTTP requests
- Routes requests to appropriate controllers
- Validates query parameters using Zod schemas
- Returns JSON responses or SSE streams
- Never touches the database directly (delegates to services)

**Routes:**

- GET /api/matches/\* – Query match data
- GET /api/leaderboard/\* – Compute rankings
- GET /api/live – Open SSE connection
- GET /health – Check sync state

**Key principle:** Stateless and synchronous. If upstream is down, API still works (returns cached data from DB).

---

### 2. SSE Consumer (Live Stream Listener)

**Responsibility:** Listen to an external SSE stream of real-time events and relay them to HTTP clients

**What it does:**

- Opens a persistent connection to upstream `GET /live` endpoint
- Receives match events in real-time as they occur
- Validates incoming event payloads
- **Broadcasts immediately to all connected HTTP clients via separate SSE connections** (NO database write)
- Handles disconnection gracefully (can reconnect)

**Key point:** This is a pure broadcast relay. It does NOT store to database—that's reconciliation's job.

**Key constraint:** Network can drop SSE connection at any time. Solution: periodic reconciliation catches missed events.

**Data flow:**

```
Upstream API (SSE)
    ↓
Live Stream Listener
    ├─→ Transform event to DTO
    ├─→ Validate with Zod
    ├─→ Store in database
    └─→ Broadcast to HTTP clients
```

**Why separate from API layer?**

- Upstream SSE connection is long-lived and event-driven
- HTTP layer is request-response, not event-driven
- Decoupling means if live stream dies, API still serves cached data

---

### 3. Backfill System (History Fetcher)

**Responsibility:** Fetch complete match history from upstream, handle progress tracking, run until complete (one time only)

**What it does:**

- Makes paginated requests to upstream API on a periodic interval
- Uses cursor-based pagination (state persisted in database)
- Transforms incoming data to standardized format
- Validates before storing
- Detects and ignores duplicates
- Resumes from last cursor if interrupted
- Runs periodically (checks every ~30 seconds) until `backfillCompleted = true`
- Once complete, stops checking and lets reconciliation take over

**State tracking (SyncState table):**

```
{
  backfillCursor: "page_5",      // Last received cursor
  backfillCompleted: false,      // Still more to fetch?
  lastBackfillRunAt: "2026-04-14T..."
}
```

**Why separate from API layer?**

- Backfill can be slow (thousands/millions of records)
- Should run in background, not block HTTP requests
- Can fail and retry independently

**Challenges solved:**

- **Resumable:** Cursor persisted; can pick up where you left off
- **Idempotent:** Duplicate gameIds ignored via unique constraint
- **Resilient:** Retries with exponential backoff on 429/5xx

---

### 4. Reconciliation System (Periodic Catch-Up)

**Responsibility:** Periodically scan recent matches from upstream and ensure database is caught up with latest data

**What it does:**

- Runs on a schedule (every ~3 minutes)
- Fetches the newest page from upstream history API
- Scans up to MAX_RECONCILIATION_PAGES (e.g., 10 pages) looking for new matches
- Upserts matches to database (gameId unique constraint prevents duplicates)
- Stops when:
  - Page is empty (no more data available)
  - All matches in page are already in database (detected as duplicate page)
  - Hit max pages limit to prevent runaway scans
  - (might need improvements. stop only when we have all dublicate matches in a page)

**Why it exists:**

- **Makes sure the db is caught up to real time data in a reasenable time 3min**

**State tracking (SyncState table):**

```
{
  lastReconcileRunAt: "2026-04-14T...",
  isReconcileRunning: boolean
}
```

**Why separate from backfill?**

- Backfill is one-time (fetch ALL history once, then done)
- Reconciliation is continuous (run every few minutes forever)
- Different responsibilities: backfill = historical completeness, reconciliation = freshness
- Backfill can handle millions of records; reconciliation scans only recent pages

**Idempotency:**

- Upserts are safe: duplicate gameIds ignored via unique constraint
- Can restart anytime without losing data or creating duplicates
- No persistent cursor (always scans from newest page)

---

### 5. Database Layer (PostgreSQL)

**Responsibility:** Durable storage of all system state

**What it stores:**

```
Players
+- id (primary key)
+- name (unique)
+- timestamps

Matches
+- id (primary key)
+- gameId (unique)
+- playedAt (indexed)
+- playerAId, playerBId (foreign keys)
+- playerAChoice, playerBChoice
+- resultType (DRAW, PLAYER_A_WIN, PLAYER_B_WIN)
+- winnerPlayerId, loserPlayerId
+- ingestedFrom (HISTORY_BACKFILL, LIVE_SSE, HISTORY_RECONCILIATION)

SyncState
+- backfillCursor
+- backfillCompleted
+- lastSseEventAt
+- sseConnected
+- isBackfillRunning, isReconcileRunning
```

**Key indexes:**

- Match(playedAt) – Fast date range queries
- Match(playerAId, playerBId) – Fast player filtering
- Match(playedDate, winnerId) – Fast leaderboard computation
- Player(name) – Fast player lookup

**Why not in-memory?**

- Upstream data is source of truth; DB is cache
- If process restarts, need to recover (can't lose data)
- Multiple processes may need same data (horizontal scaling)

**SyncState usage:**

- Tells us where backfill left off (resumability)
- Tells API if sync is healthy (health check)
- Tells reconciliation if live stream is connected

---

## Component Interactions

### Interaction 1: Startup Sequence

```
1. Express HTTP server starts
   +- Registers routes
   +- Listens on port 3000

2. Sync subsystem starts (in background)
   +- Check SyncState in database
   +-a) If backfillCompleted = false:
   │    +- Start Backfill system
   │       +- Resume from last cursor or from beginning
   │
   +-b) If backfillCompleted = true OR backfill done:
        +- Start Live Stream listener
        +- Start Reconciliation scheduler

3. System ready
   +- HTTP API serves requests
   +- Live listener receives events
   +- Reconciliation validates periodically
   +- All write to same database
```

### Interaction 2: Incoming HTTP Request for Matches

```
Client: GET /api/matches/player/Alice?limit=10

1. API Layer (Express)
   +- Validate: limit ∈ [1, 1000]
   +- Call service layer

2. Service Layer (matches.service.ts)
   +- Query database: SELECT * WHERE playerAId = ? OR playerBId = ? LIMIT 10
   +- Return array of Match rows

3. Transformer
   +- Convert DB rows to DTOs (NormalizedGame)
   +- Format for HTTP response

4. API Layer sends response
   +- 200 OK with JSON
```

**Key point:** No coordination with backfill or live listener needed. Just reads from DB.

---

### Interaction 3: New Match Event from Live Stream

```
Upstream: GAME_RESULT event arrives

1. SSE Consumer (liveStream.ts)
   +- Receives raw event JSON
   +- Validate: required fields? correct types?
   +- Transform to DTO

2. Broadcasting (IMMEDIATE, NO DB WRITE)
   +- Format event as SSE message
   +- Iterate through all connected HTTP clients
   +- Write to each (skip on error)
   +- Done. No database interaction.

3. Client disconnects
   +- Listen for close/error events
   +- Remove from client registry
```

**Key point:** Live stream is a relay only. It broadcasts in real-time but does NOT write to database. Reconciliation (every 3 min) ensures we catch any missed events by fetching the newest page from history API.

---

### Interaction 4: Backfill Progress & Database State

```
Backfill running in background:

1. Fetch batch of 100 matches from upstream (cursor: page_5)
2. Transform each match
3. Validate each match
4. Upsert 100 rows to Match table
5. Update SyncState:
   +- cursor = page_6 (next cursor from upstream)
   +- lastBackfillRunAt = now()
   +- isBackfillRunning = true

Meanwhile:
+- HTTP API requests continue → read from DB
+- Live listener continues → writes new matches
+- Reconciliation scheduler runs → detects gaps

Database consistency:
+- All writers use Prisma (same validation)
+- Unique constraints prevent true duplicates
+- Foreign keys prevent orphaned rows
```

---

### Interaction 5: Reconciliation Catches Gaps

```
Reconciliation scheduler (runs every 3 minutes):

1. Fetch newest page from history API (cursor = null)
   +- Start with the most recent matches
   +- Scan up to MAX_RECONCILIATION_PAGES (e.g., 10 pages)

2. Detect new matches
   +- Upsert each match (gameId unique constraint)
   +- If gameId already exists: ignore (duplicate)
   +- If new gameId: insert it

3. Stop when:
   +- No more data (empty page)
   +- Already seen all these matches (duplicate page = reached backfill) -> old system. If all dublicates we still keep going.
   +- Hit max pages limit

4. Update SyncState
   +- lastReconcileRunAt = now()
```

**Why separate from backfill?**

- Backfill is one-time historical import (runs once)
- Reconciliation is periodic catch-up (every 3 minutes)
- Ensures database stays relatively caught up to the tournament games
- Also handles data from live stream that we want to persist (via periodic reconciliation scanning)

---

Add components only when metrics show they're needed.
