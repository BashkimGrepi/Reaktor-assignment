/**
 * Live SSE Stream Module
 *
 * Establishes a persistent Server-Sent Events connection to the legacy API's /live endpoint.
 * Receives real-time match and broadcasts it to the connected client.
 */

import { EventSource } from "eventsource";
import { transformLegacyMatch } from "../transformers/matchTransformer.js";
import { SyncSource } from "../../generated/prisma/enums.js";
import { LegacyGame } from "../types/rps-dto.js";
import { broadcast } from "../services/live.service.js";

const SSE_URL = process.env.SSE_URL ;
const BEARER_TOKEN =  process.env.BEARER_TOKEN;

// Reconnection backoff settings
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const BACKOFF_MULTIPLIER = 2;

let eventSource: EventSource | null = null;
let currentReconnectDelay = INITIAL_RECONNECT_DELAY;
let reconnectTimeout: NodeJS.Timeout | null = null;
let isConnecting = false;


 // Process the incoming SSE event -> match data
async function processLiveEvent(eventData: string): Promise<void> {
  try {
    const legacyGame: LegacyGame = JSON.parse(eventData);
    if (legacyGame.type !== "GAME_RESULT") {
      console.warn("⚠️  Received unsupported event type:", legacyGame.type);
      return;
    }
    console.log(`📡 Received live match: ${legacyGame.gameId}`);
    
    // Transform to database format
    const transformed = transformLegacyMatch(legacyGame, SyncSource.LIVE_SSE);
    console.log(`✅ Processed live match: ${transformed.gameId}`);

    broadcast(transformed); // Broadcast to SSE clients
  } catch (error) {
    console.error("❌ Error processing live event:", error);
    console.error("Event data:", eventData);
  }
}

/**
 * Attempt to reconnect with exponential backoff
 */
function scheduleReconnect(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  console.log(`⏳ Reconnecting in ${currentReconnectDelay / 1000}s...`);

  reconnectTimeout = setTimeout(() => {
    connectToLiveStream();

    // Increase backoff for next reconnection (exponential)
    currentReconnectDelay = Math.min(
      currentReconnectDelay * BACKOFF_MULTIPLIER,
      MAX_RECONNECT_DELAY,
    );
  }, currentReconnectDelay);
}

/**
 * Connect to the live SSE stream
 */
export function connectToLiveStream(): void {
  if (isConnecting) {
    console.log("⚠️  Already attempting to connect to live stream");
    return;
  }

  if (eventSource && eventSource.readyState === EventSource.OPEN) {
    console.log("⚠️  Live stream already connected");
    return;
  }

  isConnecting = true;
  console.log("🔌 Connecting to live SSE stream...");

  // Create EventSource with authorization header
  eventSource = new EventSource(SSE_URL!, {
    fetch: (url: any, init: any) => {
      return fetch(url, {
        ...init,
        headers: {
          ...init?.headers ?? {},
          Authorization: `Bearer ${BEARER_TOKEN}`,
        }
      })
    }
  } as any); 


  // Connection opened
  eventSource.onopen = async () => {
    console.log("✅ Live SSE stream connected!");
    isConnecting = false;

    // Reset reconnection delay on successful connection
    currentReconnectDelay = INITIAL_RECONNECT_DELAY;

  };

  // Receive message/event
  eventSource.onmessage = (event: MessageEvent) => {
    if (!event.data) return;

    processLiveEvent(event.data);
  };


  // Connection error
  eventSource.onerror = async (error: any) => {
    console.error("❌ Live SSE stream error:", error);
    isConnecting = false;

    // Close current connection
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    // Schedule reconnection with backoff
    scheduleReconnect();
  };

  
}

/**
 * Disconnect from the live SSE stream
 */
export function disconnectFromLiveStream(): void {
  console.log("🔌 Disconnecting from live SSE stream...");

  // Clear reconnection timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // Close EventSource connection
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  isConnecting = false;
  currentReconnectDelay = INITIAL_RECONNECT_DELAY;

  console.log("✅ Disconnected from live SSE stream");
}

/**
 * Get current SSE connection status
 */
export function getSseConnectionStatus(): {
  connected: boolean;
  readyState: number | null;
} {
  return {
    connected: eventSource?.readyState === EventSource.OPEN,
    readyState: eventSource?.readyState ?? null,
  };
}


