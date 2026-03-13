import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { postgresTools } from "./tools/postgres.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "ts-postgres-mcp",
    version: "1.0.0",
  });

  server.tool(
    "list_schemas",
    postgresTools.list_schemas.description,
    postgresTools.list_schemas.schema,
    async () => {
      return await postgresTools.list_schemas.handler();
    }
  );

  server.tool(
    "list_tables",
    postgresTools.list_tables.description,
    postgresTools.list_tables.schema,
    async (args) => {
      return await postgresTools.list_tables.handler(args);
    }
  );

  server.tool(
    "describe_table",
    postgresTools.describe_table.description,
    postgresTools.describe_table.schema,
    async (args) => {
      return await postgresTools.describe_table.handler(args);
    }
  );

  server.tool(
    "query",
    postgresTools.query.description,
    postgresTools.query.schema,
    async (args) => {
      return await postgresTools.query.handler(args);
    }
  );

  return server;
}
