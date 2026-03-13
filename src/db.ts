import postgres from "postgres";
import { config } from "./config.js";

// Single shared connection pool for all sessions
export const sql = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
