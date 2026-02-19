# AgentSense Rollback Guide

## If AgentSense breaks after OpenClaw update:

### Quick Rollback (30 seconds)
```bash
# Switch back to memory-core
python3 -c "
import json
with open('$HOME/.openclaw/openclaw.json', 'r') as f:
    c = json.load(f)
c['plugins']['slots']['memory'] = 'memory-core'
with open('$HOME/.openclaw/openclaw.json', 'w') as f:
    json.dump(c, f, indent=2)
"
openclaw gateway restart
```

### Full Config Rollback
```bash
cp ~/.openclaw/openclaw.json.pre-update-backup ~/.openclaw/openclaw.json
openclaw gateway restart
```

### DB is safe regardless
The graph DB at ~/.openclaw/memory/agentsense.db persists on disk.
Backup at ~/.openclaw/memory/agentsense.db.pre-update-backup

### Re-enable after fix
```bash
# Switch back to agentsense
python3 -c "
import json
with open('$HOME/.openclaw/openclaw.json', 'r') as f:
    c = json.load(f)
c['plugins']['slots']['memory'] = 'agentsense'
with open('$HOME/.openclaw/openclaw.json', 'w') as f:
    json.dump(c, f, indent=2)
"
openclaw gateway restart
```
