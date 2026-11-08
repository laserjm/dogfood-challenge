import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://dogfood:dogfood@localhost:5434/dogfood_test"

export default defineConfig({
  resolve: {
    // `@/…` from tsconfig.json
    tsconfigPaths: true,
    // `server-only` throws outside a React Server Components bundle; tests run
    // in plain Node, so swap in the package's own no-op entry.
    alias: [
      {
        find: /^server-only$/,
        replacement: fileURLToPath(
          new URL("./node_modules/server-only/empty.js", import.meta.url)
        ),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["modules/**/*.test.ts", "lib/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Wins over .env.local: dotenv never overrides a variable that is already set.
    env: { DATABASE_URL: TEST_DATABASE_URL },
  },
})
