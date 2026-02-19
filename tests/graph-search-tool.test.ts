import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createGraphSearchTool } from "../tools/graph-search.js";
import { GraphDB } from "../graph-db.js";
import { VALID_ENTITY_TYPES } from "../extractor.js";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("graph_search tool", () => {
  let db: GraphDB;
  let dbPath: string;
  let tool: ReturnType<typeof createGraphSearchTool>;

  beforeEach(() => {
    dbPath = join(tmpdir(), `agentsense-tool-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new GraphDB(dbPath);
    db.initialize();
    tool = createGraphSearchTool(() => db);
  });

  afterEach(() => {
    db.close();
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  });

  it("should have correct name and description", () => {
    expect(tool.name).toBe("graph_search");
    expect(tool.description).toContain("knowledge graph");
  });

  it("should mention all 27 types in parameter description", () => {
    // Types are listed in the type parameter description, not the main description
    const schema = tool.parameters as any;
    const typeDesc = schema.properties?.type?.description ?? "";
    for (const type of VALID_ENTITY_TYPES) {
      expect(typeDesc).toContain(type);
    }
  });

  it("should return results for matching query", async () => {
    db.upsertNode({ name: "Opus", type: "model", summary: "Large language model" });
    const result = await tool.execute("call-1", { query: "Opus" });
    expect(result.content[0].text).toContain("opus");
    expect(result.details.count).toBe(1);
  });

  it("should filter by type", async () => {
    db.upsertNode({ name: "Opus", type: "model", summary: "" });
    db.upsertNode({ name: "Opus Plugin", type: "tool", summary: "" });
    const result = await tool.execute("call-2", { query: "Opus", type: "model" });
    expect(result.details.count).toBe(1);
    expect(result.details.entities[0].type).toBe("model");
  });

  it("should return empty when no matches", async () => {
    const result = await tool.execute("call-3", { query: "nonexistent" });
    expect(result.details.count).toBe(0);
    expect(result.content[0].text).toContain("No matching");
  });

  it("should handle null db gracefully", async () => {
    const nullTool = createGraphSearchTool(() => null);
    const result = await nullTool.execute("call-4", { query: "test" });
    expect(result.content[0].text).toContain("not available");
  });

  it("should respect limit parameter", async () => {
    for (let i = 0; i < 10; i++) {
      db.upsertNode({ name: `item-${i}`, type: "concept", summary: "test item" });
    }
    const result = await tool.execute("call-5", { query: "item", limit: 3 });
    expect(result.details.count).toBeLessThanOrEqual(3);
  });
});
