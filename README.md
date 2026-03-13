# ts-postgres-mcp

A TypeScript MCP (Model Context Protocol) server that exposes your PostgreSQL database to Claude and other MCP clients over HTTP. Built with Streamable HTTP transport for remote use or local development/use.

## Stack

- **[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)** v1.x — official SDK, Streamable HTTP transport
- **[postgres.js](https://github.com/porsager/postgres)** — fast, modern PostgreSQL client
- **[Express](https://expressjs.com/)** v5 — HTTP server
- **[Zod](https://zod.dev/)** — config and schema validation
- **[tsx](https://github.com/privatenumber/tsx)** — dev runtime, **[tsup](https://tsup.egoist.dev/)** — production build

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
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Generate a strong token: openssl rand -hex 32
AUTH_TOKEN=your-secret-token-here

PORT=3000
HOST=0.0.0.0
ROW_LIMIT=100
```

### 3. Run in development

```bash
npm run dev
```

The server starts at `http://localhost:3000/mcp`.

### 4. Build for production

```bash
npm run build
npm start
```

## Connecting from Claude Code

Add this to your Claude Code MCP config (`.claude/settings.json` or via `claude mcp add`):

```json
{
  "mcpServers": {
    "postgres": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-token-here"
      }
    }
  }
}
```

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

Register new tools in `src/mcp.ts` using the same `server.tool(name, description, schema, handler)` pattern.

## Health check

```bash
curl http://localhost:3000/health
# {"status":"ok","sessions":0}
```
