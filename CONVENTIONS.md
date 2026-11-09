# Conventions

How a Next.js app on Drizzle, Postgres and zod is organized, and when a route grows into a
module. Rules that lint enforces are only pointed at here; the project's `eslint.config.mjs` is the source of truth for the import graph.

## Why

These rules optimize for four things, in this order. When two rules conflict, the earlier
principle wins.

1. **Business logic lives in TypeScript**, not in database functions, not in React components.
2. **End-to-end type safety**: one source of truth for each shape, inferred everywhere else.
3. **Developer experience**: a feature's code sits together; you can find it in one folder.
4. **Just enough layering**: layers exist to control dependency direction and make logic
   testable. Where there are no rules, there is no domain layer.

## Layout

```text
app/
├─ (<group>)/
│  ├─ page.tsx            # calls queries or the module, never the db
│  ├─ _lib/               # self-contained route only; deleted on promotion
│  │  ├─ queries.ts       # reads: requireUser() → db → DTO
│  │  └─ actions.ts       # 'use server' writes: requireUser() → parse → db → revalidate/redirect
│  ├─ actions.ts          # module-backed route only: 'use server' adapter, parse → module → map errors → revalidate/redirect
│  └─ _components/        # render; a server component may await a query, never the db
├─ api/
│  ├─ <x>/route.ts        # route handler for the signed-in user: adapter, parse → module → respond/stream
│  └─ system/<x>/route.ts # webhook or cron: verifies a secret, not a session; names the requester it acts for
modules/<x>/              # one concept each (e.g. chats); created on a promotion trigger
├─ index.ts               # session-bound API for app/: binds the current user (withUser)
├─ contracts.ts           # zod inputs in, DTO types out; the module's one browser-safe file
├─ queries.ts             # reads (requester, …) → DTO | null
├─ commands.ts            # writes (requester, input); throw domain errors
├─ domain.ts              # pure business rules over DTOs: calculations, state transitions (on trigger)
├─ policy.ts              # authorization beyond "the owner can"; pure functions (on trigger)
├─ repo.ts                # db queries shared by reads and writes (the ownership check)
├─ mappers.ts             # row ⇄ DTO
└─ errors.ts              # domain error classes
components/               # shared UI; components/ui/* is shadcn, untouched
lib/
├─ auth.ts                # getUser / requireUser (cache()), withUser
├─ env.ts                 # validated env; the only reader of process.env
├─ <service>.ts           # client for an external service (AI, mail): built from env, handed to modules by adapters
└─ db/                    # client, schema (code-first), generated migrations; errors.ts names the driver codes
scripts/                  # seed and maintenance; runs outside Next (see Outside Next)
test/                     # global-setup.ts, factories.ts; runs outside Next (see Outside Next)
```

A route is in one of two states, and the folder shows which: `_lib/` means the route talks to the
db itself; a bare `actions.ts` next to `page.tsx` means a module does.

## Rules

1. **The current user is resolved in exactly one place.** Self-contained route: first line of every
   `_lib` function. Module: `index.ts` wraps every export in `withUser`; internals take `requester`.
   Adapters never pass a user. _Lint for modules, review for `_lib`._
2. **Every read filters by the caller, every write is scoped by the caller**
   (`eq(table.userId, requester.id)`). The ownership check is the policy. _Review, plus Testing §5._
3. **Only `_lib/*`, `modules/*` and `lib/` import the db** inside the Next server. The files listed
   under _Outside Next_ bring their own. _Lint._
4. **Server-side code starts with `import 'server-only'`;** in `actions.ts`, `'use server'` comes
   first. Exempt: `contracts.ts` (browser-safe by design), `schema.ts` (loaded outside Next) and
   everything listed under _Outside Next_. _Lint._
5. **Dependencies point one way.** `lib/` imports neither `app/` nor `modules/`; `modules/` imports
   neither `app/` nor `next/*`. Two modules that import each other are merged, or a third is
   extracted. _Lint, cycles by review._
