// The project's own lint rules, spread after the conventions' config in eslint.config.mjs.
// This file belongs to the project: a rollout of the conventions copies eslint.config.mjs again,
// never this file.
//
// eslint.config.mjs refuses to load if a block here sets a rule the conventions set
// (`no-restricted-imports`, `@typescript-eslint/no-restricted-imports`,
// `no-restricted-properties`, `@typescript-eslint/consistent-type-assertions`, the `local/*`
// rules): for a rule with options, a later block replaces the earlier options instead of adding to
// them. Boundaries the project adds use rules the conventions leave free, for example:
//
//   {
//     files: ["**/*.ts", "**/*.tsx"],
//     rules: {
//       // `integrations` is a leaf: it imports no other module.
//       "import/no-restricted-paths": ["error", { zones: [
//         { target: "./modules/integrations", from: "./modules", except: ["./integrations"] },
//       ] }],
//     },
//   },
//   {
//     files: ["**/*.ts", "**/*.tsx"],
//     ignores: ["lib/auth/**"],
//     rules: {
//       // Only lib/auth imports the auth library.
//       "no-restricted-syntax": ["error", {
//         selector: "ImportDeclaration[source.value=/^better-auth(\\u002F|$)/]",
//         message: "Only lib/auth/ imports better-auth.",
//       }],
//     },
//   },
//
// The same holds inside this file: set each rule in one block per file. Two blocks that both set
// `import/no-restricted-paths` for `**/*.ts` leave only the second one's zones. Keep shared zones
// in a const and give files that need fewer zones their own block with disjoint `files`.
//
// Each block names the decision it enforces (an ADR or the project's architecture notes).

const projectConfig = []

export default projectConfig
