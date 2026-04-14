# System Overview:

## Purpose

**RPS-assignment** is a backend data pipeline that ingests competitive Rock Paper Scissors (RPS) match data, persists it, and serves it via both REST API and real-time streaming. Think of it as a sports league backend—similar to how ESPN manages game results and leaderboards.

---

## What the System Does

1. **Fetches match history periodically** from an upstream legacy API (backfill process runs until complete)
2. **Listens for live matches** via Server-Sent Events (SSE stream) and broadcasts them in real-time
3. **Validates and stores data** in PostgreSQL via backfill and periodic reconciliation
4. **Serves HTTP endpoints** to query matches and leaderboards
5. **Broadcasts real-time events** to connected clients via SSE (broadcast-only, no DB write)

---

## What Problem It Solves

### The Challenge

- External legacy API is the only source of truth for match data
- No way to serve reliable, queryable data without a persistent backend
- Need both historical lookups AND real-time updates
- Upstream API is unreliable (rate limits, timeouts, errors, lack of data)

### The Solution

- **Durable cache:** PostgreSQL ensures data survives if upstream goes down
- **Flexible queries:** Filter by player, date, date range, leaderboards, wins
- **Real-time stream:** SSE broadcasts without polling overhead
- **Resilient sync:** Retry logic, exponential backoff, duplicate detection

---

## Key Features (High Level)

| Feature                      | Benefit                                                   |
| ---------------------------- | --------------------------------------------------------- |
| **History Backfill**         | Import all past matches via cursor pagination             |
| **Live Stream Listener**     | Receive new matches as they happen (SSE)                  |
| **Leaderboard Computation**  | Rank players by wins or win rate (any date range)         |
| **Match Queries**            | Filter by player, date, date range, wins                  |
| **Data Validation**          | Zod schemas prevent corrupt data from entering DB         |
| **Retry + Backoff Logic**    | Handles rate limits, timeouts, 5xx errors gracefully      |
| **Duplicate Detection**      | Cursor-based pagination + unique constraints = idempotent |
| **Graceful Client Handling** | One bad SSE client doesn't break broadcast to others      |

---

## Constraints (Built-In Trade-offs)

### Legacy API Reliability

- **Constraint:** Upstream API can timeout, rate-limit (429), or error (500, 502, 503)
- **Solution:** Retry with exponential backoff (3 attempts max, 1s → 2s → 4s delays)
- **Trade-off:** Slower backfill when upstream struggles; eventual consistency (not real-time)

### Rate Limiting

- **Constraint:** No documented rate limit policy; API may reject requests
- **Solution:** Exponential backoff + mandatory delay between requests
- **Trade-off:** Backfill slower if hitting limits; manual restart if completely blocked

### SSE Connection Stability

- **Constraint:** Network can drop long-lived SSE connections randomly (proxies, WiFi, etc.)
- **Solution:** Periodic reconciliation catches gaps; live listener can reconnect
- **Trade-off:** Not guaranteed real-time delivery; best-effort with periodic catch-up

### Database Load

- **Constraint:** Leaderboard computation aggregates per-player on every request (no caching)
- **Solution:** Current; acceptable for reasonable player count
- **Trade-off:** If 10k+ players, may need materialized views or Redis cache

### Data Quality

- **Constraint:** Trust upstream API schema; validate but can't correct bad data
- **Solution:** Zod validation rejects malformed payloads; logs errors
- **Trade-off:** Bad upstream data filtered out but lost; can't retroactively fix

