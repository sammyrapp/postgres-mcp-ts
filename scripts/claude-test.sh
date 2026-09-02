#!/usr/bin/env bash
# Full local end-to-end test: start the dev server (if one isn't already
# running), connect it to Claude as an MCP server, ask a prompt, print the
# answer, then disconnect the MCP and stop anything this script started.
# Usage: ./scripts/claude-test.sh ["<prompt>"]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PROMPT="${1:-List all tables in the database}"
MCP_NAME="postgres-local"

if [ ! -f .env ]; then
  echo "Error: .env file not found. Copy .env.example and fill it in."
  exit 1
fi

PORT="$(grep '^PORT=' .env | cut -d '=' -f2- || true)"
PORT="${PORT:-3000}"
BASE_URL="http://localhost:${PORT}"
MCP_URL="${BASE_URL}/mcp"

SERVER_STARTED_BY_US=false
SERVER_LOG="$(mktemp -t postgres-mcp-e2e-XXXX.log)"

cleanup() {
  claude mcp remove "$MCP_NAME" --scope local 2>/dev/null || true
  if [ "$SERVER_STARTED_BY_US" = true ]; then
    echo "→ Stopping dev server..."
    pkill -f "tsx/esm --watch src/index.ts" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if curl -sf "${BASE_URL}/health" > /dev/null 2>&1; then
  echo "→ Using already-running server at ${BASE_URL}"
else
  echo "→ Starting dev server..."
  npm run dev > "$SERVER_LOG" 2>&1 &
  SERVER_STARTED_BY_US=true

  echo "→ Waiting for server to become healthy..."
  ready=false
  for _ in $(seq 1 30); do
    if curl -sf "${BASE_URL}/health" > /dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  if [ "$ready" != true ]; then
    echo "Error: server did not become healthy in time. Log:"
    cat "$SERVER_LOG"
    exit 1
  fi
  echo "  ready."
fi

# Ensure a "claude-test" admin user exists and grab a fresh API key for it.
# manage-users add is idempotent — safe to (re)run every time.
API_KEY=$(npm run --silent manage-users -- add claude-test --admin --quiet)

if [ -z "$API_KEY" ]; then
  echo "Error: failed to provision API key for claude-test user"
  exit 1
fi

echo "→ Connecting MCP server to Claude..."
claude mcp add --transport http "$MCP_NAME" "$MCP_URL" \
  --header "Authorization: Bearer ${API_KEY}" \
  --scope local

echo "→ Asking Claude: \"$PROMPT\""
echo ""
claude -p "$PROMPT" --allowedTools "mcp__${MCP_NAME}__*"
echo ""
echo "→ Done. Disconnecting MCP and cleaning up..."
