# RPS League Backend

A backend service for the Rock Paper Scissors League. This is a **subsystem integration project** built to demonstrate robust data sync, validation, and API design patterns.

## What is This?

This is a backend subsystem that was designed to:

- Ingest match history from an external legacy API
- Stream real-time match updates via Server-Sent Events (SSE)
- Serve match data and leaderboards via REST API
- Persist all data in PostgreSQL with Prisma ORM


  "Note - this documents styling has been enhanced with AI"


## !!!! Current Status: Endpoints Deactivated !!!!

**Important:** The external legacy API endpoints are currently **not connected**:

- **No history is being fetched** – The `/api/matches` endpoints return no data
- **SSE stream is not open** – `/api/live` does not broadcast events
- **No real-time updates** – Leaderboards are empty

This project was built as a **sandbox/learning exercise** for backend architecture patterns. See [docs/legacy-api.md](docs/legacy-api.md) for challenges and design decisions.

## Quick Start

### Setup

```bash
# Install dependencies
npm install

# Configure database
# Create a PostgreSQL database and set DATABASE_URL in .env
DATABASE_URL="postgresql://user:pass@localhost/rps_league"

# Apply migrations & generate Prisma client
npx prisma migrate dev

# Start development server
npm run dev
```

### Scripts

```bash
npm run dev          # Development mode with live reload
npm run build        # Compile TypeScript
npm run type-check   # Type checking only
npm start            # Run production build
```

### Environment

```bash
PORT=3000
ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://...
LEGACY_API_BASE_URL=... # (not used; api deactivated)
```

## Documentation

- **[Overview](documentations/overview.md)** – Project Overview.
- **[Architecture Overview](documentations/architecture.md)** – Architecture decisions.
- **[Challanges](documentations/challanges.md)** – Challanges I faced during the work.
- **[Future Improvements](documentations/future-improvements.md)** – Currently in progress

## Key Components

| Component               | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| **Express API**         | HTTP endpoints for matches, leaderboards, health |
| **PostgreSQL + Prisma** | Type-safe data persistence                       |
| **Background Sync**     | Backfill, live stream, reconciliation (disabled) |
| **Zod Validation**      | Request & data validation                        |
| **Retry Logic**         | Exponential backoff for upstream failures        |

## API Structure (Routes Deactivated)

Only the `/health` endpoint is active:

- `GET /health` – Returns service status and sync state

Other endpoints exist but return old data or cant connect to legacy api SSE:

- `GET /api/matches/*` – Old data (legacy api deactivated)
- `GET /api/leaderboard/*` – Old data (legacy api deactivated)
- `GET /api/live` – SSE not open (api deactivated)

# RPS League Backend

A robust backend service for the Rock Paper Scissors League, providing real-time match tracking, leaderboard management, and live updates via Server-Sent Events (SSE).

## Overview

This backend handles the complete data pipeline for RPS League competitions, including:

- **Match History Sync** – Continuously fetches and stores match data from the legacy API
- **Real-time Broadcasting** – Streams live match results to connected clients via SSE
- **Leaderboard Generation** – Computes dynamic leaderboards by day, date range, or player
- **Data Validation** – Enforces strict schema validation using Prisma ORM and Zod
- **Health Monitoring** – Provides endpoint health checks and sync state tracking



## Project Goal

The backend solves three practical problems:

1. Import historical data so the database has full context.
2. Consume live events so new matches appear with low latency.
3. Reconcile periodically to recover from dropped events or temporary connection issues.


## Tech Stack

- Node.js + TypeScript
- Express
- PostgreSQL
- Prisma ORM (with @prisma/adapter-pg)
- EventSource for SSE ingestion



## Why This Design

This backend is intentionally built as a production-style ingestion system:

- Robust against missing events
- Recoverable after restarts
- Safe to rerun without data duplication
- Observable through health and sync status endpoints

It demonstrates practical backend engineering for streaming plus historical data synchronization.



