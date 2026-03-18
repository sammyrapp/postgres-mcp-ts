import { Hono, type MiddlewareHandler } from "hono";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import { StreamableHTTPTransport } from "@hono/mcp";
import { createMcpServer } from "./mcp.js";
import { config } from "./config.js";

const app = new Hono();
app.use("*", logger());

// --- Auth middleware ---
const authMiddleware: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header("authorization");
  if (!auth || auth !== `Bearer ${config.AUTH_TOKEN}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};
app.use("/mcp", authMiddleware);
app.use("/mcp/*", authMiddleware);

// --- Session store ---
const sessions = new Map<string, StreamableHTTPTransport>();

// --- MCP endpoint — handles POST, GET, DELETE ---
app.all("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");

  // Resume existing session
  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (!transport) return c.json({ error: "Session not found" }, 404);
    return transport.handleRequest(c as any); // type-only cast: @hono/mcp uses @jsr/hono__hono types
  }

  // GET / DELETE without a session ID is invalid
  if (c.req.method !== "POST") {
    return c.json({ error: "Missing Mcp-Session-Id header" }, 400);
  }

  // New session — transport validates the initialize request internally
  const transport = new StreamableHTTPTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
      console.log(`[session] opened ${id} — active: ${sessions.size}`);
    },
    onsessionclosed: (id) => {
      sessions.delete(id);
      console.log(`[session] closed ${id} — active: ${sessions.size}`);
    },
  });

  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(c as any); // type-only cast: @hono/mcp uses @jsr/hono__hono types
});

// --- Health check ---
app.get("/health", (c) => c.json({ status: "ok", sessions: sessions.size }));

// --- Start ---
serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, () => {
  console.log(`MCP server listening on http://${config.HOST}:${config.PORT}/mcp`);
  console.log(`Health check:        http://${config.HOST}:${config.PORT}/health`);
});
