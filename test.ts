#!/usr/bin/env npx tsx
/**
 * AgentSense Comprehensive Test Suite
 * Run: npx tsx test.ts
 */

import { GraphDB } from "./graph-db.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  ❌ ${name} — ${msg}`);
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

function assertEq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`);
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    throw new Error(`${msg}: expected to throw but didn't`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(msg)) throw err;
    // Expected throw — pass
  }
}

function freshDb(): GraphDB {
  const db = new GraphDB(":memory:");
  db.initialize();
  return db;
}

// ════════════════════════════════════════════════════
console.log("\n🧪 AgentSense Test Suite\n");

// ── SECTION 1: Database Initialization ──
console.log("📦 Database Initialization");

test("initialize creates tables", () => {
  const db = freshDb();
  const stats = db.stats();
  assertEq(stats.nodes, 0, "nodes");
  assertEq(stats.edges, 0, "edges");
  assertEq(stats.observations, 0, "observations");
  db.close();
});

test("double initialize is idempotent", () => {
  const db = freshDb();
  db.initialize(); // second call should not throw
  const stats = db.stats();
  assertEq(stats.nodes, 0, "nodes after double init");
  db.close();
});

test("operations fail before initialize", () => {
  const db = new GraphDB(":memory:");
  assertThrows(() => db.stats(), "should throw before init");
  // Don't close — never opened
});

// ── SECTION 2: Node Operations ──
console.log("\n👤 Node Operations");

test("upsert creates a new node", () => {
  const db = freshDb();
  const node = db.upsertNode({ name: "Alice", type: "person", summary: "A developer" });
  assert(node.id > 0, "should have valid id");
  assertEq(node.name, "alice", "name should be lowercase");
  assertEq(node.type, "person", "type");
  assertEq(node.summary, "A developer", "summary");
  db.close();
});

test("upsert normalizes name to lowercase", () => {
  const db = freshDb();
  db.upsertNode({ name: "  Alice CHEN  ", type: "person", summary: "test" });
  const found = db.getNodeByName("alice chen");
  assert(found !== undefined, "should find by lowercase");
  assertEq(found!.name, "alice chen", "stored lowercase trimmed");
  db.close();
});

test("upsert updates existing node summary", () => {
  const db = freshDb();
  db.upsertNode({ name: "Alice", type: "person", summary: "v1" });
  const updated = db.upsertNode({ name: "Alice", type: "person", summary: "v2 - better summary" });
  assertEq(updated.summary, "v2 - better summary", "summary should update");
  assertEq(db.stats().nodes, 1, "should still be 1 node");
  db.close();
});

test("upsert does not update with shorter summary", () => {
  const db = freshDb();
  db.upsertNode({ name: "Alice", type: "person", summary: "A very detailed description of Alice" });
  const updated = db.upsertNode({ name: "Alice", type: "person", summary: "short" });
  assertEq(updated.summary, "A very detailed description of Alice", "should keep longer summary");
  db.close();
});

test("getNode by id", () => {
  const db = freshDb();
  const node = db.upsertNode({ name: "Bob", type: "person", summary: "test" });
  const found = db.getNode(node.id);
  assert(found !== undefined, "should find by id");
  assertEq(found!.name, "bob", "name matches");
  db.close();
});

test("getNode returns undefined for invalid id", () => {
  const db = freshDb();
  assertEq(db.getNode(999), undefined, "should return undefined");
  db.close();
});

test("getNodeByName returns undefined for missing", () => {
  const db = freshDb();
  assertEq(db.getNodeByName("nonexistent"), undefined, "should return undefined");
  db.close();
});

test("getAllNodes returns all", () => {
  const db = freshDb();
  db.upsertNode({ name: "A", type: "person", summary: "" });
  db.upsertNode({ name: "B", type: "tool", summary: "" });
  db.upsertNode({ name: "C", type: "person", summary: "" });
  assertEq(db.getAllNodes().length, 3, "total nodes");
  assertEq(db.getAllNodes("person").length, 2, "person nodes");
  assertEq(db.getAllNodes("tool").length, 1, "tool nodes");
  assertEq(db.getAllNodes("project").length, 0, "no project nodes");
  db.close();
});

