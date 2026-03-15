import { z } from "zod";

const schema = z.object({
  // DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_ENGINE: z.enum(["postgresql"]).default("postgresql"),
  DATABASE_HOST: z.string().default("localhost"),
  DATABASE_PORT: z.coerce.number().int().default(5432),
  DATABASE_USER: z.string().min(1, "DATABASE_USER is required"),
  DATABASE_PASSWORD: z.string().min(1, "DATABASE_PASSWORD is required"),
  DATABASE_NAME: z.string().min(1, "DATABASE_NAME is required").default("postgres"),
  AUTH_TOKEN: z.string().min(1, "AUTH_TOKEN is required"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  ROW_LIMIT: z.coerce.number().int().min(1).max(10000).default(20),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error("❌ Invalid configuration:");
  for (const [field, errors] of Object.entries(
    result.error.flatten().fieldErrors
  )) {
    console.error(`  ${field}: ${errors?.join(", ")}`);
  }
  process.exit(1);
}

export const config = result.data;
