# AgentSense Knowledge Graph

Use `graph_search` to find entities, people, projects, organizations, decisions, and their relationships from past conversations.

## When to use graph_search vs memory_search
- **graph_search**: Structured lookups — "who works on X?", "what did we decide about Y?", "what company does Z work for?"
- **memory_search**: Free-text recall — "what did the user say about deployment?", general preference lookups

## Query patterns
- **Relationship lookup**: `graph_search("Alice")` — find a person and all their connections
- **Project context**: `graph_search("ProjectName", type="project")` — find project details and related entities
- **Organization lookup**: `graph_search("Letterhead", type="organization")` — find companies and their connections
- **Decision audit**: `graph_search("migration", type="decision")` — find decisions about a topic
- **Pre-conversation context**: Search for a person before replying to refresh relationship context
- **Risk scan**: Search for a technology or tool to find past decisions and known issues

## Important notes
- The graph is **persistent across sessions** — entities survive compaction and session resets
- Data is captured **automatically** from conversations — you don't need to feed it manually
- There is no manual `graph_add` tool — entities are extracted by the auto-capture hooks
- Use `graph_search` alongside `memory_search` — they complement each other (graph = structured relationships, memory = freeform notes)
