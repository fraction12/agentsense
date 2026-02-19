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
