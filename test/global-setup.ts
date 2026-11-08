import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import type { TestProject } from "vitest/node"

// Runs once per `vitest` run, before any test file: bring the test database
// to the latest schema and start from empty tables.
export default async function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL
  const name = url ? new URL(url).pathname.slice(1) : ""
  if (!url || !name.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against database "${name}": its name must end with _test.`
    )
  }

  const db = drizzle(url)
  try {
    await migrate(db, { migrationsFolder: "./lib/db/migrations" })
    await db.execute(
      sql`TRUNCATE messages, chats, users RESTART IDENTITY CASCADE`
    )
  } finally {
    await db.$client.end()
  }
}
