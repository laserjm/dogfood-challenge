import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

// Local rule: file must start with `import 'server-only'`.
// Used for files that touch the db or auth so they can never end up in a client bundle.
const requireServerOnly = {
  meta: {
    type: "problem",
    messages: { missing: "File must begin with `import 'server-only'`." },
  },
  create(context) {
    return {
      Program(node) {
        // Skip leading directives such as "use server".
        const first = node.body.find(
          (n) => !(n.type === "ExpressionStatement" && n.directive)
        )
        const ok =
          first?.type === "ImportDeclaration" &&
          first.source.value === "server-only"
        if (!ok) context.report({ node: first ?? node, messageId: "missing" })
      },
    }
  },
}

// Local rule: file must start with the `'use server'` directive.
// Without it, `actions.ts` exports plain functions and forms can't call them.
const requireUseServer = {
  meta: {
    type: "problem",
    messages: { missing: "File must begin with `'use server'`." },
  },
  create(context) {
    return {
      Program(node) {
        const first = node.body[0]
        const ok =
          first?.type === "ExpressionStatement" &&
          first.directive === "use server"
        if (!ok) context.report({ node: first ?? node, messageId: "missing" })
      },
    }
  },
}

// One plugin object for both inline rules: flat config refuses to redefine a plugin
// name with a different object.
const localPlugin = {
  rules: {
    "require-server-only": requireServerOnly,
    "require-use-server": requireUseServer,
  },
}

