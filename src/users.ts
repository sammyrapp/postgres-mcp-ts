import { randomBytes, createHash } from "node:crypto";
import { sql } from "./db.js";

export type Role = "user" | "admin";

export interface McpUser {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

const USER_COLUMNS = sql`id, username, role, is_active, created_at, last_used_at`;

export async function ensureUsersTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      api_key_hash  TEXT NOT NULL UNIQUE,
      role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      is_active     BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at  TIMESTAMPTZ
    )
  `;
}

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey(): string {
  return randomBytes(32).toString("hex");
}

// Upsert: creates the user if new, or rotates their key (and resets role/active)
// if the username already exists. Lets management tooling stay idempotent.
export async function createUser(
  username: string,
  role: Role = "user"
): Promise<{ user: McpUser; apiKey: string }> {
  const apiKey = generateApiKey();
  const apiKeyHash = hashKey(apiKey);
  const [user] = await sql<McpUser[]>`
    INSERT INTO users (username, api_key_hash, role)
    VALUES (${username}, ${apiKeyHash}, ${role})
    ON CONFLICT (username) DO UPDATE
      SET api_key_hash = EXCLUDED.api_key_hash,
          role = EXCLUDED.role,
          is_active = true
    RETURNING ${USER_COLUMNS}
  `;
  return { user, apiKey };
}

export async function rotateApiKey(username: string): Promise<string> {
  const apiKey = generateApiKey();
  const apiKeyHash = hashKey(apiKey);
  const result = await sql`
    UPDATE users SET api_key_hash = ${apiKeyHash}
    WHERE username = ${username}
    RETURNING id
  `;
  if (result.length === 0) throw new Error(`User '${username}' not found`);
  return apiKey;
}

export async function setActive(username: string, isActive: boolean): Promise<void> {
  const result = await sql`
    UPDATE users SET is_active = ${isActive}
    WHERE username = ${username}
    RETURNING id
  `;
  if (result.length === 0) throw new Error(`User '${username}' not found`);
}

export async function setRole(username: string, role: Role): Promise<void> {
  const result = await sql`
    UPDATE users SET role = ${role}
    WHERE username = ${username}
    RETURNING id
  `;
  if (result.length === 0) throw new Error(`User '${username}' not found`);
}

export async function removeUser(username: string): Promise<void> {
  const result = await sql`DELETE FROM users WHERE username = ${username} RETURNING id`;
  if (result.length === 0) throw new Error(`User '${username}' not found`);
}

export async function listUsers(): Promise<McpUser[]> {
  return await sql<McpUser[]>`
    SELECT ${USER_COLUMNS} FROM users ORDER BY username
  `;
}

// Verifies the key and stamps last_used_at in a single round trip.
export async function findUserByApiKey(rawKey: string): Promise<McpUser | null> {
  const apiKeyHash = hashKey(rawKey);
  const [user] = await sql<McpUser[]>`
    UPDATE users
    SET last_used_at = now()
    WHERE api_key_hash = ${apiKeyHash} AND is_active = true
    RETURNING ${USER_COLUMNS}
  `;
  return user ?? null;
}
