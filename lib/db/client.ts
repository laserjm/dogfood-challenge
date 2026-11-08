import "server-only"
import { drizzle } from "drizzle-orm/node-postgres"
import { databaseEnv } from "../env"

// Next loads .env.local itself; vitest sets DATABASE_URL in its config.
export const db = drizzle(databaseEnv().DATABASE_URL)
