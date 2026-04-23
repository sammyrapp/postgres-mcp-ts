# postgres-mcp-ts

A TypeScript MCP (Model Context Protocol) server that exposes a PostgreSQL database to Claude and other MCP clients over HTTP. Claude can call 4 tools: `list_schemas`, `list_tables`, `describe_table`, and `query` (read-only SELECT only).

## Stack

- **HTTP framework**: Hono + `@hono/node-server`
- **MCP transport**: `@hono/mcp` (JSR) — Streamable HTTP (POST/GET/DELETE on `/mcp`)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Database client**: `postgres.js` (not Prisma/Knex)
- **Validation**: Zod (env config + tool input schemas)
- **Build**: tsup → `dist/index.js`
- **Runtime**: Node.js v24+ (see `.nvmrc`)

## Project Structure

```
src/
  index.ts        # Hono server, /mcp route, session map, auth middleware
  config.ts       # Zod-validated env vars (fails fast on startup)
  db.ts           # Shared postgres.js connection pool
  mcp.ts          # MCP server factory, registers tools from tools/
  tools/
    postgres.ts   # All 4 tool definitions (description, Zod schema, handler)
scripts/
  smoke-test.ts   # 8 HTTP integration tests (auth, routing, errors)
  claude-test.sh  # End-to-end test via Claude CLI
  deploy.sh       # Build, push, and deploy to Google Cloud Run
```

## Commands

```bash
npm run dev          # Dev server with hot reload (tsx watch)
npm run build        # Compile to dist/index.js via tsup
npm start            # Run production build
npm test             # HTTP smoke tests (smoke-test.ts)
npm run claude-test  # E2E test via Claude CLI (default prompt: "List all tables")
npm run claude-test -- "Describe the users table"
```

## Environment Variables

Copy `.env.example` → `.env`. All values validated by Zod at startup.

```
DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME
AUTH_TOKEN      # Bearer token for all /mcp requests (openssl rand -hex 32)
PORT            # default 3000
HOST            # default 0.0.0.0
ROW_LIMIT       # max rows per query, default 100, bounded 1–10000
```

## Key Architecture Decisions

- **Why Hono over Express**: `@hono/mcp` middleware prevents double-processing of requests and auto-detects request operation type. (Switched in commit `26388c6`.)
- **Sessions**: in-memory `Map<string, Transport>` keyed by UUID. No persistence — sessions are per-server-process.
- **Read-only enforcement**: all queries run inside `BEGIN READ ONLY` transactions at the DB level, not just application logic.
- **LIMIT injection**: if a SELECT query has no LIMIT clause, one is automatically appended using `ROW_LIMIT`.
- **Single shared pool**: one `postgres.js` pool (max 10 conns) shared across all MCP sessions.

## Adding a New Tool

1. Add the tool definition to `src/tools/postgres.ts` — follow the existing pattern (`description`, `schema` as Zod object, `handler` returning `toText(...)`)
2. Register it in `src/mcp.ts` via `server.registerTool()`

## Testing Notes

- Smoke tests (`npm test`) hit a live server — make sure `npm run dev` or `npm start` is running first, and `.env` is configured.
- `claude-test.sh` temporarily registers the MCP server with the Claude CLI, runs a prompt with all `postgres-*` tools pre-approved, then auto-cleans up on exit.

## Deployment

**Database**: NeonDB (serverless Postgres). Use their pooled connection string in `.env`. Keep postgres.js pool `max` at 10 or lower.

**Server**: Google Cloud Run. `scripts/deploy.sh` handles build, push to Artifact Registry, and deploy. Fill in `PROJECT_ID` at the top of that script before first use.
- Multi-stage Dockerfile: builder compiles TS, production stage runs only `dist/` + prod deps
- Cloud Run injects `PORT=8080`; app reads it automatically via `config.ts`
- `--max-instances 1` is required — sessions are in-memory, multiple instances would break the MCP session model

```bash
bash scripts/deploy.sh
```

## Current Work
<!-- What are you actively building or debugging right now? -->

## Known Issues / TODOs
<!-- Bugs, rough edges, or planned improvements -->
