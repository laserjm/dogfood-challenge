import "server-only"
import "dotenv/config"
// import { config } from "dotenv"
import { drizzle } from "drizzle-orm/node-postgres"

if (!process.env.DATABASE_URL) throw Error("no database url")
export const db = drizzle(process.env.DATABASE_URL!)
