import postgres from "postgres";
import { config } from "./config.js";

// Single shared connection pool for all sessions
export const sql = postgres(`${config.DATABASE_ENGINE}://${config.DATABASE_USER}:${config.DATABASE_PASSWORD}@${config.DATABASE_HOST}:${config.DATABASE_PORT}/${config.DATABASE_NAME}`, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
