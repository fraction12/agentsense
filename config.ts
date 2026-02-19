import { homedir } from "node:os";
import { join } from "node:path";

export type AgentSenseConfig = {
  dbPath: string;
  autoCapture: boolean;
  autoRecall: boolean;
  maxRecallEntities: number;
  captureMinMessageLength: number;
};

const DEFAULT_DB_PATH = join(homedir(), ".openclaw", "memory", "agentsense.db");
const DEFAULT_MAX_RECALL_ENTITIES = 5;
const DEFAULT_CAPTURE_MIN_MESSAGE_LENGTH = 50;

export const agentSenseConfigSchema = {
  parse(value: unknown): AgentSenseConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      // Allow empty config — use all defaults
      return {
        dbPath: DEFAULT_DB_PATH,
        autoCapture: false,
        autoRecall: true,
        maxRecallEntities: DEFAULT_MAX_RECALL_ENTITIES,
        captureMinMessageLength: DEFAULT_CAPTURE_MIN_MESSAGE_LENGTH,
      };
    }
    const cfg = value as Record<string, unknown>;

    const maxRecallEntities =
      typeof cfg.maxRecallEntities === "number"
        ? Math.floor(cfg.maxRecallEntities)
        : DEFAULT_MAX_RECALL_ENTITIES;
    if (maxRecallEntities < 1 || maxRecallEntities > 20) {
      throw new Error("maxRecallEntities must be between 1 and 20");
    }

    const captureMinMessageLength =
      typeof cfg.captureMinMessageLength === "number"
        ? Math.floor(cfg.captureMinMessageLength)
        : DEFAULT_CAPTURE_MIN_MESSAGE_LENGTH;
    if (captureMinMessageLength < 10 || captureMinMessageLength > 1000) {
      throw new Error("captureMinMessageLength must be between 10 and 1000");
    }

    return {
      dbPath: typeof cfg.dbPath === "string" ? cfg.dbPath : DEFAULT_DB_PATH,
      autoCapture: cfg.autoCapture === true,
      autoRecall: cfg.autoRecall !== false,
      maxRecallEntities,
      captureMinMessageLength,
    };
  },
};
