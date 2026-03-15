import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { postgresTools } from "./tools/postgres.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "postgres-mcp-ts",
    version: "1.0.0",
  });

  server.registerTool(
    "list_schemas",
    {
      description: postgresTools.list_schemas.description,
      inputSchema: postgresTools.list_schemas.schema,
    },
    async () => await postgresTools.list_schemas.handler()
  );

  server.registerTool(
    "list_tables",
    {
      description: postgresTools.list_tables.description,
      inputSchema: postgresTools.list_tables.schema,
    },
    async (args) => await postgresTools.list_tables.handler(args)
  );

  server.registerTool(
    "describe_table",
    {
      description: postgresTools.describe_table.description,
      inputSchema: postgresTools.describe_table.schema,
    },
    async (args) => await postgresTools.describe_table.handler(args)
  );

  server.registerTool(
    "query",
    {
      description: postgresTools.query.description,
      inputSchema: postgresTools.query.schema,
    },
    async (args) => await postgresTools.query.handler(args)
  );

  return server;
}