test("handles special characters in names", () => {
  const db = freshDb();
  db.upsertNode({ name: "O'Brien", type: "person", summary: "Has apostrophe" });
  db.upsertNode({ name: 'Say "hello"', type: "idea", summary: "Has quotes" });
  db.upsertNode({ name: "C++ Language", type: "tool", summary: "Has plus" });
  assertEq(db.stats().nodes, 3, "all three created");
  const found = db.getNodeByName("o'brien");
  assert(found !== undefined, "should find O'Brien");
  db.close();
});

test("handles empty name gracefully", () => {
  const db = freshDb();
  const node = db.upsertNode({ name: "", type: "person", summary: "empty" });
  assert(node.id > 0, "should still create");
  db.close();
});

test("handles very long summary", () => {
  const db = freshDb();
  const longSummary = "x".repeat(10000);
  const node = db.upsertNode({ name: "Long", type: "person", summary: longSummary });
  assertEq(node.summary.length, 10000, "should store full summary");
  db.close();
});

// ── SECTION 3: Edge Operations ──
console.log("\n🔗 Edge Operations");

test("upsert creates an edge", () => {
  const db = freshDb();
  const n1 = db.upsertNode({ name: "A", type: "person", summary: "" });
  const n2 = db.upsertNode({ name: "B", type: "project", summary: "" });
  const edge = db.upsertEdge(n1.id, n2.id, "works_on", "since 2024");
  assert(edge.id > 0, "edge id");
  assertEq(edge.source_id, n1.id, "source");
  assertEq(edge.target_id, n2.id, "target");
  assertEq(edge.relation, "works_on", "relation");
  db.close();
});

test("upsert edge increments weight on duplicate", () => {
  const db = freshDb();
  const n1 = db.upsertNode({ name: "A", type: "person", summary: "" });
  const n2 = db.upsertNode({ name: "B", type: "project", summary: "" });
  const e1 = db.upsertEdge(n1.id, n2.id, "works_on", "v1");
  assertEq(e1.weight, 1.0, "initial weight");
  const e2 = db.upsertEdge(n1.id, n2.id, "works_on", "v2 longer context");
  assertEq(e2.weight, 1.1, "incremented weight");
  assertEq(e2.context, "v2 longer context", "context updated when longer");
  assertEq(db.stats().edges, 1, "still one edge");
  db.close();
});

test("edge weight caps at 5.0", () => {
  const db = freshDb();
  const n1 = db.upsertNode({ name: "A", type: "person", summary: "" });
  const n2 = db.upsertNode({ name: "B", type: "project", summary: "" });
  for (let i = 0; i < 50; i++) {
    db.upsertEdge(n1.id, n2.id, "works_on", `iter ${i}`);
  }
  const neighbors = db.getNeighbors(n1.id);
  assert(neighbors[0].edge.weight <= 5.0, "weight should cap at 5.0");
  db.close();
});

test("normalizes edge relation to lowercase", () => {
  const db = freshDb();
  const n1 = db.upsertNode({ name: "A", type: "person", summary: "" });
  const n2 = db.upsertNode({ name: "B", type: "project", summary: "" });
  db.upsertEdge(n1.id, n2.id, "  Works_On  ", "test");
  const neighbors = db.getNeighbors(n1.id);
  assertEq(neighbors[0].edge.relation, "works_on", "relation lowercase trimmed");
  db.close();
});

test("different relations create different edges", () => {
  const db = freshDb();
  const n1 = db.upsertNode({ name: "A", type: "person", summary: "" });
  const n2 = db.upsertNode({ name: "B", type: "project", summary: "" });
  db.upsertEdge(n1.id, n2.id, "works_on", "");
  db.upsertEdge(n1.id, n2.id, "manages", "");
  assertEq(db.stats().edges, 2, "two distinct edges");
  db.close();
});

