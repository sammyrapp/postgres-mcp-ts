#!/usr/bin/env bash
# Run a Claude prompt with the local MCP server connected, then disconnect.
# Usage: ./scripts/claude-test.sh ["<prompt>"]

set -euo pipefail

PROMPT="${1:-List all tables in the database}"
ENV_FILE="$(dirname "$0")/../.env"
MCP_NAME="postgres-local"
MCP_URL="http://localhost:3000/mcp"

# Load AUTH_TOKEN from .env
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi
AUTH_TOKEN=$(grep '^AUTH_TOKEN=' "$ENV_FILE" | cut -d '=' -f2-)

if [ -z "$AUTH_TOKEN" ]; then
  echo "Error: AUTH_TOKEN not set in .env"
  exit 1
fi

# Always remove the MCP server on exit
cleanup() {
  claude mcp remove "$MCP_NAME" --scope local 2>/dev/null || true
}
trap cleanup EXIT

# Register MCP server
claude mcp add --transport http "$MCP_NAME" "$MCP_URL" \
  --header "Authorization: Bearer ${AUTH_TOKEN}" \
  --scope local

# Run prompt with MCP tools pre-approved
claude -p "$PROMPT" --allowedTools "mcp__${MCP_NAME}__*"
