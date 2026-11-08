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
├─ commands.ts            # writes (requester, input); throw domain errors; exports use cases only
├─ domain.ts              # pure business rules over DTOs: calculations, state transitions (on trigger)
├─ policy.ts              # authorization beyond "the owner can"; pure functions (on trigger)
├─ repo.ts                # db queries shared by reads and writes (the ownership check)
├─ mappers.ts             # row ⇄ DTO
└─ errors.ts              # domain error classes
components/               # shared UI; components/ui/* is shadcn, untouched
lib/
├─ auth.ts                # getUser / requireUser (cache()), withUser
├─ env.ts                 # validated env; the only reader of process.env; parsed on first read, not on import
├─ <service>.ts           # client for an external service (AI, mail): built from env, handed to modules by adapters;
│                         #   also the readable text for that service's failures (describe<Service>Error)
└─ db/                    # client, schema (code-first), generated migrations; errors.ts names the driver codes
scripts/                  # seed (a fixture) and maintenance (a system caller); run outside Next
test/                     # global-setup (test database) and factories (raw rows); run outside Next
drizzle.config.ts         # tool configs and Next's root files (instrumentation.ts, proxy.ts):
vitest.config.ts          #   loaded by a tool or by Next itself, never imported by app code
instrumentation.ts
```

A route is in one of two states, and the folder shows which: `_lib/` means the route talks to the
db itself; a bare `actions.ts` next to `page.tsx` means a module does.

**Code that runs outside Next.** `drizzle-kit`, `vitest` and `tsx scripts/…` load files without
Next's bundler. Two things follow. `server-only` throws there, so a file such a tool loads can't
start with it (Rule 4 lists them). And `.env.local` isn't loaded, so a tool entry point loads the
env files itself before it reads `env` (Rule 9). Because `lib/env.ts` parses on first read, import
order doesn't matter.

## Rules

1. **The current user is resolved in exactly one place.** Self-contained route: first line of every
   `_lib` function. Module: `index.ts` wraps every export in `withUser`; internals take `requester`.
   Adapters never pass a user. _Lint for modules, review for `_lib`._
2. **Every read filters by the caller, every write is scoped by the caller**
   (`eq(table.userId, requester.id)`). The ownership check is the policy. _Review, plus Testing §5._
3. **Only `_lib/*`, `modules/*` and `lib/` import the db.** Fixtures are the exception:
   `test/` and `scripts/seed.ts` write raw rows to arrange state, and because they run outside
   Next they build their own client from `env` (`lib/db/client.ts` is `server-only`). A script
   that performs a use case is not a fixture; it goes through `commands.ts` (Rule 6). _Lint._
4. **Server-side code starts with `import 'server-only'`;** in `actions.ts`, `'use server'` comes
   first. Exempt: `contracts.ts` (browser-safe by design); every file a tool loads outside Next,
   where `server-only` throws: `schema.ts`, `lib/env.ts`, tool configs, `scripts/` and `test/`;
   and Next's root files (`instrumentation.ts`), which no app code imports. `lib/env.ts` holds no
   values in source: imported into the browser it reads an empty `process.env` and fails loudly
   instead of leaking. _Lint._
5. **Dependencies point one way.** `lib/` imports neither `app/` nor `modules/`; `modules/` imports
   neither `app/` nor `next/*`. Packages are allowed, `ai` included: a use case that stores a
   streamed reply has to own the stream, because the finished message only exists in the
   stream's end callback. Two modules that import each other are merged, or a third is
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
   the schema or add a mapper. `components/ui/*` is vendor code and exempt. A json column typed
   with `$type<…>()` is a cast too: when its shape belongs to an SDK (a `UIMessage`'s parts), the
   query validates the rows with the SDK's own validator (`validateUIMessages` in `ai`) before it
   returns the DTO, and a row that fails is a bug. _Lint, `$type` by review._
9. **`lib/env.ts` is the only reader of `process.env`.** Everything else, the db client included,
   reads `env.X`, so a missing variable fails at startup, not in a request. Outside Next, a tool
   entry point (`drizzle.config.ts`, `scripts/*`) first loads the env files the way Next does, then
   reads `env` like everything else. The one other reader is a test config that _sets_ the
   environment for a run (`vitest.config.ts` choosing `TEST_DATABASE_URL`): it produces
   configuration rather than consuming it. _Lint for app code, review for tools._
10. **The schema is code-first and the database holds no logic.** `lib/db/schema.ts` is the source
    of truth and schema migrations are generated. A data change that a schema change needs (filling
    a column before `SET NOT NULL`) is its own custom migration (`drizzle-kit generate --custom`)
    between two generated ones; a one-off backfill is not database logic. No migration is edited
    once it has been applied anywhere. There are no database functions and no triggers except
    `updated_at`. _Review._
11. **A deviation is written down before it happens.** An `eslint-disable` carries a comment that
    links an ADR. A rule nobody can follow is changed in this file, not disabled in source.
    _Review._
12. **A module imports from `lib/` only the db, and types.** An external service (AI provider,
    mail, payments) is a client in `lib/<service>.ts`, built from `env`. The adapter constructs it
    and passes it in, so a module never configures a provider and its tests need no provider
    settings. `index.ts` is the one exception, for `lib/auth` (Rule 1). _Lint._

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
| Repeat of a write (same client id)  | same owner and parent: success; else `Conflict`       | as the first time                                                      | as the first time           |
| Invalid input                       | never reached: the adapter parses with `contracts.ts` | `{ error }`                                                            | `400` + `{ error }`         |
| Bug, broken invariant               | `throw new Error(…)`                                  | nearest `error.tsx`                                                    | `500` + `{ error }`, logged |

- One answer for missing, foreign and malformed ids, so ownership isn't leaked. Until `policy.ts`
  exists, "not owned" is "not found" by design; `Forbidden` arrives with hard trigger 4.
- `{ error }` holds copy the user can read (`useActionState`), never a class name or a tag.
- A route handler answers JSON `{ error }` on every status, `404` and `500` included: `notFound()`
  would render the HTML page.
- When a module must produce user-facing text itself, as in an error chunk after a stream has
  started, the adapter hands it in as a function. A module never holds copy.
- A service's failures are worded where they are recognized: `lib/<service>.ts` exports a pure
  `describe<Service>Error`, unit tested there, and the adapter hands it to the module. Telling
  provider errors apart needs the provider's error classes, and only that file imports them.
- A write keyed by an id the client generated (a message id) is safe to retry. "Already exists" is
  success only when the existing row has the same owner and parent; matching on the id alone lets
  a collision with another chat's row pass silently. Any other collision is `Conflict`.
- The driver's error codes are recognized in one place, `lib/db/errors.ts` (`23505` unique,
  `23503` foreign key). A command catches there and throws `Conflict`; nothing else reads a driver
  error.
- Error classes live in `modules/<x>/errors.ts`. A self-contained route has no adapter layer to
  map them, so it calls `notFound()` or returns `{ error }` directly; wanting named errors there is
  soft trigger 8.

## Transactions

- A transaction wraps an ownership check and the writes it guards: `repo.ts` takes the executor
  (`db` or `tx`) as its first argument, so the check runs inside the same transaction.
- A transaction never spans an external call (a model stream, an HTTP request). A use case that
  streams writes in steps, each its own transaction, and each step checks ownership again: the
  chat can be deleted while the reply streams.
- A value derived from other rows (the next `position`, a counter) is guarded by the database: a
  unique constraint, or a lock taken in the same transaction. Postgres' default isolation (read
  committed) lets two transactions read the same `max()`. A unique constraint is not database
  logic (Rule 10).

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
   A step of a use case is not exported so it can be tested. When the use case needs an external
   service, the test passes a fake through the parameter Rule 12 already requires (for a model,
   `MockLanguageModelV4` from `ai/test`).
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

| Kind                 | File                                                                     | Identifier                                                                                                                                      | Example                                                   |
| -------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Server action        | `actions.ts`                                                             | `<useCase>Action`                                                                                                                               | `deleteChatAction`                                        |
| Query                | `queries.ts`                                                             | `get<Noun>` / `get<Nouns>`, returns `null` when missing (`find` is the repo's word); in a module `(requester, …)`, bound to `(…)` by `index.ts` | `getChat(requester, id)` → `chats.getChat(id)`            |
| Command              | `modules/<x>/commands.ts`                                                | the use case's name, same binding                                                                                                               | `deleteChat(requester, id)` → `chats.deleteChat(id)`      |
| Repo helper          | `modules/<x>/repo.ts`                                                    | `find<Qualifier><Noun>`, returns a row or `null`; the executor (`db` or `tx`) comes first; never exported from `index.ts`                       | `findOwnedChat(tx, userId, id)`                           |
| Domain rule          | `modules/<x>/domain.ts`, `policy.ts`                                     | a business verb or predicate, pure                                                                                                              | `applyCredits(chat, amount)`, `canShare(requester, chat)` |
| Input contract (zod) | `contracts.ts`                                                           | `<useCase>Input`; inferred type `<UseCase>Input`                                                                                                | `sendMessageInput`, `SendMessageInput`                    |
| Error class          | `errors.ts`                                                              | the fact that blocks the action                                                                                                                 | `ChatNotFound`, `Conflict`                                |
| Component            | `components/<noun>-<role>.tsx`, or `app/.../_components/` if route-local | `<Noun><Role>`, props `<Component>Props`; client components start with `'use client'`, no suffix                                                | `ChatList`, `ChatListProps`                               |
| Hook                 | `hooks/use-<thing>.ts`, or `_components/` if route-local                 | `use<Thing>`                                                                                                                                    | `useIsMobile`                                             |
| Page                 | `page.tsx`                                                               | `<Noun>Page` / `<Nouns>Page`                                                                                                                    | `ChatPage`, `ChatsPage`                                   |

Roles (last word of a component name): `List`, `Table`, `Card`, `Row`, `Form`, `Dialog`, `Sheet`,
`Panel`, `Badge`, `Summary`, `Picker`, `Select`, `Filters`, `Toolbar`, `Empty`, `Provider`, or any
name from the [shadcn components list](https://ui.shadcn.com/docs/components.md). The noun may be
`App` for shell pieces (`AppSidebar`); a role may stack to describe a state (`ChatListSkeleton`).
Extend this list rather than inventing a role. Unexported helpers are free-form as long as they
don't mimic `*Action`, `*Page` or a verb-first use-case name. `components/ui/*` is shadcn: don't
rename it, don't add your own components there.

### Data

| Kind     | Where                                                                                                | Identifier                                | Example                      |
| -------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------- |
| Table    | `lib/db/schema.ts` (exports tables only)                                                             | `<nouns>Table`; SQL name plural `<nouns>` | `chatsTable` → `"chats"`     |
| Row type | not exported; derive inline where needed                                                             | `typeof <nouns>Table.$inferSelect`        |                              |
| DTO      | `contracts.ts`; in a self-contained route without one, the `queries.ts` that returns it              | `<Noun><Shape>`                           | `ChatDetail`, `ChatListItem` |
| Mapper   | `modules/<x>/mappers.ts`, imported by `queries.ts` and `commands.ts`, never exported from `index.ts` | `to<TargetType>`                          | `toChatMessage(row)`         |

Inputs are zod schemas because they are untrusted; DTOs are plain types because the data layer
builds them. UI imports DTO types, never a row type.

## Sources of truth

- `eslint.config.mjs`: the import graph, `server-only`, `'use server'`, casts, `process.env`, what
  a module may import from `lib/`.
- `docs/adr/`: every deviation from a rule, and every interpretation a second module would have
  to repeat, with the options considered and how to reverse it. An interpretation that stays local
  is a comment at the code that names the rule.
- `test/global-setup.ts`, `test/factories.ts`: test database and fixtures.
- `lib/db/errors.ts`: the one place that knows the driver's error codes.