test("getNeighbors returns both directions", () => {
  const db = freshDb();
  const n1 = db.upsertNode({ name: "A", type: "person", summary: "" });
  const n2 = db.upsertNode({ name: "B", type: "project", summary: "" });
  const n3 = db.upsertNode({ name: "C", type: "tool", summary: "" });
  db.upsertEdge(n1.id, n2.id, "works_on", "");
  db.upsertEdge(n3.id, n1.id, "used_by", "");
  const neighbors = db.getNeighbors(n1.id);
  assertEq(neighbors.length, 2, "two neighbors");
  const outgoing = neighbors.filter(n => n.direction === "outgoing");
  const incoming = neighbors.filter(n => n.direction === "incoming");
  assertEq(outgoing.length, 1, "one outgoing");
  assertEq(incoming.length, 1, "one incoming");
  db.close();
});

test("getNeighbors for node with no edges", () => {
  const db = freshDb();
  const n1 = db.upsertNode({ name: "Lonely", type: "person", summary: "" });
  assertEq(db.getNeighbors(n1.id).length, 0, "no neighbors");
  db.close();
});

// ── SECTION 4: Observation Operations ──
console.log("\n📝 Observation Operations");

test("addObservation stores text", () => {
  const db = freshDb();
  const obs = db.addObservation("conversation", "Hello world", "", "session-1");
  assert(obs.id > 0, "observation id");
  assertEq(obs.source, "conversation", "source");
  assertEq(obs.raw_text, "Hello world", "text");
  assertEq(db.stats().observations, 1, "observation count");
  db.close();
});

test("getPendingObservations returns unprocessed only", () => {
  const db = freshDb();
  db.addObservation("conv", "text 1", "", "s1");
  db.addObservation("conv", "text 2", "", "s1");
  db.addObservation("conv", "text 3", '{"nodes":["a"]}', "s1"); // processed
  const pending = db.getPendingObservations(10);
  assertEq(pending.length, 2, "two pending");
  db.close();
});

test("getPendingObservations respects limit", () => {
  const db = freshDb();
  for (let i = 0; i < 20; i++) {
    db.addObservation("conv", `text ${i}`, "", "s1");
  }
  assertEq(db.getPendingObservations(5).length, 5, "limited to 5");
  assertEq(db.getPendingObservations(100).length, 20, "all 20 when limit high");
  db.close();
});

test("markObservationProcessed updates entities_json", () => {
  const db = freshDb();
  const obs = db.addObservation("conv", "text", "", "s1");
  db.markObservationProcessed(obs.id, '{"nodes":["alice"]}');
  const pending = db.getPendingObservations(10);
  assertEq(pending.length, 0, "none pending after marking");
  db.close();
});

test("observation with special characters", () => {
  const db = freshDb();
  const text = "O'Brien said \"hello\" & goodbye <script>alert('xss')</script>";
  const obs = db.addObservation("message", text, "", "s1");
  assertEq(obs.raw_text, text, "raw text preserved");
  db.close();
});

test("observation with very large text", () => {
  const db = freshDb();
  const bigText = "x".repeat(50000);
  const obs = db.addObservation("conv", bigText, "", "s1");
  assertEq(obs.raw_text.length, 50000, "large text stored");
  db.close();
});

// ── SECTION 5: Search ──
console.log("\n🔍 Search");

test("search by name", () => {
  const db = freshDb();
  db.upsertNode({ name: "Alice Chen", type: "person", summary: "Developer" });
  db.upsertNode({ name: "Bob Martinez", type: "person", summary: "Manager" });
  const results = db.search("Alice");
  assert(results.length > 0, "should find Alice");
  assertEq(results[0].node.name, "alice chen", "correct result");
  db.close();
});

test("search by summary content", () => {
  const db = freshDb();
  db.upsertNode({ name: "ProjectX", type: "project", summary: "Machine learning pipeline" });
  const results = db.search("machine learning");
  assert(results.length > 0, "should find by summary");
  db.close();
});

test("search returns empty for no matches", () => {
  const db = freshDb();
  db.upsertNode({ name: "Alice", type: "person", summary: "test" });
  const results = db.search("zzzznonexistent");
  assertEq(results.length, 0, "no results");
  db.close();
});

test("search includes neighbors", () => {
  const db = freshDb();
  const n1 = db.upsertNode({ name: "Alice", type: "person", summary: "" });
  const n2 = db.upsertNode({ name: "ProjectX", type: "project", summary: "" });
  db.upsertEdge(n1.id, n2.id, "works_on", "");
  const results = db.search("Alice");
  assert(results.length > 0, "found Alice");
  assert(results[0].neighbors.length > 0, "has neighbors");
  assertEq(results[0].neighbors[0].node.name, "projectx", "neighbor is ProjectX");
  db.close();
});

