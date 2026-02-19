import { Type } from "@sinclair/typebox";
import type { GraphDB } from "../graph-db.js";
import type { GraphSearchResult } from "../types.js";

function formatResults(results: GraphSearchResult[]): string {
  if (results.length === 0) return "No matching entities found in the knowledge graph.";

  const lines: string[] = [];
  for (const { node, neighbors } of results) {
    lines.push(`## ${node.name} [${node.type}]`);
    if (node.summary) lines.push(`Summary: ${node.summary}`);
    lines.push(`ID: ${node.id} | Created: ${node.created_at} | Updated: ${node.updated_at}`);

    if (neighbors.length > 0) {
      lines.push("Relationships:");
      for (const n of neighbors) {
        const arrow = n.direction === "outgoing" ? "->" : "<-";
        lines.push(
          `  ${arrow} ${n.edge.relation} ${n.node.name} [${n.node.type}] (weight: ${n.edge.weight.toFixed(1)})`,
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function createGraphSearchTool(getDb: () => GraphDB | null) {
  return {
    name: "graph_search",
    label: "Knowledge Graph Search",
    description:
      "Search the knowledge graph for entities, people, projects, decisions, and their relationships. Use when you need to find connections between concepts or recall structured information about people, projects, or decisions discussed in previous conversations.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query (entity name, topic, or keyword)" }),
      type: Type.Optional(
        Type.String({
          description:
            "Filter by entity type: person, project, decision, event, idea, preference, place, tool, organization, company, agent, device, platform, skill, concept, habit, routine, subscription, service, credential, file, repository, website, contact, model, product, account",
        }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default: 5)", minimum: 1, maximum: 20 }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: { query: string; type?: string; limit?: number },
    ) {
      const db = getDb();
      if (!db) {
        return {
          content: [{ type: "text" as const, text: "Knowledge graph not available." }],
          details: { error: "db_not_initialized" },
        };
      }

      const { query, type, limit = 5 } = params;
      let results = db.search(query, limit * 2); // Fetch extra for filtering

      // Filter by type if specified
      if (type) {
        results = results.filter(
          (r) => r.node.type === type.toLowerCase(),
        );
      }

      results = results.slice(0, limit);

      const text = formatResults(results);
      const details = results.map(({ node, neighbors }) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        summary: node.summary,
        neighborCount: neighbors.length,
        relationships: neighbors.map((n) => ({
          direction: n.direction,
          relation: n.edge.relation,
          target: n.node.name,
          targetType: n.node.type,
          weight: n.edge.weight,
        })),
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${results.length} entities:\n\n${text}`,
          },
        ],
        details: { count: results.length, entities: details },
      };
    },
  };
}
