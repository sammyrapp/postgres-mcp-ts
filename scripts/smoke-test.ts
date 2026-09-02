/**
 * Smoke test against a running server — local by default, or any server via
 * BASE_URL (e.g. to check production).
 * Usage: tsx --env-file=.env scripts/smoke-test.ts
 *        BASE_URL=https://mcp.rappahines.com npm run test:prod
 */
import { sql } from "../src/db.js";
import { ensureUsersTable, createUser, removeUser } from "../src/users.js";

const BASE = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const TEST_USERNAME = "smoke-test";

let passed = 0;
let failed = 0;

async function check(
  label: string,
  req: Request,
  expect: { status: number; bodyIncludes?: string }
) {
  try {
    const res = await fetch(req);
    const text = await res.text();
    const statusOk = res.status === expect.status;
    const bodyOk = !expect.bodyIncludes || text.includes(expect.bodyIncludes);

    if (statusOk && bodyOk) {
      console.log(`  ✓ ${label}`);
      passed++;
    } else {
      console.log(`  ✗ ${label}`);
      if (!statusOk) console.log(`    expected status ${expect.status}, got ${res.status}`);
      if (!bodyOk) console.log(`    expected body to include "${expect.bodyIncludes}", got: ${text}`);
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ ${label} — ${err}`);
    failed++;
  }
}

async function main() {
  console.log(`\nRunning smoke tests against ${BASE}\n`);

  // Bootstrap a throwaway admin user in users to get a real API key
  await ensureUsersTable();
  await removeUser(TEST_USERNAME).catch(() => {});
  const { apiKey: TOKEN } = await createUser(TEST_USERNAME, "admin");

  // Health
  await check(
    "GET /health returns ok",
    new Request(`${BASE}/health`),
    { status: 200, bodyIncludes: '"ok"' }
  );

  // Auth
  await check(
    "POST /mcp without auth returns 401",
    new Request(`${BASE}/mcp`, { method: "POST", body: "{}" }),
    { status: 401, bodyIncludes: "Unauthorized" }
  );

  await check(
    "POST /mcp with wrong token returns 401",
    new Request(`${BASE}/mcp`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-token", "Content-Type": "application/json" },
      body: "{}",
    }),
    { status: 401, bodyIncludes: "Unauthorized" }
  );

  // MCP — bad requests
  await check(
    "POST /mcp with auth but non-initialize body returns 400",
    new Request(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
    { status: 400, bodyIncludes: "initialize" }
  );

  await check(
    "POST /mcp with unknown session-id returns 404",
    new Request(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "mcp-session-id": "does-not-exist",
      },
      body: JSON.stringify({ method: "tools/list" }),
    }),
    { status: 404, bodyIncludes: "Session not found" }
  );

  await check(
    "GET /mcp without session-id returns 400",
    new Request(`${BASE}/mcp`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }),
    { status: 400, bodyIncludes: "Mcp-Session-Id" }
  );

  await check(
    "DELETE /mcp without session-id returns 400",
    new Request(`${BASE}/mcp`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TOKEN}` },
    }),
    { status: 400, bodyIncludes: "Mcp-Session-Id" }
  );

  // MCP — tool tests (requires valid DB connection)
  async function initSession(): Promise<string | null> {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "smoke-test", version: "1.0" },
        },
      }),
    });
    return res.headers.get("mcp-session-id");
  }

  const MCP_HEADERS = (sessionId: string) => ({
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "mcp-session-id": sessionId,
  });

  const sessionId = await initSession();

  if (!sessionId) {
    console.log("  ✗ MCP session init failed — skipping tool tests");
    failed++;
  } else {
    await check(
      "tools/list returns all 4 postgres tools",
      new Request(`${BASE}/mcp`, {
        method: "POST",
        headers: MCP_HEADERS(sessionId),
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      }),
      { status: 200, bodyIncludes: "list_schemas" }
    );

    await check(
      "list_schemas tool executes successfully",
      new Request(`${BASE}/mcp`, {
        method: "POST",
        headers: MCP_HEADERS(sessionId),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "list_schemas", arguments: {} },
        }),
      }),
      { status: 200, bodyIncludes: "public" }
    );

    // Clean up session
    await fetch(`${BASE}/mcp`, {
      method: "DELETE",
      headers: MCP_HEADERS(sessionId),
    });
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
}

main()
  .catch((err) => {
    console.error(err);
    failed++;
  })
  .finally(async () => {
    await removeUser(TEST_USERNAME).catch(() => {});
    await sql.end();
    if (failed > 0) process.exit(1);
  });
