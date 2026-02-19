import { describe, it, expect } from "vitest";
import { parseExtractionResponse, VALID_ENTITY_TYPES, EXTRACTION_PROMPT } from "../extractor.js";

describe("parseExtractionResponse", () => {
  it("should parse valid JSON", () => {
    const result = parseExtractionResponse(JSON.stringify({
      nodes: [{ name: "Alice", type: "person", summary: "A person" }],
      edges: [{ from: "Alice", to: "Alice", relation: "self", context: "" }],
    }));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe("Alice");
  });

  it("should handle markdown code blocks", () => {
    const result = parseExtractionResponse('```json\n{"nodes":[{"name":"Test","type":"tool","summary":""}],"edges":[]}\n```');
    expect(result.nodes).toHaveLength(1);
  });

  it("should return empty for garbage input", () => {
    const result = parseExtractionResponse("this is not json at all");
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("should default unknown types to idea", () => {
    const result = parseExtractionResponse(JSON.stringify({
      nodes: [{ name: "Thing", type: "unknown_type", summary: "" }],
      edges: [],
    }));
    expect(result.nodes[0].type).toBe("idea");
  });

  it("should accept all 27 valid entity types", () => {
    for (const type of VALID_ENTITY_TYPES) {
      const result = parseExtractionResponse(JSON.stringify({
        nodes: [{ name: `test-${type}`, type, summary: "" }],
        edges: [],
      }));
      expect(result.nodes[0].type).toBe(type);
    }
  });

  it("should truncate long names to 200 chars", () => {
    const longName = "x".repeat(300);
    const result = parseExtractionResponse(JSON.stringify({
      nodes: [{ name: longName, type: "person", summary: "" }],
      edges: [],
    }));
    expect(result.nodes[0].name).toHaveLength(200);
  });

  it("should truncate long summaries to 500 chars", () => {
    const longSummary = "y".repeat(600);
    const result = parseExtractionResponse(JSON.stringify({
      nodes: [{ name: "Test", type: "person", summary: longSummary }],
      edges: [],
    }));
    expect(result.nodes[0].summary).toHaveLength(500);
  });

  it("should skip edges where nodes are missing", () => {
    const result = parseExtractionResponse(JSON.stringify({
      nodes: [{ name: "Alice", type: "person", summary: "" }],
      edges: [{ from: "Alice", to: "MissingNode", relation: "knows", context: "" }],
    }));
    expect(result.edges).toHaveLength(0);
  });

  it("should handle empty nodes/edges arrays", () => {
    const result = parseExtractionResponse(JSON.stringify({ nodes: [], edges: [] }));
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("should skip nodes without names", () => {
    const result = parseExtractionResponse(JSON.stringify({
      nodes: [
        { name: "", type: "person", summary: "" },
        { name: "Valid", type: "person", summary: "" },
      ],
      edges: [],
    }));
    expect(result.nodes).toHaveLength(1);
  });

  it("should handle JSON with surrounding text", () => {
    const result = parseExtractionResponse('Here is the result: {"nodes":[{"name":"X","type":"tool","summary":""}],"edges":[]} end');
    expect(result.nodes).toHaveLength(1);
  });
});

describe("EXTRACTION_PROMPT", () => {
  it("should mention all 27 entity types", () => {
    for (const type of VALID_ENTITY_TYPES) {
      expect(EXTRACTION_PROMPT).toContain(type);
    }
  });

  it("should request JSON output", () => {
    expect(EXTRACTION_PROMPT).toContain("JSON");
  });
});