6. **Three doors into a module, and no others.**
   - `app/` imports `index.ts` as a namespace (`import * as chats from "@/modules/chats"`): the
     session-bound API.
   - Other modules, system callers (`scripts/`, `app/api/system/`) and tests import `queries.ts`,
     `commands.ts` and `errors.ts` directly and pass the requester they act for. Never `index.ts`,
     which would bind the session; never `repo.ts` or `mappers.ts`.
   - UI, client components included, imports `contracts.ts` for input schemas and DTO types, so a
     form validates with the same schema the action parses.
     `contracts.ts` itself imports nothing but zod and types, so it can't drag the server into the
     bundle.

   _Lint._

7. **UI never decides permissions.** Queries put flags on the DTO (`canDelete`); components render
   them. _Review._
8. **No `as` cast** outside `mappers.ts`, `lib/db/` and `as const`. If the types don't line up, fix
   the schema or add a mapper. `components/ui/*` is vendor code and exempt. _Lint._
9. **`lib/env.ts` is the only reader of `process.env`** inside the Next server. Everything else,
   the db client included, reads `env.X`, so a missing variable fails at startup, not in a
   request. The files listed under _Outside Next_ read `process.env` themselves. _Lint._
10. **The schema is code-first and the database holds no logic.** `lib/db/schema.ts` is the source
    of truth, migrations are generated and never hand-edited, and there are no database functions
    and no triggers except `updated_at`. _Review._
11. **A deviation is written down before it happens.** An `eslint-disable` carries a comment that
    links an ADR. A rule nobody can follow is changed in this file, not disabled in source.
    _Review._
12. **A module imports from `lib/` only the db, and types.** An external service (AI provider,
    mail, payments) is a client in `lib/<service>.ts`, built from `env`. The adapter constructs it
    and passes it in, so a module never configures a provider and its tests need no provider
    settings. `index.ts` is the one exception, for `lib/auth` (Rule 1). _Lint._

## Outside Next

Four places run in plain Node, where `server-only` throws on import: the tool configs
(`drizzle.config.ts`, `vitest.config.ts`), `scripts/` and `test/`. They are the one exemption to
Rules 3, 4 and 9, and this list is the exemption: a file joins it here before it joins the repo.

- **No value import of a `server-only` file.** `lib/env.ts`, `lib/db/client.ts`, `lib/auth.ts`
  and `modules/*` are off limits; types are fine. `lib/db/schema.ts` carries no `server-only` for
  exactly this reason. _Lint for `scripts/`, review for the rest._
- **They read the environment themselves.** `dotenv` loads `.env.local`, then `process.env.X`
  directly. A missing variable fails on the first query instead of at startup; acceptable for a
  tool a developer runs by hand, not for anything that serves a request. _Review._
- **`scripts/` build their own db client** from `process.env.DATABASE_URL` and write raw rows
  through `schema.ts`. That is arrange code, not a use case, so Rule 2 does not apply.
- **`test/` goes through `lib/db/client.ts`.** `vitest.config.ts` swaps `server-only` for a no-op
  and sets `DATABASE_URL` to the test database, so `factories.ts` shares the client with the
  module under test (Testing §2, §4). `global-setup.ts` runs before that env is applied and builds
  its own client from the project config.

> **Open:** Rule 6 lets `scripts/` call `commands.ts`, but `commands.ts` is `server-only` and no
> script can load it today. A maintenance script that needs a use case, not raw rows, must run
> with the same `server-only` swap `vitest.config.ts` uses. Decide when the first one is written.

## The two states of a route

**Self-contained (the default).** `_lib/queries.ts` and `_lib/actions.ts` talk to the db directly.
Every function calls `requireUser()` first and parses its ids before they reach the db
(`z.uuid().safeParse`). A query returns `null` for a missing, foreign or malformed id; an action
calls `notFound()`. DTO types live in the `queries.ts` that returns them; once an action takes more
than an id, zod inputs and DTOs move to `_lib/contracts.ts`. Business rules stay inline; wanting to
unit test one is soft trigger 6. Nothing here is testable without Next, and that is accepted until
trigger 6 meets a second one.

