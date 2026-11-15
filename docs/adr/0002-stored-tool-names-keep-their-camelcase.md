# ADR 0002: Stored tool names keep their camelCase

- **Status:** Superseded by `docs/EXTENSIONS.md`, E5 (conventions 0.9.0). The tool names'
  case style is an extension point now, so it departs from nothing.
- **Date:** 2026-11-15
- **Deciders:** Michael Laser
- **Context stage:** Rollout of conventions 0.7.0

## Context

Conventions 0.7.0 adds a NAMING.md row for agent tools: the tools object is `<noun>Tools`, and
"the tool's own name is `snake_case` and never renamed once conversations store it".

`modules/chats/tools.ts` exports `chatTools` (fits) with three tools named in camelCase:
`getWeatherInformation`, `askForConfirmation` and `getLocation`. They predate the row. Every
assistant message stores its parts in `messages.parts` (JSON), and a tool part's `type` is
`tool-<name>` (`tool-getLocation`). The browser switches on those types (`tool-row.tsx`), answers
the client tools by name (`chat-provider.tsx`), and `contracts.ts` validates outputs against
`clientToolNames`. The model also sees the names again whenever a stored history is replayed.

So the row's two halves conflict here: `snake_case` asks for a rename, and "never renamed once
conversations store it" forbids one.

## Options

### Option 0: Keep the stored names

- ✅ Stored conversations keep rendering and continuing; no data migration.
- ✅ Follows the half of the row that protects data.
- ❌ The names don't match the `snake_case` pattern.

### Option A: Rename to `snake_case`, migrate stored messages

```sql
-- custom migration (Rule 10): rewrite every stored tool part's type
UPDATE messages SET parts = replace(parts::text, '"tool-getLocation"', '"tool-get_location"')::json …
```

- ✅ Matches the pattern.
- ❌ A data migration over JSON for a naming pattern, plus the UI, contracts and tests in one
  step; a missed spelling breaks old conversations silently.
- ❌ Breaks "never renamed once conversations store it".

### Option B: New tools in `snake_case`, old ones keep their names

- ✅ Matches the pattern for everything new.
- ❌ Two spellings side by side in `tools.ts`, which reads like an accident.

## Decision

**Option 0.** The existing three tools keep their camelCase names, because conversations store
them and the row itself says a stored name is never renamed. "Business logic lives in
TypeScript" and "end-to-end type safety" don't decide this; "developer experience" does: a
mixed `tools.ts` (Option B) reads worse than one consistent spelling. A new tool added to
`chatTools` follows this file's camelCase until the owner decides otherwise; a new tools object in
another module uses `snake_case`.

## Consequences

- No files change.
- Departs from NAMING.md, "Agent tool": the tool names in `modules/chats/tools.ts` are camelCase,
  not `snake_case`.
- Nothing enforces tool names; review.
- Challenged in the 0.7.0 rollout PR: the row could say that a name conversations already store
  keeps its spelling.

## Reversing this decision

Write a custom migration (`drizzle-kit generate --custom`) that rewrites the tool part types in
`messages.parts`, then rename the keys in `toolSchemas`, `chatTools` and `clientToolNames` and the
`tool-<name>` cases in `tool-row.tsx` and `chat-provider.tsx`. The compiler finds every UI case
once `toolSchemas` changes, because the part types are inferred from it.

## Sources

- `docs/NAMING.md`, "Agent tool"
- `docs/CONVENTIONS.md`, Rule 10 (custom migrations for backfills)
