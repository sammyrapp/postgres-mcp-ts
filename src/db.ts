import postgres from "postgres";
import { config } from "./config.js";

// Single shared connection pool for all sessions
const port = config.DATABASE_PORT ? `:${config.DATABASE_PORT}` : "";
const sslParams = config.DATABASE_SSL_PARAMS ? `?${config.DATABASE_SSL_PARAMS}` : "";
export const sql = postgres(`${config.DATABASE_ENGINE}://${config.DATABASE_USER}:${config.DATABASE_PASSWORD}@${config.DATABASE_HOST}${port}/${config.DATABASE_NAME}${sslParams}`, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
