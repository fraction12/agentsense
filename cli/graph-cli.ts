import type { Command } from "commander";
import type { GraphDB } from "../graph-db.js";

export function registerGraphCli(
  program: Command,
  getDb: () => GraphDB | null,
): void {
  const graph = program.command("graph").description("AgentSense knowledge graph commands");

  graph
    .command("search")
    .description("Search the knowledge graph")
    .argument("<query>", "Search query")
    .option("--type <type>", "Filter by entity type")
    .option("--limit <n>", "Max results", "10")
    .action((query: string, opts: { type?: string; limit: string }) => {
      const db = getDb();
      if (!db) {
        console.error("Knowledge graph not initialized");
        return;
      }

      let results = db.search(query, parseInt(opts.limit, 10));
      if (opts.type) {
        results = results.filter((r) => r.node.type === opts.type!.toLowerCase());
      }

      if (results.length === 0) {
        console.log("No matching entities found.");
        return;
      }

      for (const { node, neighbors } of results) {
        console.log(`\n${node.name} [${node.type}]`);
        if (node.summary) console.log(`  ${node.summary}`);
        for (const n of neighbors.slice(0, 5)) {
          const arrow = n.direction === "outgoing" ? "->" : "<-";
          console.log(`  ${arrow} ${n.edge.relation} ${n.node.name}`);
        }
      }
    });

  graph
    .command("entities")
    .description("List all entities")
    .option("--type <type>", "Filter by entity type (person, project, etc.)")
    .action((opts: { type?: string }) => {
      const db = getDb();
      if (!db) {
        console.error("Knowledge graph not initialized");
        return;
      }

      const nodes = db.getAllNodes(opts.type);
      if (nodes.length === 0) {
        console.log("No entities found.");
        return;
      }

      for (const node of nodes) {
        const summary = node.summary ? ` - ${node.summary}` : "";
        console.log(`  [${node.type}] ${node.name}${summary}`);
      }
      console.log(`\nTotal: ${nodes.length} entities`);
    });

  graph
    .command("entity")
    .description("Show details for a specific entity")
    .argument("<name>", "Entity name")
    .action((name: string) => {
      const db = getDb();
      if (!db) {
        console.error("Knowledge graph not initialized");
        return;
      }

      const node = db.getNodeByName(name);
      if (!node) {
        console.log(`Entity "${name}" not found.`);
        return;
      }

      console.log(`\nName: ${node.name}`);
      console.log(`Type: ${node.type}`);
      console.log(`Summary: ${node.summary || "(none)"}`);
      console.log(`Created: ${node.created_at}`);
      console.log(`Updated: ${node.updated_at}`);

      const neighbors = db.getNeighbors(node.id);
      if (neighbors.length > 0) {
        console.log("\nRelationships:");
        for (const n of neighbors) {
          const arrow = n.direction === "outgoing" ? "->" : "<-";
          console.log(
            `  ${arrow} ${n.edge.relation} ${n.node.name} [${n.node.type}] (weight: ${n.edge.weight.toFixed(1)})`,
          );
        }
      }
    });

  graph
    .command("pending")
    .description("Show pending observations awaiting extraction")
    .option("--limit <n>", "Max observations to show", "10")
    .option("--json", "Output as JSON for cron processing")
    .action((opts: { limit: string; json?: boolean }) => {
      const db = getDb();
      if (!db) {
        console.error("Knowledge graph not initialized");
        return;
      }

      const pending = db.getPendingObservations(parseInt(opts.limit, 10));
      if (pending.length === 0) {
        if (opts.json) {
          console.log(JSON.stringify({ pending: [] }));
        } else {
          console.log("No pending observations.");
        }
        return;
      }

      if (opts.json) {
        console.log(
          JSON.stringify({
            pending: pending.map((o) => ({
              id: o.id,
              source: o.source,
              text: o.raw_text,
              session_key: o.session_key,
              processed_at: o.processed_at,
            })),
          }),
        );
      } else {
        for (const obs of pending) {
          const preview = obs.raw_text.slice(0, 100).replace(/\n/g, " ");
          console.log(`  [${obs.id}] ${obs.source} — ${preview}...`);
        }
        console.log(`\n${pending.length} pending observations`);
      }
    });

  graph
    .command("ingest")
    .description("Ingest extracted entities into the graph (used by cron)")
    .argument("<json>", "JSON string with {nodes: [...], edges: [...], observationId: number}")
    .action((jsonStr: string) => {
      const db = getDb();
      if (!db) {
        console.error("Knowledge graph not initialized");
        process.exitCode = 1;
        return;
      }

      try {
        const data = JSON.parse(jsonStr) as {
          nodes?: Array<{ name: string; type: string; summary: string }>;
          edges?: Array<{ from: string; to: string; relation: string; context: string }>;
          observationId?: number;
        };

        if (!data.nodes || !Array.isArray(data.nodes)) {
          console.error("Invalid input: nodes array required");
          process.exitCode = 1;
          return;
        }

        const result = db.ingestExtraction(
          data.nodes as import("../types.js").ExtractedNode[],
          (data.edges || []) as import("../types.js").ExtractedEdge[],
          "",
          "",
        );

        // Mark the observation as processed if provided
        if (data.observationId) {
          db.markObservationProcessed(
            data.observationId,
            JSON.stringify({ nodes: data.nodes, edges: data.edges }),
          );
        }

        console.log(
          `Ingested ${result.nodesUpserted} entities, ${result.edgesUpserted} edges`,
        );
      } catch (err) {
        console.error(`Ingest failed: ${String(err)}`);
        process.exitCode = 1;
      }
    });

  graph
    .command("stats")
    .description("Show knowledge graph statistics")
    .action(() => {
      const db = getDb();
      if (!db) {
        console.error("Knowledge graph not initialized");
        return;
      }

      const s = db.stats();
      console.log(`Entities: ${s.nodes}`);
      console.log(`Relationships: ${s.edges}`);
      console.log(`Observations: ${s.observations}`);
    });

  graph
    .command("clear")
    .description("Clear all knowledge graph data")
    .action(() => {
      const db = getDb();
      if (!db) {
        console.error("Knowledge graph not initialized");
        return;
      }

      const before = db.stats();
      db.clear();
      console.log(
        `Cleared ${before.nodes} entities, ${before.edges} relationships, ${before.observations} observations.`,
      );
    });

  graph
    .command("export")
    .description("Export full knowledge graph as JSON")
    .action(() => {
      const db = getDb();
      if (!db) {
        console.error("Knowledge graph not initialized");
        return;
      }

      const data = db.export();
      console.log(JSON.stringify(data, null, 2));
    });
}
