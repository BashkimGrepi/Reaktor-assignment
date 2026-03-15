/**
 * Backfill Orchestrator
 *
 * Manages the background historical backfill process.
 * Runs continuously in the background until all historical data is imported.
 */

import { runBackfillCycle } from "./historyBackfill.js";
import { prisma } from "../lib/prisma.js";

const SYNC_STATE_KEY = "main";
const CATCHING_UP_INTERVAL_MS = 5 * 1000; // 5 seconds - while catching up

let isRunning = false;
let orchestratorInterval: NodeJS.Timeout | null = null;

/**
 * Start the backfill orchestrator
 * Runs backfill cycles continuously until completion
 */
export async function startBackfillOrchestrator(): Promise<void> {
  if (isRunning) {
    console.log("⚠️  Backfill orchestrator already running");
    return;
  }
  isRunning = true;
  console.log(
    "🚀 Starting backfill orchestrator in CATCHING UP mode (5 sec interval)...",
  );

  // Initial check and start
  await runBackfillIfNeeded();

  if (!isRunning) return; // If already completed during initial check, don't set up interval

  // Set up periodic check
  orchestratorInterval = setInterval(async () => {
    await runBackfillIfNeeded();
  }, CATCHING_UP_INTERVAL_MS);
}

/**
 * Stop the backfill orchestrator
 */
export function stopBackfillOrchestrator(): void {
  if (orchestratorInterval) {
    clearInterval(orchestratorInterval);
    orchestratorInterval = null;
  }
  isRunning = false;
  console.log("🛑 Backfill orchestrator stopped");
}

/**
 * Check if backfill is needed and run a cycle if so
 */
async function runBackfillIfNeeded(): Promise<void> {
  try {
    // Get sync state
    const syncState = await prisma.syncState.findUnique({
      where: { key: SYNC_STATE_KEY },
    });

    // If no sync state, create it and start backfill
    if (!syncState) {
      console.log("📦 No sync state found - initializing backfill...");
      await runBackfillCycle();
      return;
    }

    // If already completed, stop orchestrator
    if (syncState.backfillCompleted) {
      console.log("✅ Backfill already completed - stopping orchestrator");
      stopBackfillOrchestrator();
      return;
    }

    // If already running (from another process or stuck), skip
    if (syncState.isBackfillRunning) {
      const lastRun = syncState.lastBackfillRunAt;
      if (lastRun) {
        const timeSinceLastRun = Date.now() - lastRun.getTime();
        if (timeSinceLastRun > 5 * 60 * 1000) {
          console.log("⚠️  Backfill appears stuck - resetting and retrying...");
          await prisma.syncState.update({
            where: { key: SYNC_STATE_KEY },
            data: { isBackfillRunning: false },
          });
        } else {
          return;
        }
      }
    }

    // Run a backfill cycle
    const result = await runBackfillCycle();

    if (result.completed) {
      console.log(
        "🎉 Backfill completed - reconciliation scheduler takes over.",
      );
      stopBackfillOrchestrator();
    }
  } catch (error) {
    console.error("❌ Error in backfill orchestrator:", error);
    // Don't stop on error - will retry on next interval
  }
}

/**
 * Get backfill status
 */
export async function getBackfillStatus(): Promise<{
  completed: boolean;
  isRunning: boolean;
  cursor: string | null;
  lastRun: Date | null;
}> {
  const syncState = await prisma.syncState.findUnique({
    where: { key: SYNC_STATE_KEY },
  });

  if (!syncState) {
    return {
      completed: false,
      isRunning: false,
      cursor: null,
      lastRun: null,
    };
  }

  return {
    completed: syncState.backfillCompleted,
    isRunning: syncState.isBackfillRunning,
    cursor: syncState.backfillCursor,
    lastRun: syncState.lastBackfillRunAt,
  };
}
