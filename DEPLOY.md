# AgentSense Deployment Guide

## Prerequisites

- OpenClaw installed globally (`npm install -g openclaw`)
- Node.js 18+
- An Anthropic API key for entity extraction

## Installation

1. Navigate to the plugin directory:
   ```bash
   cd ~/.openclaw/extensions/agentsense
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Add the plugin to your OpenClaw config (`~/.openclaw/config.yaml`):
   ```yaml
   plugins:
     slots:
       memory: agentsense
     entries:
       agentsense:
         enabled: true
         config:
           extractionApiKey: "${ANTHROPIC_API_KEY}"
           autoCapture: true
           autoRecall: true
   ```

4. Set your Anthropic API key:
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

## Configuration Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `extractionApiKey` | string | *required* | Anthropic API key (supports `${ENV_VAR}`) |
| `extractionModel` | string | `claude-haiku-4-5-20251001` | Model for entity extraction |
| `dbPath` | string | `~/.openclaw/memory/agentsense.db` | SQLite database path |
| `autoCapture` | boolean | `false` | Auto-extract entities from conversations |
| `autoRecall` | boolean | `true` | Auto-inject graph context before agent starts |
| `maxRecallEntities` | number | `5` | Max entities in auto-recall context |
| `captureMinMessageLength` | number | `50` | Min message length for extraction |

## CLI Commands

```bash
openclaw graph search <query>           # Search the knowledge graph
openclaw graph entities [--type person] # List all entities
openclaw graph entity <name>            # Show entity details
openclaw graph stats                    # Show graph statistics
openclaw graph clear                    # Clear all graph data
openclaw graph export                   # Export as JSON
```

## Verification

Run the smoke test:
```bash
./smoke-test.sh
```

## How It Works

- **Auto-Capture**: After each agent conversation and before compaction, entities are extracted via Haiku and stored in a SQLite knowledge graph
- **Auto-Recall**: Before each agent run, the user prompt is searched against the graph and matching entities are injected as context
- **graph_search Tool**: The agent can explicitly search the knowledge graph during conversations
- **Memory Core**: Also re-registers the standard `memory_search` and `memory_get` tools so core memory works alongside the graph