// Import patterns, named once. Each file must match exactly one block that sets
// `no-restricted-imports`: in flat config a later block replaces the options, it does not merge.
const noDbInUi = {
  group: ["@/lib/db", "@/lib/db/*", "**/lib/db", "**/lib/db/*"],
  message:
    "Pages and components never import the db. Put the read in `_lib/queries.ts` or the write in `_lib/actions.ts`.",
}
const moduleViaIndex = {
  group: ["@/modules/*/*", "!@/modules/*/contracts"],
  message:
    "Import a module through its index.ts (`@/modules/<x>`); only `contracts.ts` (schemas, DTO types) may be imported directly.",
}
// Rule 6: callers that bring their own requester (other modules, system handlers, scripts)
// use queries.ts/commands.ts/errors.ts directly. index.ts would bind the session; repo/mappers are internal.
// A regex, not a glob: a glob on `@/modules/*` would also cover `@/modules/<x>/commands`.
const noSessionBoundModule = {
  regex: "^@/modules/[^/]+(/index|/repo|/mappers)?$",
  message:
    "Pass the requester you act for: import `@/modules/<x>/queries`, `/commands` or `/errors`, never index.ts (binds the session) or repo/mappers.",
}
const noDbInActionAdapter = {
  group: noDbInUi.group,
  message:
    "A route-level `actions.ts` is a module adapter: call `@/modules/<x>`, never the db. Db-backed actions live in `_lib/actions.ts`.",
}
const noComponentsInLib = {
  group: ["**/_components", "**/_components/*"],
  message:
    "`_lib` and `actions.ts` never import `_components`. Types the UI needs come from the query or module that returns them.",
}
const noRouteLibInApi = {
  group: [
    "**/_lib",
    "**/_lib/*",
    "**/actions",
    "**/actions.ts",
    "**/_components",
    "**/_components/*",
  ],
  message:
    "Route handlers never import a route's `_lib`, `actions.ts` or `_components`. Shared logic lives in `@/modules/<x>`.",
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),

  // Rule 2: only `_lib/*`, `lib/` and `modules/` may import the db.
  // `_lib` may import the db, but modules only through their index.ts.
  {
    files: ["app/**/_lib/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [moduleViaIndex, noComponentsInLib] },
      ],
    },
  },
  // After promotion, `_lib/` is gone and the route's `actions.ts` sits next to `page.tsx`.
  // It is an adapter over the module: no db, no `_components`, modules via index.ts.
  {
    files: ["app/**/actions.ts"],
    ignores: ["app/**/_lib/**", "app/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [noDbInActionAdapter, moduleViaIndex, noComponentsInLib] },
      ],
    },
  },
  // System route handlers (webhooks, cron) verify a secret, not a session: they call
  // queries.ts/commands.ts with the requester they act for (Rule 6).
  {
    files: ["app/api/system/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [noDbInUi, noRouteLibInApi, noSessionBoundModule] },
      ],
    },
  },
  // Route handlers are adapters: no db, no route `_lib`/`actions.ts`/`_components`, modules via index.ts.
  {
    files: ["app/api/**"],
    ignores: ["app/api/system/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [noDbInUi, noRouteLibInApi, moduleViaIndex] },
      ],
    },
  },
  // UI code (pages, components, hooks): no db, and modules only through their index.ts.
  {
    files: ["app/**", "components/**", "hooks/**"],
    ignores: ["app/**/_lib/**", "app/api/**", "app/**/actions.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [noDbInUi, moduleViaIndex] },
      ],
    },
  },

  // Rule 3: server-only on every file that touches db or auth.
  // schema.ts is exempt: drizzle-kit and seed.ts load it outside Next, where `server-only` throws.
  {
    files: [
      "app/**/_lib/**",
      "app/**/actions.ts",
      "app/api/**",
      "lib/db/**",
      "lib/auth.ts",
      "lib/auth/**",
      "modules/**",
    ],
    ignores: [
      "lib/db/migrations/**",
      "lib/db/schema.ts",
      "modules/*/contracts.ts",
      "**/*.test.ts",
    ],
    plugins: { local: localPlugin },
    rules: { "local/require-server-only": "error" },
  },

  // Rule 3, actions: `'use server'` first, then `import 'server-only'` (checked above).
  // Matches both `_lib/actions.ts` (before promotion) and the route-level adapter (after).
  {
    files: ["app/**/actions.ts"],
    plugins: { local: localPlugin },
    rules: { "local/require-use-server": "error" },
  },

  // Rule 4: lib/ never imports app/ (or modules/).
  {
    files: ["lib/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*", "../app", "../app/*", "../../app/*"],
              message: "lib/ never imports app/.",
            },
            {
              group: ["@/modules", "@/modules/*", "../modules/*"],
              message: "lib/ never imports modules/.",
            },
          ],
        },
      ],
    },
  },

  // Promoted modules: no Next, and app/ only through index.ts.
  {
    files: ["modules/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next",
              message:
                "modules/ never import next/*. Keep redirect/revalidate in the route's actions.ts.",
            },
          ],
          patterns: [
            {
              group: ["next/*"],
              message:
                "modules/ never import next/*. Keep redirect/revalidate in the route's actions.ts.",
            },
            {
              group: ["@/app", "@/app/*"],
              message: "modules/ never import app/.",
            },
            noSessionBoundModule,
          ],
        },
      ],
    },
  },

  // Rule 8: no `as` casts. Mappers and lib/db may cast where the types cannot express a shape;
  // `as const` is always allowed. components/ui is vendor code.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["components/ui/**", "modules/*/mappers.ts", "lib/db/**"],
    rules: {
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
    },
  },

  // Rule 9: lib/env.ts (and the db client) are the only readers of process.env.
  {
    files: ["app/**", "modules/**", "lib/**", "components/**", "hooks/**"],
    ignores: ["lib/env.ts", "lib/db/client.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read configuration from `@/lib/env`.",
        },
      ],
    },
  },

  // ADR 0001: only a module's index.ts binds the current user (`withUser`).
  // Everything else in a module takes `requester` and may import auth types only.
  {
    files: ["modules/**"],
    ignores: ["modules/*/index.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/auth", "@/lib/auth/*"],
              allowTypeImports: true,
              message:
                "Only a module's index.ts binds the user (withUser). Take `requester` and use `import type`.",
            },
          ],
        },
      ],
    },
  },
])

export default eslintConfig
