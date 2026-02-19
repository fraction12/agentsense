import Database from "better-sqlite3";
import type {
  EntityType,
  GraphNode,
  GraphEdge,
  Observation,
  ExtractedNode,
  ExtractedEdge,
  GraphSearchResult,
} from "./types.js";

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

export class GraphDB {
  private db: Database.Database | null = null;

  constructor(private readonly dbPath: string) {}

  initialize(): void {
    if (this.db) return;

    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);

      CREATE TABLE IF NOT EXISTS edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        target_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        relation TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        context TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique ON edges(source_id, target_id, relation);

      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL DEFAULT 'agent',
        raw_text TEXT NOT NULL,
        entities_json TEXT NOT NULL DEFAULT '{}',
        session_key TEXT NOT NULL DEFAULT '',
        processed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(session_key);
    `);

    // FTS5 virtual table for full-text search on nodes
    const ftsExists = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='nodes_fts'",
      )
      .get();

    if (!ftsExists) {
      this.db.exec(`
        CREATE VIRTUAL TABLE nodes_fts USING fts5(
          name,
          summary,
          type,
          content=nodes,
          content_rowid=id
        );

        CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
          INSERT INTO nodes_fts(rowid, name, summary, type)
          VALUES (new.id, new.name, new.summary, new.type);
        END;

        CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
          INSERT INTO nodes_fts(nodes_fts, rowid, name, summary, type)
          VALUES ('delete', old.id, old.name, old.summary, old.type);
        END;

        CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
          INSERT INTO nodes_fts(nodes_fts, rowid, name, summary, type)
          VALUES ('delete', old.id, old.name, old.summary, old.type);
          INSERT INTO nodes_fts(rowid, name, summary, type)
          VALUES (new.id, new.name, new.summary, new.type);
        END;
      `);

      // Backfill FTS from existing nodes
      this.db.exec(`
        INSERT INTO nodes_fts(rowid, name, summary, type)
        SELECT id, name, summary, type FROM nodes;
      `);
    }
  }

  private ensureDb(): Database.Database {
    if (!this.db) {
      throw new Error("GraphDB not initialized. Call initialize() first.");
    }
    return this.db;
  }

  upsertNode(node: ExtractedNode): GraphNode {
    const db = this.ensureDb();
    const normalized = normalizeName(node.name);

    const existing = db
      .prepare("SELECT * FROM nodes WHERE name = ?")
      .get(normalized) as GraphNode | undefined;

    if (existing) {
      const newSummary =
        node.summary && node.summary.length > existing.summary.length
          ? node.summary
          : existing.summary;
      const newType = node.type || existing.type;

      db.prepare(
        "UPDATE nodes SET summary = ?, type = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(newSummary, newType, existing.id);

      return {
        ...existing,
        summary: newSummary,
        type: newType as EntityType,
        updated_at: new Date().toISOString(),
      };
    }

    const result = db
      .prepare(
        "INSERT INTO nodes (name, type, summary, metadata) VALUES (?, ?, ?, ?)",
      )
      .run(normalized, node.type, node.summary || "", "{}");

    return {
      id: result.lastInsertRowid as number,
      name: normalized,
      type: node.type,
      summary: node.summary || "",
      metadata: "{}",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  upsertEdge(
    sourceId: number,
    targetId: number,
    relation: string,
    context: string = "",
    weight: number = 1.0,
  ): GraphEdge {
    const db = this.ensureDb();
    const normalizedRelation = relation.toLowerCase().trim();

    const existing = db
      .prepare(
        "SELECT * FROM edges WHERE source_id = ? AND target_id = ? AND relation = ?",
      )
      .get(sourceId, targetId, normalizedRelation) as GraphEdge | undefined;

    if (existing) {
      const newWeight = Math.min(existing.weight + 0.1, 5.0);
      const newContext =
        context && context.length > existing.context.length
          ? context
          : existing.context;

      db.prepare(
        "UPDATE edges SET weight = ?, context = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(newWeight, newContext, existing.id);

      return {
        ...existing,
        weight: newWeight,
        context: newContext,
        updated_at: new Date().toISOString(),
      };
    }

    const result = db
      .prepare(
        "INSERT INTO edges (source_id, target_id, relation, weight, context) VALUES (?, ?, ?, ?, ?)",
      )
      .run(sourceId, targetId, normalizedRelation, weight, context);

    return {
      id: result.lastInsertRowid as number,
      source_id: sourceId,
      target_id: targetId,
      relation: normalizedRelation,
      weight,
      context,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  addObservation(
    source: string,
    rawText: string,
    entitiesJson: string,
    sessionKey: string,
  ): Observation {
    const db = this.ensureDb();

    const result = db
      .prepare(
        "INSERT INTO observations (source, raw_text, entities_json, session_key) VALUES (?, ?, ?, ?)",
      )
      .run(source, rawText, entitiesJson, sessionKey);

    return {
      id: result.lastInsertRowid as number,
      source,
      raw_text: rawText,
      entities_json: entitiesJson,
      session_key: sessionKey,
      processed_at: new Date().toISOString(),
    };
  }

  search(query: string, limit: number = 10): GraphSearchResult[] {
    const db = this.ensureDb();

    // Build FTS5 query: quote each word and OR them
    const ftsQuery = query
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `"${w.replace(/"/g, '""')}"`)
      .join(" OR ");

    let nodeRows: GraphNode[] = [];

    if (ftsQuery) {
      nodeRows = db
        .prepare(
          `SELECT n.*, rank
           FROM nodes_fts fts
           JOIN nodes n ON n.id = fts.rowid
           WHERE nodes_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(ftsQuery, limit) as GraphNode[];
    }

    // Fallback to LIKE search if FTS returned nothing
    if (nodeRows.length === 0) {
      const likePattern = `%${query.toLowerCase()}%`;
      nodeRows = db
        .prepare(
          `SELECT * FROM nodes
           WHERE name LIKE ? OR summary LIKE ?
           ORDER BY updated_at DESC
           LIMIT ?`,
        )
        .all(likePattern, likePattern, limit) as GraphNode[];
    }

    return nodeRows.map((node) => ({
      node,
      neighbors: this.getNeighbors(node.id),
    }));
  }

  getNeighbors(
    nodeId: number,
  ): Array<{
    node: GraphNode;
    edge: GraphEdge;
    direction: "outgoing" | "incoming";
  }> {
    const db = this.ensureDb();

    const outgoing = db
      .prepare(
        `SELECT e.*, n.id as n_id, n.name as n_name, n.type as n_type,
                n.summary as n_summary, n.metadata as n_metadata,
                n.created_at as n_created_at, n.updated_at as n_updated_at
         FROM edges e
         JOIN nodes n ON n.id = e.target_id
         WHERE e.source_id = ?
         ORDER BY e.weight DESC`,
      )
      .all(nodeId) as Array<Record<string, unknown>>;

    const incoming = db
      .prepare(
        `SELECT e.*, n.id as n_id, n.name as n_name, n.type as n_type,
                n.summary as n_summary, n.metadata as n_metadata,
                n.created_at as n_created_at, n.updated_at as n_updated_at
         FROM edges e
         JOIN nodes n ON n.id = e.source_id
         WHERE e.target_id = ?
         ORDER BY e.weight DESC`,
      )
      .all(nodeId) as Array<Record<string, unknown>>;

    const mapRow = (
      row: Record<string, unknown>,
      direction: "outgoing" | "incoming",
    ) => ({
      node: {
        id: row.n_id as number,
        name: row.n_name as string,
        type: row.n_type as EntityType,
        summary: row.n_summary as string,
        metadata: row.n_metadata as string,
        created_at: row.n_created_at as string,
        updated_at: row.n_updated_at as string,
      },
      edge: {
        id: row.id as number,
        source_id: row.source_id as number,
        target_id: row.target_id as number,
        relation: row.relation as string,
        weight: row.weight as number,
        context: row.context as string,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      },
      direction,
    });

    return [
      ...outgoing.map((r) => mapRow(r, "outgoing")),
      ...incoming.map((r) => mapRow(r, "incoming")),
    ];
  }

  getNode(id: number): GraphNode | undefined {
    const db = this.ensureDb();
    return db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as
      | GraphNode
      | undefined;
  }

  getNodeByName(name: string): GraphNode | undefined {
    const db = this.ensureDb();
    return db
      .prepare("SELECT * FROM nodes WHERE name = ?")
      .get(normalizeName(name)) as GraphNode | undefined;
  }

  getAllNodes(type?: string): GraphNode[] {
    const db = this.ensureDb();
    if (type) {
      return db
        .prepare("SELECT * FROM nodes WHERE type = ? ORDER BY updated_at DESC")
        .all(type.toLowerCase()) as GraphNode[];
    }
    return db
      .prepare("SELECT * FROM nodes ORDER BY updated_at DESC")
      .all() as GraphNode[];
  }

  stats(): { nodes: number; edges: number; observations: number } {
    const db = this.ensureDb();
    const nodes = (
      db.prepare("SELECT COUNT(*) as count FROM nodes").get() as {
        count: number;
      }
    ).count;
    const edges = (
      db.prepare("SELECT COUNT(*) as count FROM edges").get() as {
        count: number;
      }
    ).count;
    const observations = (
      db.prepare("SELECT COUNT(*) as count FROM observations").get() as {
        count: number;
      }
    ).count;
    return { nodes, edges, observations };
  }

  clear(): void {
    const db = this.ensureDb();
    db.exec("DELETE FROM edges");
    db.exec("DELETE FROM observations");
    db.exec("DELETE FROM nodes");
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  ingestExtraction(
    nodes: ExtractedNode[],
    edges: ExtractedEdge[],
    rawText: string,
    sessionKey: string,
  ): { nodesUpserted: number; edgesUpserted: number } {
    const db = this.ensureDb();
    let nodesUpserted = 0;
    let edgesUpserted = 0;

    const txn = db.transaction(() => {
      const nameToId = new Map<string, number>();
      for (const node of nodes) {
        const upserted = this.upsertNode(node);
        nameToId.set(normalizeName(node.name), upserted.id);
        nodesUpserted++;
      }

      for (const edge of edges) {
        const sourceId = nameToId.get(normalizeName(edge.from));
        const targetId = nameToId.get(normalizeName(edge.to));
        if (sourceId !== undefined && targetId !== undefined) {
          this.upsertEdge(sourceId, targetId, edge.relation, edge.context);
          edgesUpserted++;
        }
      }

      this.addObservation(
        "agent",
        rawText.slice(0, 2000),
        JSON.stringify({ nodes, edges }),
        sessionKey,
      );
    });

    txn();

    return { nodesUpserted, edgesUpserted };
  }

  export(): {
    nodes: GraphNode[];
    edges: GraphEdge[];
    observations: Observation[];
  } {
    const db = this.ensureDb();
    const nodes = db
      .prepare("SELECT * FROM nodes ORDER BY id")
      .all() as GraphNode[];
    const edges = db
      .prepare("SELECT * FROM edges ORDER BY id")
      .all() as GraphEdge[];
    const observations = db
      .prepare("SELECT * FROM observations ORDER BY id")
      .all() as Observation[];
    return { nodes, edges, observations };
  }
}
