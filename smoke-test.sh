#!/bin/bash
# AgentSense Smoke Test
# Tests that the plugin can be loaded and the graph DB initializes correctly

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== AgentSense Smoke Test ==="

# 1. Check all required files exist
echo ""
echo "1. Checking required files..."
REQUIRED_FILES=(
  "openclaw.plugin.json"
  "package.json"
  "tsconfig.json"
  "index.ts"
  "config.ts"
  "types.ts"
  "plugin-types.ts"
  "graph-db.ts"
  "extractor.ts"
  "hooks/auto-capture.ts"
  "hooks/auto-recall.ts"
  "hooks/message-capture.ts"
  "tools/graph-search.ts"
  "cli/graph-cli.ts"
  "skill/SKILL.md"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ -f "$f" ]; then
    echo "  OK: $f"
  else
    echo "  MISSING: $f"
    exit 1
  fi
done

# 2. Check node_modules exist
echo ""
echo "2. Checking dependencies..."
if [ -d "node_modules/better-sqlite3" ]; then
  echo "  OK: better-sqlite3 installed"
else
  echo "  MISSING: better-sqlite3 (run npm install)"
  exit 1
fi

if [ -d "node_modules/@sinclair/typebox" ]; then
  echo "  OK: @sinclair/typebox installed"
else
  echo "  MISSING: @sinclair/typebox (run npm install)"
  exit 1
fi

# 3. TypeScript compilation check
echo ""
echo "3. TypeScript compilation..."
if npx tsc --noEmit 2>&1; then
  echo "  OK: TypeScript compiles clean"
else
  echo "  FAIL: TypeScript compilation errors"
  exit 1
fi

# 4. Validate plugin manifest
echo ""
echo "4. Validating plugin manifest..."
if node -e "
  const manifest = JSON.parse(require('fs').readFileSync('openclaw.plugin.json', 'utf8'));
  if (manifest.id !== 'agentsense') throw new Error('id mismatch');
  if (manifest.kind !== 'memory') throw new Error('kind mismatch');
  if (!manifest.configSchema) throw new Error('missing configSchema');
  console.log('  OK: Manifest valid (id=' + manifest.id + ', kind=' + manifest.kind + ')');
" 2>&1; then
  :
else
  echo "  FAIL: Invalid manifest"
  exit 1
fi

# 5. Test SQLite graph DB (in-memory)
echo ""
echo "5. Testing SQLite graph DB..."
if npx tsx smoke-test-db.ts 2>&1; then
  :
else
  echo "  FAIL: GraphDB test failed"
  exit 1
fi

echo ""
echo "=== All smoke tests passed! ==="
