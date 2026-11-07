import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Local rule: file must start with `import 'server-only'`.
// Used for files that touch the db or auth so they can never end up in a client bundle.
const requireServerOnly = {
  meta: { type: "problem", messages: { missing: "File must begin with `import 'server-only'`." } },
  create(context) {
    return {
      Program(node) {
        // Skip leading directives such as "use server".
        const first = node.body.find((n) => !(n.type === "ExpressionStatement" && n.directive));
        const ok =
          first?.type === "ImportDeclaration" && first.source.value === "server-only";
        if (!ok) context.report({ node: first ?? node, messageId: "missing" });
      },
    };
  },
};

// Local rule: file must start with the `'use server'` directive.
// Without it, `_lib/actions.ts` exports plain functions and forms can't call them.
const requireUseServer = {
  meta: { type: "problem", messages: { missing: "File must begin with `'use server'`." } },
  create(context) {
    return {
      Program(node) {
        const first = node.body[0];
        const ok = first?.type === "ExpressionStatement" && first.directive === "use server";
        if (!ok) context.report({ node: first ?? node, messageId: "missing" });
      },
    };
  },
};

// One plugin object for both inline rules: flat config refuses to redefine a plugin
// name with a different object.
const localPlugin = {
  rules: { "require-server-only": requireServerOnly, "require-use-server": requireUseServer },
};

// Import patterns, named once. Each file must match exactly one block that sets
// `no-restricted-imports`: in flat config a later block replaces the options, it does not merge.
const noDbInUi = {
  group: ["@/lib/db", "@/lib/db/*", "**/lib/db", "**/lib/db/*"],
  message:
    "Pages and components never import the db. Put the read in `_lib/queries.ts` or the write in `_lib/actions.ts`.",
};
const moduleViaIndex = {
  group: ["@/modules/*/*"],
  message: "Import a module only through its index.ts (`@/modules/<x>`).",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),

  // Rule 2: only `_lib/*`, `lib/` and `modules/` may import the db.
  // `_lib` may import the db, but modules only through their index.ts.
  {
    files: ["app/**/_lib/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [moduleViaIndex] }],
    },
  },
  // UI code (pages, components, hooks): no db, and modules only through their index.ts.
  {
    files: ["app/**", "components/**", "hooks/**"],
    ignores: ["app/**/_lib/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noDbInUi, moduleViaIndex] }],
    },
  },

  // Rule 3: server-only on every file that touches db or auth.
  // schema.ts is exempt: drizzle-kit and seed.ts load it outside Next, where `server-only` throws.
  {
    files: ["app/**/_lib/**", "lib/db/**", "lib/auth.ts", "lib/auth/**", "modules/**"],
    ignores: ["lib/db/migrations/**", "lib/db/schema.ts"],
    plugins: { local: localPlugin },
    rules: { "local/require-server-only": "error" },
  },

  // Rule 3, actions: `'use server'` first, then `import 'server-only'` (checked above).
  {
    files: ["app/**/_lib/actions.ts"],
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
            { group: ["@/app", "@/app/*", "../app", "../app/*", "../../app/*"], message: "lib/ never imports app/." },
            { group: ["@/modules", "@/modules/*", "../modules/*"], message: "lib/ never imports modules/." },
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
          paths: [{ name: "next", message: "modules/ never import next/*. Keep redirect/revalidate in the route's actions.ts." }],
          patterns: [
            { group: ["next/*"], message: "modules/ never import next/*. Keep redirect/revalidate in the route's actions.ts." },
            { group: ["@/app", "@/app/*"], message: "modules/ never import app/." },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
