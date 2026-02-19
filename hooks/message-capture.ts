import type { GraphDB } from "../graph-db.js";
import type { PluginLogger } from "../plugin-types.js";

const BUFFER_FLUSH_MS = 60_000; // Flush buffer to DB every 60 seconds
const MAX_BUFFER_SIZE = 50;

export function createMessageCaptureHandlers(
  getDb: () => GraphDB | null,
  logger: PluginLogger,
  minMessageLength: number,
) {
  let messageBuffer: string[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function flushBuffer(): void {
    const db = getDb();
    if (!db || messageBuffer.length === 0) return;

    try {
      const combined = messageBuffer.join("\n\n---\n\n").slice(0, 4000);
      if (combined.length >= minMessageLength) {
        db.addObservation("message", combined, "", "");
        logger.info?.(`agentsense: buffered ${messageBuffer.length} messages for extraction`);
      }
      messageBuffer = [];
    } catch (err) {
      logger.warn(`agentsense: message buffer flush failed: ${String(err)}`);
    }
  }

  function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushBuffer();
    }, BUFFER_FLUSH_MS);
  }

  function bufferMessage(content: string): void {
    if (content.length < minMessageLength) return;

    // Skip system-generated content
    if (content.startsWith("<") && content.includes("</")) return;
    if (content.includes("<knowledge-graph-context>")) return;

    messageBuffer.push(content);
    if (messageBuffer.length > MAX_BUFFER_SIZE) {
      messageBuffer.splice(0, messageBuffer.length - MAX_BUFFER_SIZE);
    }

    scheduleFlush();
  }

  return {
    onMessageReceived: (
      event: { from: string; content: string; timestamp?: number },
    ): void => {
      try {
        bufferMessage(event.content);
      } catch (err) {
        logger.warn(`agentsense: message_received capture failed: ${String(err)}`);
      }
    },

    onMessageSent: (
      event: { to: string; content: string; success: boolean },
    ): void => {
      try {
        if (!event.success) return;
        bufferMessage(event.content);
      } catch (err) {
        logger.warn(`agentsense: message_sent capture failed: ${String(err)}`);
      }
    },
  };
}
