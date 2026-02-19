# AgentSense Knowledge Graph

Use `graph_search` to find entities, people, projects, decisions, and their relationships from past conversations.

## When to use graph_search vs memory_search
- **graph_search**: Structured lookups — "who works on X?", "what did we decide about Y?", "what tools does Z use?"
- **memory_search**: Free-text recall — "what did the user say about deployment?", general preference lookups

## Query patterns
- **Relationship lookup**: `graph_search("Alice")` — find a person and all their connections
- **Project context**: `graph_search("ProjectName", type="project")` — find project details and related entities
- **Decision audit**: `graph_search("migration", type="decision")` — find decisions about a topic
- **Pre-conversation context**: Search for the user's name or current project before starting work
- **Risk scan**: Search for a technology or tool to find past decisions and known issues
