# Extraction Cron Setup

AgentSense captures conversation text automatically. To extract entities and build the graph, you need an LLM running on a schedule.

## The Approach

An OpenClaw cron job spawns an isolated agent session (e.g., Haiku) that:
1. Reads pending observations from SQLite
2. Extracts entities and relationships
3. Writes them to the nodes/edges tables
4. Marks observations as processed

## Creating the Cron

Use `openclaw cron add` or create via the API. Key settings:

```json
{
  "name": "AgentSense: Knowledge Graph Extraction",
  "schedule": { "kind": "cron", "expr": "15 * * * *", "tz": "America/New_York" },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "model": "haiku",
    "message": "<see prompt below>",
    "timeoutSeconds": 300
  },
  "delivery": { "mode": "none" }
}
```

## The Extraction Prompt

This prompt is deliberately prescriptive. Smaller models (Haiku-class) need explicit SQL commands — a vague prompt results in the model logging what it *would* do without actually doing it.

```
You are a knowledge graph extraction worker for AgentSense.

DB path: ~/.openclaw/memory/agentsense.db
Tool: sqlite3 (use exec tool)

You MUST follow this EXACT sequence. Do NOT skip steps. Do NOT combine steps.

## STEP 1: Get pending observations

Run this exact command:
sqlite3 ~/.openclaw/memory/agentsense.db "SELECT id, substr(raw_text, 1, 200) FROM observations WHERE entities_json = '' ORDER BY id LIMIT 10;"

If zero rows: reply EXTRACTION_OK and stop.

## STEP 2: Process EACH observation one at a time

For each observation ID from Step 1:

### 2a. Read the full text
sqlite3 ~/.openclaw/memory/agentsense.db "SELECT raw_text FROM observations WHERE id = <ID>;"

### 2b. Identify entities
Read the text carefully. Find every person, project, tool, company, organization, decision, event, idea, preference, place, agent, device, platform, skill, concept, habit, routine, subscription, service, credential, file, repository, website, contact, model, product, or account mentioned.

### 2c. INSERT each entity into the nodes table
For EACH entity you found, first check if it exists:
sqlite3 ~/.openclaw/memory/agentsense.db "SELECT id, name FROM nodes WHERE lower(name) = lower('<name>');"

If it does NOT exist, INSERT it:
sqlite3 ~/.openclaw/memory/agentsense.db "INSERT INTO nodes (name, type, summary) VALUES ('<lowercase_name>', '<type>', '<summary>');"

If it DOES exist and you have a better summary, UPDATE it:
sqlite3 ~/.openclaw/memory/agentsense.db "UPDATE nodes SET summary = '<summary>', updated_at = datetime('now') WHERE id = <id>;"

You MUST run the INSERT or UPDATE command. Do NOT skip this.

### 2d. INSERT each relationship into the edges table
For each relationship between two entities:
sqlite3 ~/.openclaw/memory/agentsense.db "INSERT OR IGNORE INTO edges (source_id, target_id, relation, context) SELECT s.id, t.id, '<relation>', '<context>' FROM nodes s, nodes t WHERE lower(s.name) = lower('<source_name>') AND lower(t.name) = lower('<target_name>');"

### 2e. Mark observation processed
After inserting ALL nodes and edges for this observation:
sqlite3 ~/.openclaw/memory/agentsense.db "UPDATE observations SET entities_json = '<json_summary>' WHERE id = <ID>;"

## STEP 3: Verify and report

After processing ALL observations, run:
sqlite3 ~/.openclaw/memory/agentsense.db "SELECT COUNT(*) FROM nodes; SELECT COUNT(*) FROM edges; SELECT COUNT(*) FROM observations WHERE entities_json = '';"

Reply: EXTRACTION_DONE: X nodes, Y edges, Z pending

## RULES
1. Entity names MUST be lowercase
2. Escape single quotes: ' becomes ''
3. You MUST actually run the SQL commands — writing JSON metadata alone is NOT enough
4. Process observations one at a time
5. Maximum 10 observations per run
6. If sqlite3 gives an error, log it and continue
7. If text has no entities, mark it processed with {"nodes":[],"edges":[]}
```

## Model Recommendations

| Model | Cost | Quality | Notes |
|-------|------|---------|-------|
| Haiku | Free (Claude Max) | Good with strict prompt | Needs prescriptive SQL commands |
| Sonnet | Free (Claude Max) | Better | More reliable entity identification |
| Kimi K2.5 | ~$0.40/session | Good | Doesn't use Anthropic quota |
| GPT-4o-mini | Pay per token | Good | Alternative provider |

## Tuning

- **Frequency:** Hourly is good for active use. Daily works for light use.
- **Batch size:** 10 observations per run prevents timeout. Increase if your model is fast.
- **Timeout:** 300 seconds handles 10 observations comfortably.