**Module-backed.** `modules/<x>/` holds the use cases, free of request context and `next/*`.
`index.ts` binds the current user for `app/`; everyone else passes a requester (Rule 6). The module
parses its own ids (`contracts.ts`); queries return `null`, commands throw a domain error. Pure
rules get their own file as soon as one is needed twice or deserves a unit test: `domain.ts` for
calculations and state transitions, `policy.ts` for authorization beyond "the owner can". The
route keeps a thin `actions.ts` next to `page.tsx` as the `'use server'` boundary: parse → module →
map domain errors → `revalidatePath` / `redirect`. Pages and server components call the module
directly; `_lib/` is deleted.

**Data in components.** A server component in `_components/` may await a query it owns (e.g. the
sidebar's chat list), wrapped in `<Suspense>` next to it. Client components get data as props or a
promise (`use`), and import DTO types and input schemas from `contracts.ts`; everything else in a
module is `server-only` and never reaches the browser bundle.

## Errors

A command throws, an adapter maps. Nothing above the module sees a driver error, and nothing in
the UI sees an error class.

| Case                                | Query / command                                       | Action                                                                 | Route handler               |
| ----------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------- |
| Missing, not-owned or malformed id  | query returns `null`; command throws `<Noun>NotFound` | `notFound()`                                                           | `404` + `{ error }`         |
| Forbidden (once `policy.ts` exists) | command throws `Forbidden`                            | `forbidden()` (needs `experimental.authInterrupts`), else `notFound()` | `403` + `{ error }`         |
| Constraint refused the write        | command catches the driver error, throws `Conflict`   | `{ error }`                                                            | `409` + `{ error }`         |
| Invalid input                       | never reached: the adapter parses with `contracts.ts` | `{ error }`                                                            | `400` + `{ error }`         |
| Bug, broken invariant               | `throw new Error(…)`                                  | nearest `error.tsx`                                                    | `500` + `{ error }`, logged |

- One answer for missing, foreign and malformed ids, so ownership isn't leaked. Until `policy.ts`
  exists, "not owned" is "not found" by design; `Forbidden` arrives with hard trigger 4.
- `{ error }` holds copy the user can read (`useActionState`), never a class name or a tag.
- A route handler answers JSON `{ error }` on every status, `404` and `500` included: `notFound()`
  would render the HTML page.
- When a module must produce user-facing text itself, as in an error chunk after a stream has
  started, the adapter hands it in as a function. A module never holds copy.
- The driver's error codes are recognized in one place, `lib/db/errors.ts` (`23505` unique,
  `23503` foreign key). A command catches there and throws `Conflict`; nothing else reads a driver
  error.
- Error classes live in `modules/<x>/errors.ts`. A self-contained route has no adapter layer to
  map them, so it calls `notFound()` or returns `{ error }` directly; wanting named errors there is
  soft trigger 8.

## Promotion: when `_lib` becomes `modules/<x>/`

Promote when **one** hard trigger is hit, or **two** soft ones. One concept at a time. Not
triggers: "it might be reused later", many small actions in one file, a cleaner folder tree.

**Hard triggers (any one):**

1. **A second adapter needs the same logic.** Route handler, webhook, cron, CLI. Server actions
   can't be imported there, and a copy means two ownership checks to keep in sync.
2. **Two route groups need the same query or write.** Cross-importing another route's `_lib` is
   the smell.
3. **A write touches more than one aggregate.** Creating a chat also charges credits. The module
   that owns the write calls the other module's `commands.ts` with the same requester (Rule 6).
4. **Authorization is no longer "the owner".** Roles, sharing, admin override. The rule needs a
   name and a unit test: `modules/<x>/policy.ts`, pure functions, no db.

