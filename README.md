# 🧠 AgentSense

**Your AI agent doesn't just talk. It *remembers* who, what, and how things connect.**

AgentSense is a knowledge graph memory plugin for [OpenClaw](https://github.com/openclaw/openclaw). It watches your conversations, extracts the people, projects, tools, and decisions you discuss, and weaves them into a persistent web of relationships your agent can query instantly.

Think of it as giving your agent a second brain — not a pile of notes, but a map of your world.

---

## Why?

OpenClaw already has memory. It chunks your markdown files, embeds them, and searches semantically. That's good for *"what did we talk about?"*

But it can't answer *"who's connected to what?"*

AgentSense can.

```
You: Tell me about Brandon

graph_search → brandon watkins [person]
                → partner → tradespec ai [project]
                    → competes_with → togal ai [company]
                    → competes_with → plancheck pro ai [company]
                → brother_in_law → dushyant garg [person]
```

One query. Three hops. Relationships your agent never has to re-discover.

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                   Your Conversations                 │
└──────────────────────┬──────────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │    Plugin Hooks     │
            │  agent_end          │
            │  before_compaction  │    ← Captures raw text
            │  message_received   │      (instant, free)
            └──────────┬──────────┘
                       │
            ┌──────────▼──────────┐
            │  Observations Table │    ← SQLite buffer
            └──────────┬──────────┘
                       │
            ┌──────────▼──────────┐
            │   Extraction Cron   │
            │   (Haiku, hourly)   │    ← Reads text, finds entities,
            └──────────┬──────────┘      writes structured data
                       │
            ┌──────────▼──────────┐
            │   Knowledge Graph   │
            │  ┌──────┐ ┌──────┐ │
            │  │Nodes │→│Edges │ │    ← People, projects, tools,
            │  └──────┘ └──────┘ │      decisions — all connected
            └──────────┬──────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   graph_search    /graph cmd    auto-recall
   (agent tool)    (Telegram)    (context injection)
```

**Capture** is instant and free — hooks buffer raw conversation text.
**Extraction** happens asynchronously via a cron job. Bring your own model.
**Query** is local FTS5 — no API calls, no embedding costs.

---

## Quick Start

### 1. Clone

```bash
git clone https://github.com/fraction12/agentsense.git ~/.openclaw/extensions/agentsense
cd ~/.openclaw/extensions/agentsense
npm install
```

### 2. Configure

Add to your `openclaw.json`:

```json
{
  "plugins": {
    "allow": ["agentsense"],
    "slots": {
      "memory": "agentsense"
    },
    "load": {
      "paths": ["~/.openclaw/extensions/agentsense"]
    },
    "entries": {
      "agentsense": {
        "enabled": true,
        "config": {
          "autoCapture": true,
          "autoRecall": true
        }
      }
    }
  }
}
```

### 3. Restart

```bash
openclaw gateway restart
```

### 4. Verify

```bash
openclaw status
# Should show: Memory: enabled (plugin agentsense)
```

That's it. AgentSense will start capturing from your conversations immediately.

---

## The Extraction Cron

AgentSense captures text automatically, but **extraction requires an LLM**. The plugin doesn't call any LLM directly — instead, you set up an OpenClaw cron job that reads pending observations and writes entities.

This is by design. Your model, your cost, your schedule.

**Example cron setup** (using Haiku under Claude Max — free):

Create a cron via OpenClaw that runs an isolated Haiku session hourly. The session reads pending observations from SQLite, extracts entities, and writes them back. See [CRON_SETUP.md](./CRON_SETUP.md) for the full prompt template.

Without the cron, observations accumulate but the graph stays empty. The plugin still works — `memory_search` and `memory_get` function normally, and you can manually add entities via SQLite.

---

## What You Get

### `graph_search` Tool

Your agent gets a new tool for structured entity lookup:

```
graph_search("Brandon")
→ brandon watkins [person]
  → partner → tradespec ai [project]
  → brother_in_law → dushyant garg [person]
```

### `/graph` Telegram Command

```
/graph              → Stats overview
/graph search X     → Find entities
/graph recent       → Latest additions
/graph connections X → All relationships for an entity
/graph types        → Breakdown by entity type
```

### Auto-Recall

The `before_agent_start` hook automatically injects relevant entities into your agent's context before every turn. No tool call needed — your agent just *knows*.

### Preserved Memory Tools

AgentSense replaces `memory-core` as the memory plugin but **re-registers `memory_search` and `memory_get`** identically. Your existing memory system works exactly as before. The graph is additive.

---

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `autoCapture` | `true` | Buffer conversation text via hooks |
| `autoRecall` | `true` | Inject graph context before agent turns |
| `dbPath` | `~/.openclaw/memory/agentsense.db` | SQLite database location |
| `captureMinMessageLength` | `50` | Minimum text length to capture |
| `maxRecallEntities` | `5` | Max entities injected per turn |

---

## Entity Types

AgentSense recognizes: `person`, `project`, `decision`, `event`, `idea`, `preference`, `place`, `tool`, `organization`, `company`

Relationships are freeform strings: `works_on`, `partner`, `built`, `uses`, `decided`, `prefers`, `employed_by`, `located_in`, `manages`, `created` — whatever the extraction model finds.

---

## Architecture Decisions

**SQLite + FTS5, not Neo4j.** A knowledge graph doesn't need a graph database. SQLite is single-file, zero-config, fast enough for thousands of nodes, and already a dependency via `better-sqlite3`.

**Cron extraction, not inline.** Early versions called Haiku directly from hooks. This required an API key, added latency, and crashed when the key expired. Moving extraction to a cron job means: zero API dependencies in the plugin, no hook failures, batch context for better extraction quality.

**Memory plugin slot.** AgentSense registers as `kind: "memory"`, replacing `memory-core` in the plugin slot. This lets it re-register the standard memory tools while adding graph capabilities. Switch back to `memory-core` anytime — your graph data persists on disk untouched.

**Eager DB initialization.** The database initializes at plugin registration time, not in the service `start()` method. This prevents a race condition where hooks fire before the service is ready.

---

## Rollback

Switch back to the default memory system in 30 seconds:

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-core"
    }
  }
}
```

```bash
openclaw gateway restart
```

Your graph database persists at `~/.openclaw/memory/agentsense.db`. Re-enable AgentSense anytime and everything is still there.

---

## Requirements

- OpenClaw 2026.2.17+
- Node.js 20+
- `better-sqlite3` (installed automatically)

---

## File Structure

```
agentsense/
├── index.ts              # Main entry — tools, hooks, commands, services
├── graph-db.ts           # SQLite + FTS5 database layer
├── config.ts             # Plugin configuration schema
├── types.ts              # TypeScript type definitions
├── extractor.ts          # Extraction prompt template + JSON parser
├── hooks/
│   ├── auto-capture.ts   # Buffers text on agent_end / before_compaction
│   ├── auto-recall.ts    # Injects graph context on before_agent_start
│   └── message-capture.ts # Captures individual messages
├── tools/
│   └── graph-search.ts   # graph_search agent tool
├── cli/
│   └── graph-cli.ts      # CLI commands (stats, search, entities)
├── skill/
│   └── SKILL.md          # Agent skill documentation
└── openclaw.plugin.json  # Plugin manifest
```

---

## The Honest Truth

At small scale (< 100 nodes), AgentSense is mostly redundant with OpenClaw's built-in memory search. The embedding-based system finds the same information, often with richer context.

The graph earns its keep at scale. When you have hundreds of entities with dense connections, relationship queries — *"who connects to what through whom?"* — become something keyword and vector search fundamentally cannot do.

The auto-recall injection is useful from day one. Relevant entities pre-loaded into every turn, zero tool calls, zero latency.

Build the graph. Let it grow. The connections compound.

---

## License

MIT

---

*Built by [Jarvis](https://github.com/fraction12) — because an agent that forgets who you know isn't really paying attention.*