test("search respects limit", () => {
  const db = freshDb();
  for (let i = 0; i < 20; i++) {
    db.upsertNode({ name: `Entity${i}`, type: "tool", summary: `Tool number ${i}` });
  }
  const results = db.search("Entity", 5);
  assertEq(results.length, 5, "limited to 5");
  db.close();
});

test("search with special characters doesn't crash", () => {
  const db = freshDb();
  db.upsertNode({ name: "C++", type: "tool", summary: "Language" });
  // FTS5 special chars that could break queries
  const dangerous = ["*", '"', "'", "(", ")", "OR", "AND", "NOT", "NEAR"];
  for (const q of dangerous) {
    try {
      db.search(q); // should not throw
    } catch {
      throw new Error(`search crashed on: ${q}`);
    }
  }
  db.close();
});

test("search with empty query", () => {
  const db = freshDb();
  db.upsertNode({ name: "Alice", type: "person", summary: "" });
  const results = db.search("");
  // Empty query may return all or none — just shouldn't crash
  assert(true, "didn't crash");
  db.close();
});

// ── SECTION 6: Ingest Extraction ──
console.log("\n📥 Ingest Extraction");

test("ingestExtraction creates nodes and edges", () => {
  const db = freshDb();
  db.ingestExtraction(
    [
      { name: "Alice", type: "person", summary: "Dev" },
      { name: "ProjectX", type: "project", summary: "Main" },
    ],
    [{ from: "Alice", to: "ProjectX", relation: "works_on", context: "" }],
    "test source text",
    "session-1",
  );
  assertEq(db.stats().nodes, 2, "two nodes");
  assertEq(db.stats().edges, 1, "one edge");
  assertEq(db.stats().observations, 1, "one observation");
  db.close();
});

test("ingestExtraction handles missing edge targets gracefully", () => {
  const db = freshDb();
  // Edge references a node that's not in the extraction
  db.ingestExtraction(
    [{ name: "Alice", type: "person", summary: "Dev" }],
    [{ from: "Alice", to: "NonExistent", relation: "knows", context: "" }],
    "test",
    "s1",
  );
  assertEq(db.stats().nodes, 1, "only Alice created");
  // Edge should silently fail since NonExistent doesn't exist
  db.close();
});

test("ingestExtraction with empty arrays", () => {
  const db = freshDb();
  db.ingestExtraction([], [], "no entities found", "s1");
  assertEq(db.stats().nodes, 0, "no nodes");
  assertEq(db.stats().observations, 1, "observation still recorded");
  db.close();
});

test("ingestExtraction deduplicates existing nodes", () => {
  const db = freshDb();
  db.upsertNode({ name: "Alice", type: "person", summary: "Original" });
  db.ingestExtraction(
    [{ name: "Alice", type: "person", summary: "Updated via ingest with longer description" }],
    [],
    "test",
    "s1",
  );
  assertEq(db.stats().nodes, 1, "still one Alice");
  const alice = db.getNodeByName("alice");
  assertEq(alice!.summary, "Updated via ingest with longer description", "summary updated");
  db.close();
});

// ── SECTION 7: Clear and Export ──
console.log("\n🧹 Clear & Export");

test("clear removes all data", () => {
  const db = freshDb();
  db.upsertNode({ name: "A", type: "person", summary: "" });
  db.addObservation("conv", "text", "", "s1");
  db.clear();
  const stats = db.stats();
  assertEq(stats.nodes, 0, "nodes cleared");
  assertEq(stats.observations, 0, "observations cleared");
  db.close();
});

test("export returns all data", () => {
  const db = freshDb();
  db.upsertNode({ name: "A", type: "person", summary: "" });
  db.upsertNode({ name: "B", type: "tool", summary: "" });
  const n1 = db.getNodeByName("a")!;
  const n2 = db.getNodeByName("b")!;
  db.upsertEdge(n1.id, n2.id, "uses", "");
  db.addObservation("conv", "text", "", "s1");
  const exp = db.export();
  assertEq(exp.nodes.length, 2, "exported nodes");
  assertEq(exp.edges.length, 1, "exported edges");
  assertEq(exp.observations.length, 1, "exported observations");
  db.close();
});

