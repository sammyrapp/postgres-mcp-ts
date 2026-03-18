# postgres-mcp-ts

A TypeScript MCP (Model Context Protocol) server that exposes your PostgreSQL database to Claude and other MCP clients over HTTP. Built with Streamable HTTP transport for remote use or local development/use.

## Stack

- **[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)** v1.x — official SDK, Streamable HTTP transport
- **[postgres.js](https://github.com/porsager/postgres)** — fast, modern PostgreSQL client
- **[Hono](https://hono.dev/)** + **[@hono/node-server](https://github.com/honojs/node-server)** + **[@hono/mcp](https://github.com/honojs/middleware/tree/main/packages/mcp)** — HTTP server with Hono-native MCP transport
- **[Zod](https://zod.dev/)** — config and schema validation
- **[tsx](https://github.com/privatenumber/tsx)** — dev runtime, **[tsup](https://tsup.egoist.dev/)** — production build
- **Node.js v24+**

## Tools exposed to Claude

| Tool | Description |
|------|-------------|
| `list_schemas` | List all user-defined schemas |
| `list_tables` | List tables in a schema with types and descriptions |
| `describe_table` | Column definitions, types, nullability, constraints, comments |
| `query` | Execute a read-only SQL query (enforced at the DB level via `READ ONLY` transaction) |

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=your_db_user
DATABASE_PASSWORD=your_db_password
DATABASE_NAME=postgres

# Generate a strong token: openssl rand -hex 32
AUTH_TOKEN=your-secret-token-here

PORT=3000
HOST=0.0.0.0
ROW_LIMIT=20
```

### 3. Run in development

```bash
npm run dev
```

The server starts at `http://localhost:3000/mcp`. TypeScript is run directly via `tsx` with hot reload — no build step needed.

### 4. Build for production

```bash
npm run build
npm start
```

## Testing

### HTTP smoke tests

Verifies auth, routing, and error handling against the running server:

```bash
npm test
```

Checks that unauthenticated requests are rejected, bad session IDs return 404, missing headers return 400, and the health endpoint is reachable.

### End-to-end test via Claude CLI

Connects the MCP server to Claude Code, runs a prompt, then disconnects:

```bash
# Default prompt: "List all tables in the database"
npm run claude-test

# Custom prompt
npm run claude-test -- "Describe the users table"
npm run claude-test -- "Run this query: SELECT current_database(), version()"
npm run claude-test -- "Try to insert a row into any table"  # should be rejected (read-only)
```

Requires the server to be running (`npm run dev`) and the `claude` CLI to be installed.

## Connecting from Claude

### Claude Code

Add via CLI (temporary — for testing):

```bash
claude mcp add --transport http postgres http://localhost:3000/mcp \
  --header "Authorization: Bearer YOUR_AUTH_TOKEN" \
  --scope local
```

Or add permanently to your Claude Code MCP config (`.claude/settings.json`):

```json
{
  "mcpServers": {
    "postgres": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer secret-token"
      }
    }
  }
}
```

### Claude Desktop (Mac)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "postgres": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_AUTH_TOKEN"
      }
    }
  }
}
```

Then restart Claude Desktop. The postgres tools will appear in the tool selector.

For a remote server, replace `localhost:3000` with your server's address and make sure you're running behind HTTPS.

## Deploying remotely

This server is transport-agnostic — the same code runs locally or on any server. A few things to handle for remote deployment:

- **HTTPS**: Run behind a reverse proxy (nginx, Caddy) with TLS. Never expose the raw HTTP port publicly.
- **Process manager**: Use `pm2` or a systemd service to keep the server running.
- **Firewall**: Only expose the port to your proxy, not the public internet directly.

Example with Caddy (automatic HTTPS):

```
mcp.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Then update your MCP client config to point at `https://mcp.yourdomain.com/mcp`.

## How Streamable HTTP transport works

All MCP communication goes through a single `/mcp` endpoint:

- `POST /mcp` — client sends JSON-RPC messages (tool calls, initialization)
- `GET /mcp` — client opens an SSE stream for server-initiated messages
- `DELETE /mcp` — client terminates the session

Sessions are identified by the `Mcp-Session-Id` header returned during initialization. Each client gets its own session; multiple clients can connect simultaneously.

## Adding more tools

The project is structured to make adding new tools straightforward. Each data source gets its own file in `src/tools/`:

```
src/
  tools/
    postgres.ts   ← existing
    notion.ts     ← add new sources here
    github.ts
    ...
```

Register new tools in `src/mcp.ts` using the same `server.registerTool(name, { description, inputSchema }, handler)` pattern.

## Health check

```bash
curl http://localhost:3000/health
# {"status":"ok","sessions":0}
```
