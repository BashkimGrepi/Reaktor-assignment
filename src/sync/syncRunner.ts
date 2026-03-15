/**
 * Sync Subsystem Runner
 *
 * Orchestrates all three data ingestion mechanisms:
 * 1. Historical Backfill - Progressive import of historical data
 * 2. Live SSE Stream - Real-time match ingestion
 * 3. Periodic Reconciliation - Gap-filling every 10 minutes
 *
 * Provides unified start/stop controls and graceful shutdown handling.
 */

import {
  startBackfillOrchestrator,
  stopBackfillOrchestrator,
  getBackfillStatus,
} from "./backfillOrchestrator.js";
import {
  connectToLiveStream,
  disconnectFromLiveStream,
  getSseConnectionStatus,
} from "./liveStream.js";
import {
  startReconciliationScheduler,
  stopReconciliationScheduler,
  getReconciliationStatus,
} from "./reconciliationScheduler.js";
import { prisma } from "../lib/prisma.js";

const SYNC_STATE_KEY = "main";

let isSubsystemRunning = false;

/**
 * Initialize SyncState record if it doesn't exist
 */
async function ensureSyncState(): Promise<void> {
  await prisma.syncState.upsert({
    where: { key: SYNC_STATE_KEY },
    update: {}, // Don't overwrite existing state
    create: {
      key: SYNC_STATE_KEY,
      backfillCursor: null,
      backfillCompleted: false,
      isBackfillRunning: false,
    },
  });
}

/**
 * Start all sync subsystem processes
 *
 * This function orchestrates:
 * - Historical backfill (runs until complete)
 * - Periodic reconciliation (runs every 10 minutes)
 */
export async function startSyncSubsystem(): Promise<void> {
  if (isSubsystemRunning) {
    console.log("⚠️  Sync subsystem already running");
    return;
  }

  console.log("\n🚀 ========================================");
  console.log("🚀 STARTING SYNC SUBSYSTEM");
  console.log("🚀 ========================================\n");

  try {
    // Initialize SyncState if needed
    console.log("📋 Initializing sync state...");
    await ensureSyncState();
    console.log("✅ Sync state initialized\n");

    // Start all two sync mechanisms
    console.log("📦 Starting historical backfill orchestrator...");
    await startBackfillOrchestrator();

    //console.log("📡 Starting live SSE stream...");
    //connectToLiveStream();

    console.log("🔄 Starting periodic reconciliation scheduler...");
    startReconciliationScheduler();

    isSubsystemRunning = true;

    console.log("\n✅ ========================================");
    console.log("✅ SYNC SUBSYSTEM STARTED SUCCESSFULLY");
    console.log("✅ ========================================\n");
  } catch (error) {
    console.error("\n❌ Failed to start sync subsystem:", error);
    // Attempt cleanup on failure
    await stopSyncSubsystem();
    throw error;
  }
}

/**
 * Stop all sync subsystem processes (graceful shutdown)
 */
async function stopSyncSubsystem(): Promise<void> {
  if (!isSubsystemRunning) {
    console.log("⚠️  Sync subsystem not running");
    return;
  }

  console.log("\n🛑 ========================================");
  console.log("🛑 STOPPING SYNC SUBSYSTEM");
  console.log("🛑 ========================================\n");

  try {
    // Stop all three sync mechanisms
    console.log("📦 Stopping historical backfill orchestrator...");
    stopBackfillOrchestrator();

    //console.log("📡 Disconnecting live SSE stream...");
    //disconnectFromLiveStream();

    console.log("🔄 Stopping periodic reconciliation scheduler...");
    stopReconciliationScheduler();

    // Final status update
    await prisma.syncState
      .update({
        where: { key: SYNC_STATE_KEY },
        data: {
          //sseConnected: false,
          isBackfillRunning: false,
        },
      })
      .catch(() => {
        // Ignore errors during shutdown
      });

    isSubsystemRunning = false;

    console.log("\n✅ ========================================");
    console.log("✅ SYNC SUBSYSTEM STOPPED");
    console.log("✅ ========================================\n");
  } catch (error) {
    console.error("❌ Error during sync subsystem shutdown:", error);
    throw error;
  }
}

/**
 * Get comprehensive sync subsystem status
 */
export async function getSyncSubsystemStatus(): Promise<{
  subsystemRunning: boolean;
  backfill: {
    completed: boolean;
    isRunning: boolean;
    cursor: string | null;
    lastRun: Date | null;
  };
  //sseStream: {
  //connected: boolean;
  //readyState: number | null;
  //};
  reconciliation: {
    isSchedulerActive: boolean;
    isCurrentlyRunning: boolean;
  };
  database: {
    totalMatches: number;
    latestKnownMatch: {
      time: Date | null;
      gameId: string | null;
    };
  };
}> {
  // Get status from each subsystem
  const backfillStatus = await getBackfillStatus();
  //const sseStatus = getSseConnectionStatus();
  const reconciliationStatus = getReconciliationStatus();

  // Get database statistics
  const totalMatches = await prisma.match.count();
  const syncState = await prisma.syncState.findUnique({
    where: { key: SYNC_STATE_KEY },
  });

  return {
    subsystemRunning: isSubsystemRunning,
    backfill: backfillStatus,
    //sseStream: sseStatus,
    reconciliation: reconciliationStatus,
    database: {
      totalMatches,
      latestKnownMatch: {
        time: syncState?.latestKnownMatchTime || null,
        gameId: syncState?.latestKnownGameId || null,
      },
    },
  };
}

/**
 * Setup graceful shutdown handlers for process termination
 */
export function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received - initiating graceful shutdown...`);

    try {
      await stopSyncSubsystem();
      await prisma.$disconnect();
      console.log("✅ Graceful shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  };

  // Handle various termination signals
  process.on("SIGINT", () => shutdown("SIGINT (Ctrl+C)"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGUSR2", () => shutdown("SIGUSR2 (nodemon restart)")); // For nodemon

  // Handle uncaught errors
  process.on("uncaughtException", async (error) => {
    console.error("❌ Uncaught Exception:", error);
    await shutdown("uncaughtException");
  });

  process.on("unhandledRejection", async (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    await shutdown("unhandledRejection");
  });
}
