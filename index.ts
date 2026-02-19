import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { GraphDB } from "./graph-db.js";
import { agentSenseConfigSchema } from "./config.js";
import {
  createAgentEndHandler,
  createBeforeCompactionHandler,
} from "./hooks/auto-capture.js";
import { createBeforeAgentStartHandler } from "./hooks/auto-recall.js";
import { createMessageCaptureHandlers } from "./hooks/message-capture.js";
import { createGraphSearchTool } from "./tools/graph-search.js";
import { registerGraphCli } from "./cli/graph-cli.js";

// ========================================================================
// /graph command helpers
// ========================================================================

function graphStats(db: GraphDB): string {
  const stats = db.export();
  const pending = db.getPendingObservations(1).length;
  const allNodes = db.getAllNodes();
  const typeCounts = new Map<string, number>();
  for (const n of allNodes) typeCounts.set(n.type, (typeCounts.get(n.type) || 0) + 1);
  const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
  return [
    "🔗 **AgentSense Knowledge Graph**",
    "",
    `📊 **${stats.nodes.length}** nodes · **${stats.edges.length}** edges · **${stats.observations.length}** observations`,
    pending > 0 ? `⏳ **${pending}+** pending extraction` : "✅ All observations processed",
    "",
    "**By type:**",
    ...sorted.map(([type, cnt]) => `  • ${type}: ${cnt}`),
  ].join("\n");
}

function graphSearch(db: GraphDB, query: string): string {
  const results = db.search(query, 10);
  if (!results.length) return `🔍 No entities found for "${query}"`;
  return [
    `🔍 **Search: "${query}"** (${results.length} results)`,
    "",
    ...results.map((r) => `  • **${r.node.name}** [${r.node.type}]${r.node.summary ? ` — ${r.node.summary}` : ""}`),
  ].join("\n");
}

function graphRecent(db: GraphDB): string {
  const all = db.getAllNodes();
  if (!all.length) return "📭 No entities in the graph yet.";
  const sorted = all.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 10);
  return [
    "🕐 **Recent Entities** (last 10)",
    "",
    ...sorted.map((n) => `  • **${n.name}** [${n.type}] — ${n.summary || "no summary"}`),
  ].join("\n");
}

function graphConnections(db: GraphDB, name: string): string {
  const node = db.getNodeByName(name.toLowerCase());
  if (!node) return `❌ Entity "${name}" not found.`;

  const neighbors = db.getNeighbors(node.id);
  const parts = [
    `🔗 **${node.name}** [${node.type}]`,
    node.summary ? `_${node.summary}_` : "",
    "",
  ];

  if (neighbors.length === 0) {
    parts.push("_No connections yet._");
  } else {
    for (const n of neighbors) {
      const dir = n.direction === "outgoing" ? "→" : "←";
      parts.push(`  ${dir} ${n.edge.relation} ${dir} **${n.node.name}** [${n.node.type}]`);
    }
  }

  return parts.filter(Boolean).join("\n");
}

function graphTypes(db: GraphDB): string {
  const allNodes = db.getAllNodes();
  if (!allNodes.length) return "📭 No entities in the graph.";
  const typeCounts = new Map<string, number>();
  for (const n of allNodes) typeCounts.set(n.type, (typeCounts.get(n.type) || 0) + 1);
  const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
  return ["📊 **Entity Types**", "", ...sorted.map(([type, cnt]) => `  • **${type}**: ${cnt}`)].join("\n");
}

const agentSensePlugin = {
  id: "agentsense",
  name: "AgentSense (Knowledge Graph)",
  description:
    "Knowledge graph memory plugin — captures conversation text, stores entities and relationships. Extraction via cron.",
  kind: "memory" as const,
  configSchema: agentSenseConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = agentSenseConfigSchema.parse(api.pluginConfig);
    const resolvedDbPath = api.resolvePath(cfg.dbPath);

    // Initialize DB eagerly at registration time to avoid race with hooks
    const db = new GraphDB(resolvedDbPath);
    db.initialize();
    const getDb = (): GraphDB | null => db;

    api.logger.info(
      `agentsense: plugin registered (db: ${resolvedDbPath}, capture: ${cfg.autoCapture}, recall: ${cfg.autoRecall})`,
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
    // Auto-Capture Hooks (buffer only — extraction via cron)
    // ========================================================================

    if (cfg.autoCapture) {
      api.on(
        "agent_end",
        createAgentEndHandler(getDb, api.logger, cfg.captureMinMessageLength),
      );

      api.on(
        "before_compaction",
        createBeforeCompactionHandler(
          getDb,
          api.logger,
          cfg.captureMinMessageLength,
        ),
      );

      // Message-level capture (fire-and-forget, buffers to DB periodically)
      const messageHandlers = createMessageCaptureHandlers(
        getDb,
        api.logger,
        cfg.captureMinMessageLength,
      );

      api.on("message_received", messageHandlers.onMessageReceived);
      api.on("message_sent", messageHandlers.onMessageSent);
    }

    // ========================================================================
    // /graph Command (Telegram menu + all channels)
    // ========================================================================

    api.registerCommand({
      name: "graph",
      description: "Knowledge graph stats, search, and connections",
      acceptsArgs: true,
      handler: (ctx) => {
        const currentDb = getDb();
        if (!currentDb) return { text: "❌ AgentSense database not initialized." };

        const args = (ctx.args || "").trim();
        const spaceIdx = args.indexOf(" ");
        const sub = spaceIdx === -1 ? args : args.slice(0, spaceIdx);
        const param = spaceIdx === -1 ? "" : args.slice(spaceIdx + 1).trim();

        try {
          if (!sub) return { text: graphStats(currentDb) };
          if (sub === "search" || sub === "s") return { text: param ? graphSearch(currentDb, param) : "Usage: `/graph search <query>`" };
          if (sub === "recent" || sub === "r") return { text: graphRecent(currentDb) };
          if (sub === "connections" || sub === "c") return { text: param ? graphConnections(currentDb, param) : "Usage: `/graph connections <entity>`" };
          if (sub === "types" || sub === "t") return { text: graphTypes(currentDb) };
          return {
            text: [
              "🔗 **AgentSense Graph Commands**",
              "",
              "`/graph` — stats overview",
              "`/graph search <query>` — find entities",
              "`/graph recent` — latest entities",
              "`/graph connections <name>` — relationships",
              "`/graph types` — breakdown by type",
            ].join("\n"),
          };
        } catch (err) {
          return { text: `❌ Error: ${String(err)}` };
        }
      },
    });

    // ========================================================================
    // Service: DB Lifecycle
    // ========================================================================

    api.registerService({
      id: "agentsense",
      start: () => {
        api.logger.info(
          `agentsense: graph database ready (${resolvedDbPath})`,
        );
      },
      stop: () => {
        if (db) {
          db.close();
        }
        api.logger.info("agentsense: stopped");
      },
    });
  },
};

export default agentSensePlugin;
