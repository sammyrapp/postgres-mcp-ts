import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./mcp.js";
import { config } from "./config.js";

const app = express();
app.use(express.json());

// --- Auth middleware ---
app.use("/mcp", (req: Request, res: Response, next) => {
  const auth = req.headers["authorization"];
  if (!auth || auth !== `Bearer ${config.AUTH_TOKEN}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

// --- Session store ---
// Maps session ID -> transport for active MCP sessions
const sessions = new Map<string, StreamableHTTPServerTransport>();

// --- POST /mcp — client-to-server messages ---
app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Resume existing session
  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // New connection must start with an initialize request
  if (!isInitializeRequest(req.body)) {
    res.status(400).json({ error: "New connections must send an initialize request" });
    return;
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
      console.log(
        `[session] closed ${transport.sessionId} — active: ${sessions.size}`
      );
    }
  };

  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// --- GET /mcp — server-to-client SSE stream ---
app.get("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "Missing Mcp-Session-Id header" });
    return;
  }
  const transport = sessions.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  await transport.handleRequest(req, res);
});

// --- DELETE /mcp — explicit session termination ---
app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "Missing Mcp-Session-Id header" });
    return;
  }
  const transport = sessions.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  await transport.handleRequest(req, res);
});

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", sessions: sessions.size });
});

// --- Start ---
app.listen(config.PORT, config.HOST, () => {
  console.log(`MCP server listening on http://${config.HOST}:${config.PORT}/mcp`);
  console.log(`Health check:        http://${config.HOST}:${config.PORT}/health`);
});
