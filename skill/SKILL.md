# AgentSense Knowledge Graph

Use `graph_search` to find entities and their relationships from past conversations.

## Supported entity types (27)
person, project, decision, event, idea, preference, place, tool, organization, company, agent, device, platform, skill, concept, habit, routine, subscription, service, credential, file, repository, website, contact, model, product, account

## When to use graph_search vs memory_search
- **graph_search**: Structured lookups — "who works on X?", "what did we decide about Y?", "what company does Z work for?"
- **memory_search**: Free-text recall — "what did the user say about deployment?", general preference lookups

## Query patterns
- **Relationship lookup**: `graph_search("Alice")` — find a person and all their connections
- **Project context**: `graph_search("ProjectName", type="project")` — find project details and related entities
- **Organization lookup**: `graph_search("Acme Corp", type="organization")` — find companies and their connections
- **Decision audit**: `graph_search("migration", type="decision")` — find decisions about a topic
- **Model lookup**: `graph_search("Haiku", type="model")` — find AI models and their usage
- **Device check**: `graph_search("Mac Mini", type="device")` — find devices and specs
- **Subscription check**: `graph_search("Claude", type="subscription")` — find active subscriptions
- **Pre-conversation context**: Search for a person before replying to refresh relationship context
- **Risk scan**: Search for a technology or tool to find past decisions and known issues

## `/graph` Command

When Sir sends `/graph` (with or without arguments), handle it directly:

- `/graph` — run `sqlite3 ~/.openclaw/memory/agentsense.db` to get counts from nodes, edges, observations tables. Show stats overview.
- `/graph search <query>` — use `graph_search` tool or FTS query to find matching entities. Show name, type, summary, relationships.
- `/graph recent` — query `SELECT name, type, summary, updated_at FROM nodes ORDER BY updated_at DESC LIMIT 10`
- `/graph connections <name>` — find the node, then query edges (both directions) to show all relationships.
- `/graph types` — query `SELECT type, COUNT(*) FROM nodes GROUP BY type ORDER BY COUNT(*) DESC`

Format results cleanly with emoji and markdown for Telegram readability.

## Important notes
- The graph is **persistent across sessions** — entities survive compaction and session resets
- Data is captured **automatically** from conversations — you don't need to feed it manually
- There is no manual `graph_add` tool — entities are extracted by the auto-capture hooks
- Use `graph_search` alongside `memory_search` — they complement each other (graph = structured relationships, memory = freeform notes)