**Soft triggers (two together):**

5. **`actions.ts` or `queries.ts` passes about 200 lines, or one function about 40.** Length from
   logic counts; length from the number of use cases doesn't.
6. **You want to unit test the logic without Next.** `requireUser`, `revalidatePath` and the
   business rule share a function, so the test needs the framework.
7. **The same drizzle query is written twice** in the route, usually in a read and in a write's
   ownership check. The module's `repo.ts` is the fix.
8. **You want named errors.** The adapter has to tell "not found" from "invalid input" from "bug",
   and `new Error("…")` strings are being compared.

## Deliberately dropped

- **A branded `AuthCtx` type only `lib/auth` can mint.** Lint already restricts who imports
  `lib/auth` as a value, and a brand would force every test to mint one. Revisit if a second place
  starts constructing users.
- **A "who may import what" table here.** It drifted; `eslint.config.mjs` is the table.
- **`index.ts` as a public API before `modules/` exists.** A self-contained route has none.
- **Full module layering from day one.** `domain/`, `application/`, `infra/` folders and ports
  are correct and too heavy for a route that owns one table. Flat files, promoted on trigger.
- **`Result` types and tagged error unions.** Thrown classes mapped in the adapter are the
  TypeScript default and cost no runtime package. The price is exhaustiveness: a forgotten
  `instanceof` is a 500, not a compile error. Testing §5 covers the common case.
- **A separate browser-safe `index.ts` and server-only `server.ts`.** One server-only `index.ts`
  plus a browser-safe `contracts.ts` gives the same guarantee with one file fewer.
- **Cache tags, cross-module events, branded ids.** Not until `cacheComponents` is on, a second
  subscriber exists, or a swapped-argument bug slips past Testing §5.

## Testing

| Level      | Self-contained route                       | Module-backed route                                             |
| ---------- | ------------------------------------------ | --------------------------------------------------------------- |
| API tests  | none (would need Next; see soft trigger 6) | every use case in `queries.ts` and `commands.ts`, real Postgres |
| Unit tests | business-critical pure functions only      | `domain.ts` and `policy.ts`, by example tables                  |
| UI tests   | business-critical workflows only, E2E      | same; the only coverage adapters in `app/` get                  |

> **TODO:** define "business critical": what makes a unit or workflow worth its own test, who
> decides, and where that is written down.

1. **Test the use cases, colocated.** `modules/<x>/queries.test.ts` and `commands.test.ts` call the
   functions with an explicit `requester`, as `index.ts` does after `withUser`. One
   `describe("<useCase>")` per function, `it("<behavior in plain words>")`. `index.ts`, `repo.ts`
   and `mappers.ts` are covered through them; a unit already exercised by a use case gets no test.
2. **Real Postgres, no db mocks.** The ownership check is a `WHERE` clause; a mock tests the mock.
   `test/global-setup.ts` owns the test database (name must end in `_test`; `TEST_DATABASE_URL`
   overrides the default).
3. **Every test creates its own users.** No shared fixtures. Fresh users isolate tests through the
   same ownership rule the app uses, so files run in parallel without cleanup.
4. **Arrange with factories, assert through the API.** `test/factories.ts` inserts raw rows, so a
   query test doesn't depend on a command. Read a table directly only when the API can't observe
   the behavior, and say why in a comment.
5. **Rule 2 gets a test.** Every use case that takes an id has a "someone else's id" case (returns
   `null` or throws, and changes nothing) and a malformed-id case next to its happy path.
6. **Never mock `next/*`.** A test that needs Next means the logic sits in the adapter and belongs
   in the module.

```bash
createdb <app>_test   # once, on the local Postgres
pnpm test
```

## Naming

Files and folders are `kebab-case`; route folders follow Next (`(group)`, `[param]`, `_private`).
A module is named after a business noun, never a technical one: not `utils`, `common`, `shared`.

### UI and use cases

