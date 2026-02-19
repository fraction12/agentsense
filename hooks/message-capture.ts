import type { GraphDB } from "../graph-db.js";
import type { EntityExtractor } from "../extractor.js";
import type { PluginLogger } from "../plugin-types.js";

const RATE_LIMIT_MS = 30_000; // Max 1 extraction per 30 seconds
const MAX_BUFFER_SIZE = 50; // Prevent unbounded growth

export function createMessageCaptureHandlers(
  getDb: () => GraphDB | null,
  extractor: EntityExtractor,
  logger: PluginLogger,
  minMessageLength: number,
) {
  let messageBuffer: string[] = [];
  let lastExtractionTime = 0;
  let pendingExtraction: Promise<void> | null = null;

  async function processBuffer(): Promise<void> {
    const db = getDb();
    if (!db || messageBuffer.length === 0) return;

    const now = Date.now();
    if (now - lastExtractionTime < RATE_LIMIT_MS) return;

    const texts = [...messageBuffer];
    messageBuffer.length = 0;
    const combined = texts.join("\n\n---\n\n").slice(0, 4000);

    if (combined.length < minMessageLength) return;

    lastExtractionTime = now;

    try {
      const result = await extractor.extract(combined);
      if (result.nodes.length === 0) return;

      db.ingestExtraction(result.nodes, result.edges, combined, "message");

      logger.info?.(
        `agentsense: message capture extracted ${result.nodes.length} entities`,
      );
    } catch (err) {
      // Restore messages on failure so they're not lost
      messageBuffer.unshift(...texts);
      if (messageBuffer.length > MAX_BUFFER_SIZE) {
        messageBuffer.splice(0, messageBuffer.length - MAX_BUFFER_SIZE);
      }
      logger.warn(`agentsense: message capture extraction failed: ${String(err)}`);
    }
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

    // Fire-and-forget: never block message delivery
    if (!pendingExtraction) {
      pendingExtraction = processBuffer().finally(() => {
        pendingExtraction = null;
      });
    }
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
