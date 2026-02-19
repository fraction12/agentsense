import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GraphDB } from "../graph-db.js";
import { VALID_ENTITY_TYPES } from "../extractor.js";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { EntityType } from "../types.js";

function createTestDb(): { db: GraphDB; path: string } {
  const path = join(tmpdir(), `agentsense-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new GraphDB(path);
  db.initialize();
  return { db, path };
}

function cleanup(path: string) {
  try { unlinkSync(path); } catch {}
  try { unlinkSync(path + "-wal"); } catch {}
  try { unlinkSync(path + "-shm"); } catch {}
}

describe("GraphDB", () => {
  let db: GraphDB;
  let dbPath: string;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    dbPath = t.path;
  });

  afterEach(() => {
    db.close();
    cleanup(dbPath);
  });

  describe("initialization", () => {
    it("should initialize without error", () => {
      expect(db.stats()).toEqual({ nodes: 0, edges: 0, observations: 0 });
    });

    it("should be idempotent", () => {
      db.initialize(); // second call
      expect(db.stats()).toEqual({ nodes: 0, edges: 0, observations: 0 });
    });
  });

  describe("upsertNode", () => {
    it("should insert a new node", () => {
      const node = db.upsertNode({ name: "Alice", type: "person", summary: "A person" });
      expect(node.name).toBe("alice");
      expect(node.type).toBe("person");
      expect(node.summary).toBe("A person");
      expect(db.stats().nodes).toBe(1);
    });

    it("should normalize names to lowercase", () => {
      db.upsertNode({ name: "Claude Opus", type: "model", summary: "" });
      const found = db.getNodeByName("claude opus");
      expect(found).toBeDefined();
      expect(found!.name).toBe("claude opus");
    });

    it("should update existing node with longer summary", () => {
      db.upsertNode({ name: "Test", type: "tool", summary: "Short" });
      db.upsertNode({ name: "Test", type: "tool", summary: "A much longer summary" });
      const node = db.getNodeByName("test");
      expect(node!.summary).toBe("A much longer summary");
    });

    it("should not replace summary with shorter one", () => {
      db.upsertNode({ name: "Test", type: "tool", summary: "A long summary here" });
      db.upsertNode({ name: "Test", type: "tool", summary: "Short" });
      const node = db.getNodeByName("test");
      expect(node!.summary).toBe("A long summary here");
    });

    it("should support all 27 entity types", () => {
      for (const type of VALID_ENTITY_TYPES) {
        const node = db.upsertNode({ name: `test-${type}`, type: type as EntityType, summary: `A ${type}` });
        expect(node.type).toBe(type);
      }
      expect(db.stats().nodes).toBe(27);
    });
  });

  describe("upsertEdge", () => {
    it("should create an edge between nodes", () => {
      const a = db.upsertNode({ name: "Jarvis", type: "agent", summary: "" });
      const b = db.upsertNode({ name: "Mac Mini", type: "device", summary: "" });
      const edge = db.upsertEdge(a.id, b.id, "runs_on", "Always-on server");
      expect(edge.relation).toBe("runs_on");
      expect(edge.weight).toBe(1.0);
      expect(db.stats().edges).toBe(1);
    });

    it("should increment weight on duplicate edge", () => {
      const a = db.upsertNode({ name: "A", type: "person", summary: "" });
      const b = db.upsertNode({ name: "B", type: "project", summary: "" });
      db.upsertEdge(a.id, b.id, "works_on");
      const edge2 = db.upsertEdge(a.id, b.id, "works_on");
      expect(edge2.weight).toBe(1.1);
    });

    it("should cap weight at 5.0", () => {
      const a = db.upsertNode({ name: "A", type: "person", summary: "" });
      const b = db.upsertNode({ name: "B", type: "tool", summary: "" });
      for (let i = 0; i < 50; i++) {
        db.upsertEdge(a.id, b.id, "uses");
      }
      const neighbors = db.getNeighbors(a.id);
      expect(neighbors[0].edge.weight).toBeLessThanOrEqual(5.0);
    });
  });

  describe("observations", () => {
    it("should add an observation", () => {
      db.addObservation("agent", "Some text", "", "session-1");
      expect(db.stats().observations).toBe(1);
    });

    it("should get pending observations (empty entities_json)", () => {
      db.addObservation("agent", "Pending text", "", "s1");
      db.addObservation("agent", "Done text", '{"nodes":[]}', "s2");
      const pending = db.getPendingObservations();
      expect(pending).toHaveLength(1);
      expect(pending[0].raw_text).toBe("Pending text");
    });

    it("should mark observation as processed", () => {
      db.addObservation("agent", "Text", "", "s1");
      const pending = db.getPendingObservations();
      db.markObservationProcessed(pending[0].id, '{"nodes":[]}');
      expect(db.getPendingObservations()).toHaveLength(0);
    });
  });

  describe("search", () => {
    it("should find nodes by FTS", () => {
      db.upsertNode({ name: "Claude Max", type: "subscription", summary: "AI subscription plan" });
      db.upsertNode({ name: "Netflix", type: "subscription", summary: "Streaming service" });
      const results = db.search("Claude");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].node.name).toBe("claude max");
    });

    it("should fall back to LIKE search", () => {
      db.upsertNode({ name: "test-special", type: "tool", summary: "xyz unique" });
      // FTS might not match partial, LIKE should
      const results = db.search("unique");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should include neighbors in results", () => {
      const a = db.upsertNode({ name: "Haiku", type: "model", summary: "Fast model" });
      const b = db.upsertNode({ name: "AgentSense", type: "tool", summary: "Knowledge graph" });
      db.upsertEdge(b.id, a.id, "runs_on", "Extraction cron");
      const results = db.search("Haiku");
      expect(results[0].neighbors.length).toBe(1);
      expect(results[0].neighbors[0].edge.relation).toBe("runs_on");
    });
  });

  describe("getNeighbors", () => {
    it("should return both incoming and outgoing edges", () => {
      const a = db.upsertNode({ name: "A", type: "person", summary: "" });
      const b = db.upsertNode({ name: "B", type: "project", summary: "" });
      const c = db.upsertNode({ name: "C", type: "tool", summary: "" });
      db.upsertEdge(a.id, b.id, "works_on");
      db.upsertEdge(c.id, a.id, "used_by");
      const neighbors = db.getNeighbors(a.id);
      expect(neighbors).toHaveLength(2);
      const directions = neighbors.map(n => n.direction).sort();
      expect(directions).toEqual(["incoming", "outgoing"]);
    });
  });

  describe("ingestExtraction", () => {
    it("should ingest nodes and edges in a transaction", () => {
      const result = db.ingestExtraction(
        [
          { name: "Dushyant", type: "person", summary: "Human" },
          { name: "ClawK", type: "product", summary: "macOS app" },
        ],
        [
          { from: "Dushyant", to: "ClawK", relation: "owns", context: "" },
        ],
        "Dushyant owns ClawK",
        "session-1",
      );
      expect(result.nodesUpserted).toBe(2);
      expect(result.edgesUpserted).toBe(1);
      expect(db.stats().nodes).toBe(2);
      expect(db.stats().edges).toBe(1);
      expect(db.stats().observations).toBe(1);
    });
  });

  describe("getAllNodes", () => {
    it("should filter by type", () => {
      db.upsertNode({ name: "Opus", type: "model", summary: "" });
      db.upsertNode({ name: "Haiku", type: "model", summary: "" });
      db.upsertNode({ name: "Jarvis", type: "agent", summary: "" });
      expect(db.getAllNodes("model")).toHaveLength(2);
      expect(db.getAllNodes("agent")).toHaveLength(1);
    });

    it("should return all nodes without filter", () => {
      db.upsertNode({ name: "A", type: "person", summary: "" });
      db.upsertNode({ name: "B", type: "tool", summary: "" });
      expect(db.getAllNodes()).toHaveLength(2);
    });
  });

  describe("export", () => {
    it("should export all data", () => {
      db.upsertNode({ name: "Test", type: "concept", summary: "A concept" });
      db.addObservation("agent", "text", "", "s1");
      const exported = db.export();
      expect(exported.nodes).toHaveLength(1);
      expect(exported.observations).toHaveLength(1);
    });
  });

  describe("clear", () => {
    it("should remove all data", () => {
      db.upsertNode({ name: "A", type: "person", summary: "" });
      db.addObservation("agent", "text", "", "s1");
      db.clear();
      expect(db.stats()).toEqual({ nodes: 0, edges: 0, observations: 0 });
    });
  });
});
