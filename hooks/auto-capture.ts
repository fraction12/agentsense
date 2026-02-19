import type { GraphDB } from "../graph-db.js";
import type { PluginLogger } from "../plugin-types.js";

function extractTextsFromMessages(messages: unknown[]): string[] {
  const texts: string[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const msgObj = msg as Record<string, unknown>;
    const role = msgObj.role;
    if (role !== "user" && role !== "assistant") continue;

    const content = msgObj.content;
    if (typeof content === "string") {
      texts.push(content);
      continue;
    }
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block &&
          typeof block === "object" &&
          "type" in block &&
          (block as Record<string, unknown>).type === "text" &&
          "text" in block &&
          typeof (block as Record<string, unknown>).text === "string"
        ) {
          texts.push((block as Record<string, unknown>).text as string);
        }
      }
    }
  }
  return texts;
}

export function createAgentEndHandler(
  getDb: () => GraphDB | null,
  logger: PluginLogger,
  minMessageLength: number,
) {
  return async (
    event: { messages: unknown[]; success: boolean; error?: string; durationMs?: number },
    ctx: { sessionKey?: string },
  ): Promise<void> => {
    try {
      if (!event.success || !event.messages || event.messages.length === 0) return;

      const db = getDb();
      if (!db) return;

      const texts = extractTextsFromMessages(event.messages);
      const combined = texts
        .filter((t) => t.length >= minMessageLength)
        .join("\n\n---\n\n");

      if (combined.length < minMessageLength) return;

      // Buffer the raw text as a pending observation — extraction happens via cron
      const truncated = combined.slice(0, 8000);
      db.addObservation("conversation", truncated, "", ctx.sessionKey || "");

      logger.info?.(
        `agentsense: buffered ${texts.length} messages for extraction (${truncated.length} chars)`,
      );
    } catch (err) {
      logger.warn(`agentsense: auto-capture (agent_end) failed: ${String(err)}`);
    }
  };
}

export function createBeforeCompactionHandler(
  getDb: () => GraphDB | null,
  logger: PluginLogger,
  minMessageLength: number,
) {
  return async (
    event: { messageCount: number; messages?: unknown[]; sessionFile?: string },
    ctx: { sessionKey?: string },
  ): Promise<void> => {
    try {
      if (!event.messages || event.messages.length === 0) return;

      const db = getDb();
      if (!db) return;

      const texts = extractTextsFromMessages(event.messages);
      const combined = texts
        .filter((t) => t.length >= minMessageLength)
        .join("\n\n---\n\n");

      if (combined.length < minMessageLength) return;

      // Buffer the full pre-compaction transcript — this is the richest source
      const truncated = combined.slice(0, 12000);
      db.addObservation("compaction", truncated, "", ctx.sessionKey || "");

      logger.info?.(
        `agentsense: buffered pre-compaction transcript for extraction (${truncated.length} chars)`,
      );
    } catch (err) {
      logger.warn(`agentsense: auto-capture (before_compaction) failed: ${String(err)}`);
    }
  };
}
