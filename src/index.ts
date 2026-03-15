import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./mcp.js";
import { config } from "./config.js";

type Env = {
  Bindings: {
    incoming: IncomingMessage;
    outgoing: ServerResponse;
  };
};

const app = new Hono<Env>();

// --- Auth middleware ---
app.use("/mcp*", async (c, next) => {
  const auth = c.req.header("authorization");
  if (!auth || auth !== `Bearer ${config.AUTH_TOKEN}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// --- Session store ---
// Maps session ID -> transport for active MCP sessions
const sessions = new Map<string, StreamableHTTPServerTransport>();

// --- POST /mcp — client-to-server messages ---
app.post("/mcp", async (c) => {
  const { incoming: req, outgoing: res } = c.env;
  const sessionId = c.req.header("mcp-session-id");
  const body = await c.req.json();

  // Resume existing session
  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (!transport) return c.json({ error: "Session not found" }, 404);
    await transport.handleRequest(req, res, body);
    return new Response(null);
  }

  // New connection must start with an initialize request
  if (!isInitializeRequest(body)) {
    return c.json({ error: "New connections must send an initialize request" }, 400);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
      console.log(`[session] opened ${id} — active: ${sessions.size}`);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      sessions.delete(transport.sessionId);
      console.log(`[session] closed ${transport.sessionId} — active: ${sessions.size}`);
    }
  };

  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
  return new Response(null);
});

// --- GET /mcp — server-to-client SSE stream ---
app.get("/mcp", async (c) => {
  const { incoming: req, outgoing: res } = c.env;
  const sessionId = c.req.header("mcp-session-id");
  if (!sessionId) return c.json({ error: "Missing Mcp-Session-Id header" }, 400);
  const transport = sessions.get(sessionId);
  if (!transport) return c.json({ error: "Session not found" }, 404);
  await transport.handleRequest(req, res);
  return new Response(null);
});

// --- DELETE /mcp — explicit session termination ---
app.delete("/mcp", async (c) => {
  const { incoming: req, outgoing: res } = c.env;
  const sessionId = c.req.header("mcp-session-id");
  if (!sessionId) return c.json({ error: "Missing Mcp-Session-Id header" }, 400);
  const transport = sessions.get(sessionId);
  if (!transport) return c.json({ error: "Session not found" }, 404);
  await transport.handleRequest(req, res);
  return new Response(null);
});

// --- Health check ---
app.get("/health", (c) => c.json({ status: "ok", sessions: sessions.size }));

// --- Start ---
serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, () => {
  console.log(`MCP server listening on http://${config.HOST}:${config.PORT}/mcp`);
  console.log(`Health check:        http://${config.HOST}:${config.PORT}/health`);
});
