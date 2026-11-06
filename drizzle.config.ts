import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

// drizzle-kit does not read Next.js env files; values already in the environment win.
config({
  path: ".env.local",
})

export default defineConfig({
  out: "./lib/db/migrations",
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