// ── SECTION 8: Extractor Prompt ──
console.log("\n🤖 Extractor");

import { EXTRACTION_PROMPT, parseExtractionResponse } from "./extractor.js";

test("EXTRACTION_PROMPT is defined and substantial", () => {
  assert(EXTRACTION_PROMPT.length > 100, "prompt should be substantial");
  assert(EXTRACTION_PROMPT.includes("entity"), "should mention entities");
});

test("parseExtractionResponse parses valid JSON", () => {
  const json = JSON.stringify({
    nodes: [{ name: "Alice", type: "person", summary: "Dev" }],
    edges: [{ from: "Alice", to: "Alice", relation: "self", context: "" }],
  });
  const result = parseExtractionResponse(json);
  assert(result !== null, "should parse");
  assertEq(result.nodes.length, 1, "one node");
});

test("parseExtractionResponse handles JSON in markdown code block", () => {
  const response = "Here's the extraction:\n```json\n" + JSON.stringify({
    entities: [{ name: "Alice", type: "person", summary: "Dev" }],
    relationships: [],
  }) + "\n```";
  const result = parseExtractionResponse(response);
  assert(result !== null, "should parse from code block");
});

test("parseExtractionResponse returns empty for garbage", () => {
  const r1 = parseExtractionResponse("not json at all");
  assertEq(r1.nodes.length, 0, "no nodes from garbage");
  const r2 = parseExtractionResponse("");
  assertEq(r2.nodes.length, 0, "no nodes from empty");
  const r3 = parseExtractionResponse("{}");
  assertEq(r3.nodes.length, 0, "no nodes from empty object");
});

// ── SECTION 9: Auto-Recall Hook ──
console.log("\n🔄 Auto-Recall Hook");

import { createBeforeAgentStartHandler } from "./hooks/auto-recall.js";

test("auto-recall returns entities for matching prompt", () => {
  const db = freshDb();
  db.upsertNode({ name: "Alice", type: "person", summary: "Developer" });
  const handler = createBeforeAgentStartHandler(() => db, { info: () => {}, warn: () => {} } as any, 5);
  const result = handler({ prompt: "Tell me about Alice" });
  // Handler is async
  (result as Promise<any>).then((r: any) => {
    assert(r !== undefined, "should return context");
    assert(r.prependContext.includes("alice"), "should include Alice");
  });
  db.close();
});

test("auto-recall returns undefined for short prompt", async () => {
  const db = freshDb();
  const handler = createBeforeAgentStartHandler(() => db, { info: () => {}, warn: () => {} } as any, 5);
  const result = await handler({ prompt: "hi" });
  assertEq(result, undefined, "should skip short prompts");
  db.close();
});

test("auto-recall returns undefined when db is null", async () => {
  const handler = createBeforeAgentStartHandler(() => null, { info: () => {}, warn: () => {} } as any, 5);
  const result = await handler({ prompt: "Tell me about Alice and her projects" });
  assertEq(result, undefined, "should handle null db");
});

// ── SECTION 10: Auto-Capture Hook ──
console.log("\n📸 Auto-Capture Hook");

import { createAgentEndHandler } from "./hooks/auto-capture.js";

test("auto-capture buffers conversation text", async () => {
  const db = freshDb();
  const handler = createAgentEndHandler(() => db, { info: () => {}, warn: () => {} } as any, 50);

  await handler(
    {
      messages: [
        { role: "user", content: "Tell me about the project status and what we need to do next" },
        { role: "assistant", content: "The project is on track. We need to finish the API integration by Friday." },
      ],
      success: true,
    } as any,
    { sessionKey: "test-session" } as any,
  );

  const pending = db.getPendingObservations(10);
  assert(pending.length > 0, "should have buffered observation");
  db.close();
});

test("auto-capture skips on failure", async () => {
  const db = freshDb();
  const handler = createAgentEndHandler(() => db, { info: () => {}, warn: () => {} } as any, 50);
  await handler({ messages: [{ role: "user", content: "test message that is long enough" }], success: false } as any, {} as any);
  assertEq(db.getPendingObservations(10).length, 0, "nothing captured on failure");
  db.close();
});

