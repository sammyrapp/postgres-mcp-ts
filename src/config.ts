import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_TOKEN: z.string().min(1, "AUTH_TOKEN is required"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  ROW_LIMIT: z.coerce.number().int().min(1).max(10000).default(100),
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
