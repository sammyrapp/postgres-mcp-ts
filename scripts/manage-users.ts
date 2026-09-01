/**
 * Manage MCP users (users table).
 * Usage: npm run manage-users -- <command> [args]
 */
import { sql } from "../src/db.js";
import {
  ensureUsersTable,
  createUser,
  rotateApiKey,
  setActive,
  setRole,
  removeUser,
  listUsers,
  type Role,
} from "../src/users.js";

const [command, ...rawArgs] = process.argv.slice(2);
const quiet = rawArgs.includes("--quiet");
const isAdminFlag = rawArgs.includes("--admin");
const positional = rawArgs.filter((a) => !a.startsWith("--"));

function usage(): never {
  console.log(`
Usage:
  npm run manage-users -- add <username> [--admin] [--quiet]
  npm run manage-users -- list
  npm run manage-users -- rotate <username> [--quiet]
  npm run manage-users -- activate <username>
  npm run manage-users -- deactivate <username>
  npm run manage-users -- set-role <username> <user|admin>
  npm run manage-users -- remove <username>

--quiet prints only the raw API key (for scripting). "add" is idempotent —
re-running it for an existing username rotates their key and reactivates them.
`);
  process.exit(1);
}

async function main() {
  await ensureUsersTable();

  switch (command) {
    case "add": {
      const [username] = positional;
      if (!username) usage();
      const role: Role = isAdminFlag ? "admin" : "user";
      const { apiKey } = await createUser(username, role);
      if (quiet) {
        console.log(apiKey);
      } else {
        console.log(`\nCreated/updated user '${username}' (role: ${role})`);
        console.log(`API key (shown once — store it securely):\n\n  ${apiKey}\n`);
      }
      break;
    }
    case "list": {
      const users = await listUsers();
      if (users.length === 0) {
        console.log("No users found.");
        break;
      }
      console.table(
        users.map((u) => ({
          username: u.username,
          role: u.role,
          active: u.is_active,
          created_at: u.created_at,
          last_used_at: u.last_used_at ?? "never",
        }))
      );
      break;
    }
    case "rotate": {
      const [username] = positional;
      if (!username) usage();
      const apiKey = await rotateApiKey(username);
      if (quiet) {
        console.log(apiKey);
      } else {
        console.log(`\nNew API key for '${username}' (shown once):\n\n  ${apiKey}\n`);
        console.log(
          "Note: the old connector using this user's previous key must be removed and re-added in Claude — auth settings can't be edited in place."
        );
      }
      break;
    }
    case "activate":
    case "deactivate": {
      const [username] = positional;
      if (!username) usage();
      await setActive(username, command === "activate");
      console.log(`'${username}' is now ${command === "activate" ? "active" : "inactive"}.`);
      break;
    }
    case "set-role": {
      const [username, role] = positional;
      if (!username || (role !== "user" && role !== "admin")) usage();
      await setRole(username, role as Role);
      console.log(`'${username}' role set to '${role}'.`);
      break;
    }
    case "remove": {
      const [username] = positional;
      if (!username) usage();
      await removeUser(username);
      console.log(`'${username}' removed.`);
      break;
    }
    default:
      usage();
  }
}

main()
  .catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
