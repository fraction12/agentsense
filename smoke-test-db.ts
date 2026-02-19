import { GraphDB } from "./graph-db.js";

const db = new GraphDB(":memory:");
db.initialize();

// Upsert nodes
const n1 = db.upsertNode({ name: "Alice", type: "person", summary: "Developer" });
const n2 = db.upsertNode({
  name: "ProjectX",
  type: "project",
  summary: "Main project",
});

// Upsert edge
db.upsertEdge(n1.id, n2.id, "works_on", "Since 2024");

// Search
const results = db.search("Alice");
if (results.length === 0) throw new Error("Search returned no results");
if (results[0].node.name !== "alice")
  throw new Error("Wrong result: " + results[0].node.name);

// Stats
const stats = db.stats();
if (stats.nodes !== 2) throw new Error("Expected 2 nodes, got " + stats.nodes);
if (stats.edges !== 1) throw new Error("Expected 1 edge, got " + stats.edges);

// Neighbors
const neighbors = db.getNeighbors(n1.id);
if (neighbors.length !== 1) throw new Error("Expected 1 neighbor");

// ingestExtraction
db.ingestExtraction(
  [
    { name: "Bob", type: "person", summary: "Manager" },
    { name: "TeamY", type: "project", summary: "Side project" },
  ],
  [{ from: "Bob", to: "TeamY", relation: "manages", context: "" }],
  "Bob manages TeamY",
  "test-session",
);
const stats2 = db.stats();
if (stats2.nodes !== 4) throw new Error("Expected 4 nodes after ingest, got " + stats2.nodes);
if (stats2.edges !== 2) throw new Error("Expected 2 edges after ingest, got " + stats2.edges);

// Export
const exported = db.export();
if (exported.nodes.length !== 4) throw new Error("Export node count wrong");

db.close();
console.log("  OK: GraphDB operations work correctly");
