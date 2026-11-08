import { defineConfig } from "drizzle-kit"
import { databaseEnv } from "./lib/env"

export default defineConfig({
  out: "./lib/db/migrations",
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseEnv().DATABASE_URL,
  },
})