| Kind                 | File                                                                     | Identifier                                                                                                                               | Example                                                   |
| -------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Server action        | `actions.ts`                                                             | `<useCase>Action`                                                                                                                        | `deleteChatAction`                                        |
| Query                | `queries.ts`                                                             | `get<Noun>` / `get<Nouns>`, returns `null` when missing (there is no `find`); in a module `(requester, …)`, bound to `(…)` by `index.ts` | `getChat(requester, id)` → `chats.getChat(id)`            |
| Command              | `modules/<x>/commands.ts`                                                | the use case's name, same binding                                                                                                        | `deleteChat(requester, id)` → `chats.deleteChat(id)`      |
| Domain rule          | `modules/<x>/domain.ts`, `policy.ts`                                     | a business verb or predicate, pure                                                                                                       | `applyCredits(chat, amount)`, `canShare(requester, chat)` |
| Input contract (zod) | `contracts.ts`                                                           | `<useCase>Input`; inferred type `<UseCase>Input`                                                                                         | `sendMessageInput`, `SendMessageInput`                    |
| Error class          | `errors.ts`                                                              | the fact that blocks the action                                                                                                          | `ChatNotFound`, `Conflict`                                |
| Component            | `components/<noun>-<role>.tsx`, or `app/.../_components/` if route-local | `<Noun><Role>`, props `<Component>Props`; client components start with `'use client'`, no suffix                                         | `ChatList`, `ChatListProps`                               |
| Hook                 | `hooks/use-<thing>.ts`, or `_components/` if route-local                 | `use<Thing>`                                                                                                                             | `useIsMobile`                                             |
| Page                 | `page.tsx`                                                               | `<Noun>Page` / `<Nouns>Page`                                                                                                             | `ChatPage`, `ChatsPage`                                   |

Roles (last word of a component name): `List`, `Table`, `Card`, `Row`, `Form`, `Dialog`, `Sheet`,
`Panel`, `Badge`, `Summary`, `Picker`, `Select`, `Filters`, `Toolbar`, `Empty`, `Provider`, or any
name from the [shadcn components list](https://ui.shadcn.com/docs/components.md). The noun may be
`App` for shell pieces (`AppSidebar`); a role may stack to describe a state (`ChatListSkeleton`).
Extend this list rather than inventing a role. Unexported helpers are free-form as long as they
don't mimic `*Action`, `*Page` or a verb-first use-case name. `components/ui/*` is shadcn: don't
rename it, don't add your own components there.

### Data

| Kind     | Where                                                                                   | Identifier                                | Example                      |
| -------- | --------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------- |
| Table    | `lib/db/schema.ts` (exports tables only)                                                | `<nouns>Table`; SQL name plural `<nouns>` | `chatsTable` → `"chats"`     |
| Row type | not exported; derive inline where needed                                                | `typeof <nouns>Table.$inferSelect`        |                              |
| DTO      | `contracts.ts`; in a self-contained route without one, the `queries.ts` that returns it | `<Noun><Shape>`                           | `ChatDetail`, `ChatListItem` |
| Mapper   | `modules/<x>/mappers.ts`, not exported                                                  | `to<TargetType>`                          | `toChatMessage(row)`         |

Inputs are zod schemas because they are untrusted; DTOs are plain types because the data layer
builds them. UI imports DTO types, never a row type.

## Sources of truth

- This file: the rules and their numbers. A comment in `eslint.config.mjs`, an ADR or a log entry
  that cites "Rule n" means the n-th rule above; renumbering here renumbers them.
- `eslint.config.mjs`: the import graph, `server-only`, `'use server'`, casts, `process.env`, what
  a module may import from `lib/`.
- `docs/adr/`: every decision that interprets or
  deviates from a rule, with the options considered and how to reverse it.
- `test/global-setup.ts`, `test/factories.ts`: test database and fixtures.
- `lib/db/errors.ts`: the one place that knows the driver's error codes.
