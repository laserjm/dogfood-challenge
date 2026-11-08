// Runs once when a server starts (`next dev`, `next start`), before it takes
// requests. Asking for every env group here turns a missing or malformed
// variable into a startup failure instead of a broken first request.
export async function register() {
  const { aiEnv, databaseEnv } = await import("./lib/env")
  databaseEnv()
  aiEnv()
}
