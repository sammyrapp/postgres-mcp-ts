#!/usr/bin/env bash
# Run a Claude prompt with the local MCP server connected, then disconnect.
# Usage: ./scripts/claude-test.sh ["<prompt>"]

set -euo pipefail

PROMPT="${1:-List all tables in the database}"
ENV_FILE="$(dirname "$0")/../.env"
MCP_NAME="postgres-local"
MCP_URL="http://localhost:3000/mcp"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

# Ensure a "claude-test" admin user exists and grab a fresh API key for it.
# manage-users add is idempotent — safe to (re)run every time.
API_KEY=$(npm run --silent manage-users -- add claude-test --admin --quiet)

if [ -z "$API_KEY" ]; then
  echo "Error: failed to provision API key for claude-test user"
  exit 1
fi

# Always remove the MCP server on exit
cleanup() {
  claude mcp remove "$MCP_NAME" --scope local 2>/dev/null || true
}
trap cleanup EXIT

# Register MCP server
claude mcp add --transport http "$MCP_NAME" "$MCP_URL" \
  --header "Authorization: Bearer ${API_KEY}" \
  --scope local

# Run prompt with MCP tools pre-approved
claude -p "$PROMPT" --allowedTools "mcp__${MCP_NAME}__*"
