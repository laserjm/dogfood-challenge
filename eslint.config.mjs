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

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),

  // Rule 2: only `_lib/*`, `lib/` and `modules/` may import the db.
  {
    files: ["app/**"],
    ignores: ["app/**/_lib/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db", "@/lib/db/*", "**/lib/db", "**/lib/db/*"],
              message: "Pages and components never import the db. Put the read in `_lib/queries.ts` or the write in `_lib/actions.ts`.",
            },
          ],
        },
      ],
    },
  },

  // Rule 3: server-only on every file that touches db or auth.
  // schema.ts is exempt: drizzle-kit and seed.ts load it outside Next, where `server-only` throws.
  {
    files: ["app/**/_lib/**", "lib/db/**", "lib/auth.ts", "lib/auth/**", "modules/**"],
    ignores: ["lib/db/migrations/**", "lib/db/schema.ts"],
    plugins: { local: { rules: { "require-server-only": requireServerOnly } } },
    rules: { "local/require-server-only": "error" },
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
  {
    files: ["app/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/modules/*/*"], message: "Import a module only through its index.ts (`@/modules/<x>`)." },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
