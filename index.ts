import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { GraphDB } from "./graph-db.js";
import { EntityExtractor } from "./extractor.js";
import { agentSenseConfigSchema } from "./config.js";
import {
  createAgentEndHandler,
  createBeforeCompactionHandler,
} from "./hooks/auto-capture.js";
import { createBeforeAgentStartHandler } from "./hooks/auto-recall.js";
import { createMessageCaptureHandlers } from "./hooks/message-capture.js";
import { createGraphSearchTool } from "./tools/graph-search.js";
import { registerGraphCli } from "./cli/graph-cli.js";

const agentSensePlugin = {
  id: "agentsense",
  name: "AgentSense (Knowledge Graph)",
  description:
    "Knowledge graph memory plugin with entity extraction and relationship tracking",
  kind: "memory" as const,
  configSchema: agentSenseConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = agentSenseConfigSchema.parse(api.pluginConfig);
    const resolvedDbPath = api.resolvePath(cfg.dbPath);

    // Lazy DB instance — initialized on first use via service start
    let db: GraphDB | null = null;
    const getDb = (): GraphDB | null => db;

    const extractor = new EntityExtractor(cfg.extractionApiKey, cfg.extractionModel);

    api.logger.info(
      `agentsense: plugin registered (db: ${resolvedDbPath}, model: ${cfg.extractionModel})`,
    );

    // ========================================================================
    // Re-register memory-core tools (memory_search, memory_get) and CLI
    // ========================================================================

    api.registerTool(
      (ctx) => {
        const memorySearchTool = api.runtime.tools.createMemorySearchTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });
        const memoryGetTool = api.runtime.tools.createMemoryGetTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });
        if (!memorySearchTool || !memoryGetTool) return null;
        return [memorySearchTool, memoryGetTool];
      },
      { names: ["memory_search", "memory_get"] },
    );

    api.registerCli(
      ({ program }) => {
        api.runtime.tools.registerMemoryCli(program);
      },
      { commands: ["memory"] },
    );

    // ========================================================================
    // graph_search Tool
    // ========================================================================

    api.registerTool(createGraphSearchTool(getDb), { name: "graph_search" });

    // ========================================================================
    // Graph CLI Commands
    // ========================================================================

    api.registerCli(
      ({ program }) => {
        registerGraphCli(program, getDb);
      },
      { commands: ["graph"] },
    );

    // ========================================================================
    // Auto-Recall Hook
    // ========================================================================

    if (cfg.autoRecall) {
      api.on(
        "before_agent_start",
        createBeforeAgentStartHandler(getDb, api.logger, cfg.maxRecallEntities),
      );
    }

    // ========================================================================
    // Auto-Capture Hooks
    // ========================================================================

    if (cfg.autoCapture) {
      api.on(
        "agent_end",
        createAgentEndHandler(getDb, extractor, api.logger, cfg.captureMinMessageLength),
      );

      api.on(
        "before_compaction",
        createBeforeCompactionHandler(
          getDb,
          extractor,
          api.logger,
          cfg.captureMinMessageLength,
        ),
      );

      // Message-level capture (fire-and-forget)
      const messageHandlers = createMessageCaptureHandlers(
        getDb,
        extractor,
        api.logger,
        cfg.captureMinMessageLength,
      );

      api.on("message_received", messageHandlers.onMessageReceived);
      api.on("message_sent", messageHandlers.onMessageSent);
    }

    // ========================================================================
    // Service: DB Lifecycle
    // ========================================================================

    api.registerService({
      id: "agentsense",
      start: () => {
        db = new GraphDB(resolvedDbPath);
        db.initialize();
        api.logger.info(
          `agentsense: graph database initialized (${resolvedDbPath})`,
        );
      },
      stop: () => {
        if (db) {
          db.close();
          db = null;
        }
        api.logger.info("agentsense: stopped");
      },
    });
  },
};

export default agentSensePlugin;
