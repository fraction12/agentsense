import { homedir } from "node:os";
import { join } from "node:path";

export type AgentSenseConfig = {
  dbPath: string;
  autoCapture: boolean;
  autoRecall: boolean;
  extractionModel: string;
  extractionApiKey: string;
  maxRecallEntities: number;
  captureMinMessageLength: number;
};

const DEFAULT_DB_PATH = join(homedir(), ".openclaw", "memory", "agentsense.db");
const DEFAULT_EXTRACTION_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_RECALL_ENTITIES = 5;
const DEFAULT_CAPTURE_MIN_MESSAGE_LENGTH = 50;

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}

export const agentSenseConfigSchema = {
  parse(value: unknown): AgentSenseConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("agentsense config required");
    }
    const cfg = value as Record<string, unknown>;

    if (typeof cfg.extractionApiKey !== "string" || !cfg.extractionApiKey) {
      throw new Error("extractionApiKey is required");
    }

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
      dbPath:
        typeof cfg.dbPath === "string" ? cfg.dbPath : DEFAULT_DB_PATH,
      autoCapture: cfg.autoCapture === true,
      autoRecall: cfg.autoRecall !== false,
      extractionModel:
        typeof cfg.extractionModel === "string"
          ? cfg.extractionModel
          : DEFAULT_EXTRACTION_MODEL,
      extractionApiKey: resolveEnvVars(cfg.extractionApiKey),
      maxRecallEntities,
      captureMinMessageLength,
    };
  },
};
