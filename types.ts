export type EntityType =
  | "person"
  | "project"
  | "decision"
  | "event"
  | "idea"
  | "preference"
  | "place"
  | "tool";

export type GraphNode = {
  id: number;
  name: string;
  type: EntityType;
  summary: string;
  metadata: string;
  created_at: string;
  updated_at: string;
};

export type GraphEdge = {
  id: number;
  source_id: number;
  target_id: number;
  relation: string;
  weight: number;
  context: string;
  created_at: string;
  updated_at: string;
};

export type Observation = {
  id: number;
  source: string;
  raw_text: string;
  entities_json: string;
  session_key: string;
  processed_at: string;
};

export type ExtractedNode = {
  name: string;
  type: EntityType;
  summary: string;
};

export type ExtractedEdge = {
  from: string;
  to: string;
  relation: string;
  context: string;
};

export type ExtractionResult = {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
};

export type GraphSearchResult = {
  node: GraphNode;
  neighbors: Array<{
    node: GraphNode;
    edge: GraphEdge;
    direction: "outgoing" | "incoming";
  }>;
  score?: number;
};
