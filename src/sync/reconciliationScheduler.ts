/**
 * Reconciliation Scheduler
 *
 * Runs periodic reconciliation every 3 minutes to catch gaps from missed SSE events.
 * Uses setInterval for reliable scheduling with overlap prevention.
 */

import { runReconciliationCycle } from "./reconciliation.js";

const RECONCILIATION_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

let reconciliationTimer: NodeJS.Timeout | null = null;
let isReconciliationRunning = false;

/**
 * Start the reconciliation scheduler
 * Runs reconciliation immediately, then every 3 minutes
 */
export function startReconciliationScheduler(): void {
  if (reconciliationTimer) {
    console.log("⚠️ Reconciliation scheduler already running");
    return;
  }

  console.log("🔄 Starting reconciliation scheduler (runs every 3 minutes)...");

  // Run immediately on startup
  runReconciliationWithCheck();

  // Then run every 3 minutes
  reconciliationTimer = setInterval(async () => {
    console.log("⏰ Reconciliation scheduler tick (every 3 minutes)");
    await runReconciliationWithCheck();
  }, RECONCILIATION_INTERVAL_MS);

  console.log("✅ Reconciliation scheduler started");
}

/**
 * Stop the reconciliation scheduler
 */
export function stopReconciliationScheduler(): void {
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer);
    reconciliationTimer = null;
    console.log("🛑 Reconciliation scheduler stopped");
  }
}

/**
 * Get scheduler status
 */
export function getReconciliationStatus(): {
  isSchedulerActive: boolean;
  isCurrentlyRunning: boolean;
} {
  return {
    isSchedulerActive: reconciliationTimer !== null,
    isCurrentlyRunning: isReconciliationRunning,
  };
}

/**
 * Internal helper to run reconciliation with overlap prevention
 */
async function runReconciliationWithCheck(): Promise<void> {
  if (isReconciliationRunning) {
    console.log("⏭️ Skipping reconciliation - previous cycle still running");
    return;
  }

  isReconciliationRunning = true;

  try {
    await runReconciliationCycle();
  } catch (error) {
    console.error("❌ Reconciliation failed:", error);
  } finally {
    isReconciliationRunning = false;
  }
}