test("auto-capture skips empty messages", async () => {
  const db = freshDb();
  const handler = createAgentEndHandler(() => db, { info: () => {}, warn: () => {} } as any, 50);
  await handler({ messages: [], success: true } as any, {} as any);
  assertEq(db.getPendingObservations(10).length, 0, "nothing captured");
  db.close();
});

test("auto-capture skips when db is null", async () => {
  const handler = createAgentEndHandler(() => null, { info: () => {}, warn: () => {} } as any, 50);
  // Should not throw
  await handler({ messages: [{ role: "user", content: "long enough message here" }], success: true } as any, {} as any);
});

// ── SECTION 11: Edge Cases & Stress ──
console.log("\n⚡ Edge Cases & Stress");

test("concurrent upserts don't create duplicates", () => {
  const db = freshDb();
  // Simulate rapid upserts of same entity
  for (let i = 0; i < 100; i++) {
    db.upsertNode({ name: "Alice", type: "person", summary: `Iteration ${i} with longer text to test updates` });
  }
  assertEq(db.stats().nodes, 1, "still one Alice after 100 upserts");
  db.close();
});

test("many nodes and edges", () => {
  const db = freshDb();
  // Create 200 nodes
  for (let i = 0; i < 200; i++) {
    db.upsertNode({ name: `entity_${i}`, type: "tool", summary: `Tool number ${i}` });
  }
  // Create edges between consecutive nodes
  const nodes = db.getAllNodes();
  for (let i = 0; i < nodes.length - 1; i++) {
    db.upsertEdge(nodes[i].id, nodes[i + 1].id, "connects_to", "");
  }
  const stats = db.stats();
  assertEq(stats.nodes, 200, "200 nodes");
  assertEq(stats.edges, 199, "199 edges");
  // Search should still work
  const results = db.search("entity_50");
  assert(results.length > 0, "search works at scale");
  db.close();
});

test("unicode entity names", () => {
  const db = freshDb();
  db.upsertNode({ name: "日本語テスト", type: "place", summary: "Japanese" });
  db.upsertNode({ name: "Ñoño", type: "person", summary: "Spanish" });
  db.upsertNode({ name: "Ünïcödé", type: "tool", summary: "Diacritics" });
  assertEq(db.stats().nodes, 3, "unicode nodes created");
  const found = db.getNodeByName("日本語テスト");
  assert(found !== undefined, "found Japanese name");
  db.close();
});

test("SQL injection attempt in node name", () => {
  const db = freshDb();
  db.upsertNode({ name: "'; DROP TABLE nodes; --", type: "person", summary: "hacker" });
  assertEq(db.stats().nodes, 1, "table still exists, node created");
  const found = db.getNodeByName("'; drop table nodes; --");
  assert(found !== undefined, "found the injection attempt as a name");
  db.close();
});

test("SQL injection attempt in search", () => {
  const db = freshDb();
  db.upsertNode({ name: "Alice", type: "person", summary: "" });
  // These should not crash
  db.search("'; DROP TABLE nodes; --");
  db.search("\" OR 1=1 --");
  assertEq(db.stats().nodes, 1, "table survived injection attempts");
  db.close();
});

test("close and reopen (file-based)", () => {
  const path = "/tmp/agentsense-test-reopen.db";
  const db1 = new GraphDB(path);
  db1.initialize();
  db1.upsertNode({ name: "Persistent", type: "person", summary: "Should survive" });
  db1.close();

  const db2 = new GraphDB(path);
  db2.initialize();
  const found = db2.getNodeByName("persistent");
  assert(found !== undefined, "data persisted after close/reopen");
  db2.close();

  // Cleanup
  try { require("fs").unlinkSync(path); } catch {}
});

// ── Summary ──
console.log("\n" + "═".repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failures.length > 0) {
  console.log("❌ Failures:");
  failures.forEach(f => console.log(`   • ${f}`));
  console.log("");
  process.exit(1);
} else {
  console.log("✅ All tests passed!\n");
  process.exit(0);
}
