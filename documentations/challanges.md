# Challenges & Learning Journey

## 1. Legacy API Limitations & Constraints

The legacy API has been the most difficult part of this project.

### Core Problems

- **Cursor-based pagination only** (no direct access to "page X")
- **Pages ordered newest → older**, but items inside a page are not ordered
- **Rate limiting (429 errors)** when fetching too aggressively
- **Need to scan multiple pages** just to find data for a specific time or player
- **SSE stream is unreliable** (can disconnect or drop events)

### Why This Matters

- Cannot jump directly to the needed data
- Cannot rely on ordering within pages
- Cannot brute-force fetch everything due to rate limits

### Result

This forced the implementation of:

- **Historical backfill**
- **Periodic reconciliation**
- **Robust SSE handling**

---

## 2. Designing a Correct Sync Architecture

One of the most challenging parts was answering: **"Where should data come from and when?"**

### Core Problems

- **Mixing responsibilities** between backfill, reconciliation, and SSE
- **Confusion around:**
  - "caught up with live"
  - duplicate pages
  - when backfill should stop
- **Uncertainty about:**
  - what runs when
  - ownership of recent vs historical data

### Result

The system was redesigned into clear responsibilities:

- **SSE** → real-time streaming (no DB writes)
- **Reconciliation** → recent data persistence
- **Backfill** → historical data import

---

## 3. Duplicate Handling & Correctness Logic

Handling duplicates correctly was a major challenge.

### Questions I Faced

- How do I know if data already exists?
- Should I check every game individually?
- Should duplicates signal completion?
- How do I avoid missing data without reprocessing everything?

### Specific Issues

- Using `gameExists()` per match
- Using "all duplicates = caught up" logic
- Uncertainty whether duplicates are:
  - expected behavior
  - or a signal to stop processing

---

## 4. Cursor-Based Pagination Mental Model

Understanding cursor-based pagination required a shift in thinking.

### Problems

- "First page has no cursor — what do I do?"
- "How do I move forward?"
- "What does the cursor represent?"
- "How do I resume correctly?"

### Why This Is Tricky

Cursor-based APIs are **not intuitive** like page-number systems.

### Impact

This affected the design of:

- **Backfill**
- **Reconciliation**

---

## 5. State Management (SyncState) Confusion

Managing sync state correctly was not straightforward.

### Challenges

- When should state be updated?
- What does each field represent?
- Difference between:
  - **Cursor** (progress tracking)
  - **latestKnownMatch** (freshness tracking)
- Whether to update state inside loops

### Specific Issues

- Updating `latestKnownMatchTime` inside loops
- Mixing loop progress with state checkpoints
- Uncertainty about the correct moment to update state

---

## 6. Efficiency vs Correctness Trade-offs

A constant trade-off existed between performance and correctness.

### Key Considerations

- Per-match existence checks vs batch processing
- Database load vs data correctness
- Determining acceptable query volume

### Core Challenge

Balancing:

- **Correctness** → no duplicates, no missing data
- **vs**
- **Performance** → avoiding excessive DB/API load

---

## 7. SSE Handling & Reliability

Working with SSE introduced multiple reliability challenges.

### Problems

- Handling connection closures and errors
- Retry strategies (e.g., retrying every 2 seconds unnecessarily)
- Detecting whether connection is:
  - paused
  - dead
- Handling errors when SSE disconnects

### Additional Decision

Deciding **not to persist SSE data directly to the database**

### Impact

This decision directly influenced the final architecture.

---

## 8. Handling Stuck or Broken Processes

Ensuring system resilience required handling failure cases.

### Implemented Logic

- `isBackfillRunning`
- `lastBackfillRunAt`
- Reset logic (e.g., "if > 5 minutes → reset")

### Why This Was Needed

- Uncertainty whether processes were still running
- Risk of silent crashes
- Need for automatic recovery without manual intervention

---

## 9. Understanding System Flow (Startup & Runtime)

Designing the execution flow required careful thought.

### Key Questions

- What should start first?
- Should backfill complete before other processes?
- What runs periodically?
- What runs once?

### Insight

This was **not just a coding issue**, but a **system orchestration problem**.

---

## 10. Data Consistency Across Multiple Sources

The system combines multiple data sources:

- **SSE** (live)
- **History API**
- **Database**

### Challenge

Ensuring:

- No missing matches
- No duplicate matches
- Consistent system state

### Constraints

- SSE is unreliable
- History API is paginated
- Database is eventually consistent

### Result

This became a **classic multi-source synchronization problem**.

---

## 11. Overengineering vs Pragmatism

Throughout the project, there was constant uncertainty about complexity.

### Questions I Faced

- Am I overengineering this?
- Should I simplify?
- Is this logic even necessary?

### Examples

- Per-match existence checks
- Duplicate-page completion logic
- Multiple sync mechanisms

### Core Challenge

Finding the right balance between:

- **Robust system design**
- **Simplicity and maintainability**
 