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

Edit `.env` with your database credentials and other values.

### 3. Local Run Server 

#### Run in development

```bash
npm run dev
```

The server starts at `http://localhost:3000/mcp`. TypeScript is run directly via `tsx` with hot reload — no build step needed.

#### Run with Docker

```bash
docker build -t postgres-mcp-ts .
docker run -p 3000:3000 --env-file .env postgres-mcp-ts
```

The server will be available at `http://localhost:3000/mcp`. This is closer to the production environment and can help catch issues with the build or environment variables.

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
npm run claude-test -- "Try to insert a row into any table"  # Might be rejected if made read-only
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

## Deploying to Google Cloud Run

The server is deployed as a container on Google Cloud Run backed by a NeonDB Postgres database.

### Prerequisites

- [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated (`gcloud auth login`)
- A GCP project with billing enabled
- A [NeonDB](https://neon.tech) database (free tier)

### Database (NeonDB)

Get your pooled connection string from the Neon dashboard and split it into the individual `DATABASE_*` env vars in `.env`.

### Deploy

Fill in `PROJECT_ID` at the top of `scripts/deploy.sh`, then:

```bash
bash scripts/deploy.sh
```

This uses **Cloud Build** (free tier: 120 min/day) to build the Docker image remotely — no local Docker required. It then deploys to Cloud Run and prints the service URL.

Cloud Run injects `PORT=8080` automatically; the app reads it via `config.ts`.

> `--max-instances 1` is set in the deploy script and must stay that way — sessions are stored in-memory, so multiple instances would break the MCP session model.

### Connecting after deploy

Replace `localhost:3000` with your Cloud Run service URL in your MCP client config:

```json
{
  "mcpServers": {
    "postgres": {
      "type": "http",
      "url": "https://your-service-url.run.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_AUTH_TOKEN"
      }
    }
  }
}
```

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
