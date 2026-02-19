import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionResult, EntityType } from "./types.js";

const VALID_ENTITY_TYPES: EntityType[] = [
  "person",
  "project",
  "decision",
  "event",
  "idea",
  "preference",
  "place",
  "tool",
];

const EXTRACTION_PROMPT = `You are an entity extraction system. Given conversation text, extract entities and relationships into a knowledge graph.

Output ONLY valid JSON with this exact structure:
{
  "nodes": [
    {"name": "Entity Name", "type": "person|project|decision|event|idea|preference|place|tool", "summary": "Brief description"}
  ],
  "edges": [
    {"from": "Source Entity", "to": "Target Entity", "relation": "relationship type", "context": "Brief context"}
  ]
}

Rules:
- Extract concrete entities: people, projects, tools, places, decisions, events, ideas, preferences
- Use descriptive but concise relation types (e.g. "works_on", "decided_to_use", "prefers", "located_in")
- Every entity in an edge must appear in the nodes array
- Keep summaries under 100 characters
- If no entities found, return {"nodes": [], "edges": []}
- Output ONLY the JSON, no other text`;

export class EntityExtractor {
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async extract(text: string): Promise<ExtractionResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Extract entities and relationships from this conversation:\n\n${text}`,
        },
      ],
      system: EXTRACTION_PROMPT,
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return { nodes: [], edges: [] };
    }

    return parseExtractionResponse(content.text);
  }
}

function parseExtractionResponse(text: string): ExtractionResult {
  // Try to extract JSON from the response
  let jsonStr = text.trim();

  // Handle markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to find JSON object boundaries
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { nodes: [], edges: [] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { nodes: [], edges: [] };
  }

  const obj = parsed as Record<string, unknown>;
  const result: ExtractionResult = { nodes: [], edges: [] };

  // Validate and sanitize nodes
  if (Array.isArray(obj.nodes)) {
    for (const node of obj.nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as Record<string, unknown>;

      if (typeof n.name !== "string" || !n.name.trim()) continue;

      const type = (
        typeof n.type === "string" && VALID_ENTITY_TYPES.includes(n.type as EntityType)
          ? n.type
          : "idea"
      ) as EntityType;

      result.nodes.push({
        name: n.name.trim().slice(0, 200),
        type,
        summary: typeof n.summary === "string" ? n.summary.trim().slice(0, 500) : "",
      });
    }
  }

  // Validate and sanitize edges
  if (Array.isArray(obj.edges)) {
    const nodeNames = new Set(result.nodes.map((n) => n.name.toLowerCase()));

    for (const edge of obj.edges) {
      if (!edge || typeof edge !== "object") continue;
      const e = edge as Record<string, unknown>;

      if (
        typeof e.from !== "string" ||
        typeof e.to !== "string" ||
        typeof e.relation !== "string"
      ) {
        continue;
      }

      // Only include edges where both endpoints exist in extracted nodes
      if (
        !nodeNames.has(e.from.trim().toLowerCase()) ||
        !nodeNames.has(e.to.trim().toLowerCase())
      ) {
        continue;
      }

      result.edges.push({
        from: e.from.trim().slice(0, 200),
        to: e.to.trim().slice(0, 200),
        relation: e.relation.trim().slice(0, 100),
        context: typeof e.context === "string" ? e.context.trim().slice(0, 500) : "",
      });
    }
  }

  return result;
}
