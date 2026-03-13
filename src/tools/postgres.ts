import { z } from "zod";
import { sql } from "../db.js";
import { config } from "../config.js";

// Shared response helper
function toText(data: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export const postgresTools = {
  list_schemas: {
    description: "List all schemas in the database",
    schema: {},
    handler: async () => {
      const rows = await sql`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY schema_name
      `;
      return toText(rows.map((r) => r.schema_name));
    },
  },

  list_tables: {
    description: "List all tables in a schema with row counts",
    schema: {
      schema: z
        .string()
        .default("public")
        .describe("Schema name (default: public)"),
    },
    handler: async ({ schema }: { schema: string }) => {
      const rows = await sql`
        SELECT
          t.table_name,
          t.table_type,
          obj_description(
            (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass,
            'pg_class'
          ) AS description
        FROM information_schema.tables t
        WHERE t.table_schema = ${schema}
        ORDER BY t.table_type, t.table_name
      `;
      return toText(rows);
    },
  },

  describe_table: {
    description:
      "Get column definitions, types, nullability, defaults, and constraints for a table",
    schema: {
      table: z.string().describe("Table name"),
      schema: z
        .string()
        .default("public")
        .describe("Schema name (default: public)"),
    },
    handler: async ({ table, schema }: { table: string; schema: string }) => {
      const columns = await sql`
        SELECT
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable,
          c.column_default,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          (
            SELECT string_agg(tc.constraint_type, ', ' ORDER BY tc.constraint_type)
            FROM information_schema.key_column_usage kcu
            JOIN information_schema.table_constraints tc
              ON kcu.constraint_name = tc.constraint_name
              AND kcu.table_schema = tc.table_schema
            WHERE kcu.table_schema = ${schema}
              AND kcu.table_name = ${table}
              AND kcu.column_name = c.column_name
          ) AS constraints,
          col_description(
            (quote_ident(${schema}) || '.' || quote_ident(${table}))::regclass,
            c.ordinal_position
          ) AS description
        FROM information_schema.columns c
        WHERE c.table_schema = ${schema}
          AND c.table_name = ${table}
        ORDER BY c.ordinal_position
      `;

      if (columns.length === 0) {
        return toText({
          error: `Table '${schema}.${table}' not found or has no columns`,
        });
      }

      return toText(columns);
    },
  },

  query: {
    description:
      "Execute a read-only SQL query against the database. Runs inside a READ ONLY transaction — writes will be rejected by the database. Add a LIMIT clause to control result size (default cap: ROW_LIMIT env var).",
    schema: {
      sql: z
        .string()
        .min(1)
        .describe("SQL query to execute (SELECT / read-only)"),
    },
    handler: async ({ sql: query }: { sql: string }) => {
      const trimmed = query.trim();

      // Append a limit if the query doesn't already have one
      const hasLimit = /\blimit\b/i.test(trimmed);
      const safeQuery = hasLimit
        ? trimmed
        : `SELECT * FROM (${trimmed}) _q LIMIT ${config.ROW_LIMIT}`;

      const rows = await sql.begin("read only", async (tx) => {
        return await tx.unsafe(safeQuery);
      });

      return toText(rows);
    },
  },
} as const;
