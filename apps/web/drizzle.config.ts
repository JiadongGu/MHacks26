import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env files. Load them here when they exist.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // The file does not exist. Continue.
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: ["./drizzle/schema/core.ts", "./drizzle/schema/integrations.ts"],
  out: "./drizzle/migrations",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
  strict: true,
  verbose: true,
});
