# ADR 0001: Where the current user is resolved

- **Status:** Accepted
- **Date:** 2026-11-08
- **Deciders:** Michael Laser
- **Context stage:** Stage 3 of the dogfood challenge (after promoting `chats` to `modules/`)

## Context

At Stage 3 the chat route handler needed the same logic as a server action, so `chats` was
promoted to `modules/chats/` (hard trigger 1 in `CHALLENGE_LOG.md`). The log's module rules say:

- use cases take the user as a parameter (`requester`), so pages, actions, route handlers and
  later webhooks can share them;
- a module never imports `next/*`, so its logic can be unit-tested without the framework.

Following those rules literally left `app/(chat)/_lib/queries.ts` as a pure pass-through:

```ts
export async function getChat(id: string) {
  const user = await requireUser()
  if (!isUuid(id)) return null
  return chats.getChat(user, id)
}
```

Every adapter (page, server component, action, route handler) had to resolve the user and pass
it on. We wanted better DX without giving up the separation between "who is calling" and "what
the use case does".

### What is common practice

| Source                                          | Who resolves the user                                                                                      | How business logic gets it                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Next 16 data-security guide (Data Access Layer) | The DAL function itself, via a `cache()`d `getCurrentUser()`; "don't pass values, read back cached values" | Not passed; read inside the DAL                  |
| tRPC `protectedProcedure`                       | A middleware, once, in the procedure builder                                                               | Injected as `ctx.user`                           |
| next-safe-action `authActionClient`             | A middleware on the client builder                                                                         | Injected as `ctx.user`                           |
| Hexagonal / clean architecture                  | The adapter                                                                                                | Parameter (principal) of the application service |

All of them resolve the user in **one** place. They differ in whether that place is inside the
data layer (Next) or wrapped around it (tRPC, next-safe-action).

## Options

### Option 0: Keep `_lib/queries.ts` as the adapter (status quo)

Pages call `_lib/queries.ts`, which calls `requireUser()` and parses ids, then calls the module
with the user.

- ✅ Already works; matches the original log rules.
- ❌ One pass-through function per query; two files to touch per read.
- ❌ Not enforced: a page can still call the module directly.

### Option A: Module functions call `requireUser()` themselves (Next DAL style)

```ts
// modules/chats/queries.ts
export async function getChat(chatId: string) {
  const user = await requireUser()
  ...
}
// page.tsx
const chat = await chats.getChat(chatId)
```

- ✅ Simplest; exactly what the Next docs show. `_lib/queries.ts` disappears.
- ❌ Modules depend on request context: once `lib/auth` reads `cookies()`, "modules never import
  `next/*`" is broken indirectly, and unit tests have to mock `lib/auth` (soft trigger 6).
- ❌ Webhooks and cron jobs have no session and need a separate entry point.

### Option B: Keep `requester`, drop `_lib/queries.ts`, pages call `requireUser()`

```ts
// page.tsx
const user = await requireUser()
const chat = await chats.getChat(user, chatId)
```

- ✅ The compiler enforces the check: no `getChat` without a user. Id parsing moves into the module.
- ❌ Every page and async server component repeats the auth line; auth spreads into the UI.

### Option C: Bind the user once, in the module's `index.ts`

Internal module functions keep taking `requester`. The public API binds the current user with a
small helper in `lib/auth.ts`:

```ts
// lib/auth.ts
export function withUser<A extends unknown[], R>(
  fn: (requester: SessionUser, ...args: A) => Promise<R>
) {
  return async (...args: A): Promise<R> => fn(await requireUser(), ...args)
}

// modules/chats/index.ts
export const getChat = withUser(queries.getChat)
export const deleteChat = withUser(commands.deleteChat)

// page.tsx
const chat = await chats.getChat(chatId)
```

- ✅ Same call-site DX as Option A: `chats.getChat(chatId)`.
- ✅ "Who is calling" lives in one reviewable file per module; internals stay framework-free
  and testable with a plain `requester`.
- ✅ Lint enforces it: inside `modules/**`, only `index.ts` may import `@/lib/auth` as a value.
- ❌ One extra helper (four lines) and an extra wrapper in `index.ts` per exported function.
- ⚠️ In the route handler, `saveAssistantMessage` resolves the user inside `onEnd`, after the
  response has started. Fine for the current db-backed user; must be re-checked once a session
  reads `cookies()`.

## Decision

**Option C.**

The decider leans towards Option A for its simplicity. C was chosen because it keeps the two
existing log rules (no `next/*` in modules, testable without Next) without rewriting them, while
giving the same call-site DX as A. It is also the smallest change from the existing code, which
already takes `requester`.

The door to Option A stays open on purpose: this is a sample app, and the switch is cheap
(see below).

## Consequences

- `app/(chat)/_lib/queries.ts` is deleted. Pages and server components call
  `import * as chats from "@/modules/chats"` directly.
- `_lib/actions.ts` stays as the `'use server'` boundary: parse → module command → map
  `ChatNotFound` to `notFound()` → revalidate/redirect. It no longer calls `requireUser()`.
- The route handler no longer calls `requireUser()`; it parses, then calls the module.
- The module parses ids itself (`chatIdInput` in `contracts.ts`): queries return `null`,
  commands throw `ChatNotFound`.
- Rule 1 in `CHALLENGE_LOG.md` becomes: "The current user is resolved in exactly one place."
- New lint rule: in `modules/**` except `index.ts`, `@/lib/auth` may only be imported with
  `import type`.

## Switching to Option A later

If C turns out to be ceremony with no payoff (no webhook, no unit tests without Next):

1. In each module function, replace the `requester` parameter with
   `const requester = await requireUser()` on the first line.
2. In `index.ts`, replace `export const x = withUser(queries.x)` with `export { x } from "./queries"`.
3. Drop the `@/lib/auth` lint restriction for `modules/**`, and update Rule 1 and the
   promotion section in `CHALLENGE_LOG.md`.
4. Delete `withUser` once nothing uses it.

Call sites in `app/` don't change, because `chats.getChat(chatId)` keeps its signature.

## Sources

- Next.js 16 docs, "Data Security" and "Authentication" guides
  (`node_modules/next/dist/docs/01-app/02-guides/data-security.md`, `authentication.md`)
- [next-safe-action: middleware](https://next-safe-action.dev/docs/define-actions/middleware)
- [next-safe-action: safe action client](https://next-safe-action.dev/docs/api/safe-action-client)
- [tRPC auth skill (TanStack registry)](https://tanstack.com/intent/registry/%40trpc__server/auth)
- [Achromatic: protect tRPC endpoints](https://www.achromatic.dev/docs/starter-kits/pro-nextjs-drizzle/trpc/protect-endpoint)
