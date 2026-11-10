# Conventions

How a Next.js app on Drizzle, Postgres and zod is organized, and when a route grows into a
module. Rules that lint enforces are only pointed at here; the project's `eslint.config.mjs` is the source of truth for the import graph.

## How to read this

The sections bind differently. Only the floor can be violated.

| Section              | What it is                                             | Departing from it                                           |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Why                  | The priorities every rule comes from                   | Decides whatever the rules don't cover                      |
| The floor            | What holds in every diff                               | Never. A wrong floor rule is changed in this file           |
| Defaults             | How things are done unless there is a reason not to    | A decision, not a violation, once an ADR records it         |
| Deliberately dropped | Trade-offs already settled, each with what reopens it  | Reopen when the named condition is met                      |
| Open territory       | Everything this document doesn't name                  | Free; decide by Why                                         |

Rule, trigger and Testing § numbers are ids, not an order: the lint config, the ADRs and the
changelog cite them, so they keep their number wherever the rule sits.

## Why

These rules optimize for four things, in this order. When two rules conflict, the earlier
principle wins.

1. **Business logic lives in TypeScript**, not in database functions, not in React components.
2. **End-to-end type safety**: one source of truth for each shape, inferred everywhere else.
3. **Developer experience**: a feature's code sits together; you can find it in one folder.
4. **Just enough layering**: layers exist to control dependency direction and make logic
   testable. Where there are no rules, there is no domain layer.

Three habits run through the rules below, and apply where no rule does:

- **Structure is earned.** A rule, a layer or a module exists because of a problem that happened,
  not one that might.
- **One place per fact.** The current user, the env, the driver's error codes and each shape are
  each known in exactly one file.
- **Tools hold what tools can check.** If lint or a test can enforce it, it lives there and this
  document only points at it.

## The floor

These hold in every diff, and no ADR lifts them. Lint and tests pass. Beyond that, the floor is
the rules that guard who may see and change what, and that mostly only a reviewer can check.

- **Rule 1. The current user is resolved in exactly one place.** Self-contained route: first line
  of every `_lib` function. Module: `index.ts` wraps every export in `withUser`; internals take
  `requester`. An adapter with a session never passes a user; a system adapter has no session and
  names the requester it acts for (Rule 6). "Who is calling" stays in one reviewable file.
  _Lint for modules, review for `_lib`._
- **Rule 2. Every read and every write is scoped by what the requester may access.** Until
  `policy.ts` exists that means ownership: every read filters by the caller, every write is scoped
  by the caller (`eq(table.userId, requester.id)`), and the ownership check is the policy. A
  missing, a foreign and a malformed id get one answer, so access isn't leaked. In a module, every
  use case that takes an id proves it with a test (Testing §5). In a self-contained route nothing
  tests it: review checks that each `_lib` function resolves the user first and has the user in
  its `WHERE`. That gap is accepted while a route is small, and closes on promotion.
  _Review, plus Testing §5._
- **Rule 7. UI never decides permissions.** Queries put flags on the DTO (`canDelete`); components
  render them. A permission is decided once, on the server, where a test can reach it. _Review._
- **Rule 10. The schema is code-first and the database holds no logic.** `lib/db/schema.ts` is the
  source of truth. There are no database functions and no triggers; `updated_at` is `$onUpdate` in
  the schema. Migrations are generated, and a generated file is never edited: a backfill, or SQL
  the schema can't express, is its own custom migration (`drizzle-kit generate --custom`). This is
  the first principle in Why. _Review._
- **Rule 11. A deviation is written down before it happens.** An `eslint-disable` carries a
  comment that links an ADR. A rule nobody can follow is changed in this file, not disabled in
  source. _Review._

## Defaults

Follow these unless there is a reason not to. The reason goes into an ADR first (Rule 11); with
it, a departure is a decision the next reader can find and reverse.

### Layout

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
├─ index.ts               # session-bound API for app/: binds the current user (withUser), re-exports errors
├─ contracts.ts           # zod inputs in, DTO types out; the module's one browser-safe file
├─ queries.ts             # reads (requester, …) → DTO | null
├─ commands.ts            # writes (requester, input); throw domain errors
├─ domain.ts              # pure business rules over DTOs: calculations, state transitions (on trigger)
├─ policy.ts              # authorization beyond "the owner can"; pure functions (on trigger)
├─ repo.ts                # db queries shared by reads and writes (the ownership check) (on need)
├─ mappers.ts             # row ⇄ DTO (on need)
└─ errors.ts              # domain error classes (on need)
components/               # shared UI; components/ui/* is shadcn, untouched
├─ <x>/                   # UI for module <x> that more than one route group renders
lib/
├─ auth.ts                # getUser / requireUser (cache()), withUser
├─ env.ts                 # validated env; the only reader of process.env
├─ <service>.ts           # client for an external service (AI, mail): built from env, handed to modules by adapters
└─ db/                    # client, schema (code-first), generated migrations; errors.ts names the driver codes
scripts/                  # seed and maintenance: system callers (optional)
```

A route is in one of two states, and the folder shows which: `_lib/` means the route talks to the
db itself; a bare `actions.ts` next to `page.tsx` means a module does.

A module starts as `index.ts`, `contracts.ts`, `queries.ts` and `commands.ts`. Every other file
appears when its content does.

### Dependencies

Lint enforces all of these, so a departure shows up as an `eslint-disable` with its ADR link.

- **Rule 3. Only `_lib/*`, `modules/*` and `lib/` import the db.** Outside the app, `test/`
  (setup, factories) and seed scripts do too. _Lint._
- **Rule 4. Server-side code starts with `import 'server-only'`;** in `actions.ts`, `'use server'`
  comes first. Exempt: `contracts.ts` (browser-safe by design), `schema.ts` (drizzle-kit loads it
  outside Next) and tests. Tests and scripts run outside Next, where `server-only` resolves to
  its empty export. That is configured once each: the script runner sets the `react-server`
  condition (`pnpm seed`), and `vitest.config.ts` aliases `server-only` to its empty file. _Lint._
- **Rule 5. Dependencies point one way.** `lib/` imports neither `app/` nor `modules/`; `modules/`
  imports neither `app/` nor `next/*`. Two modules that import each other are merged, or a third
  is extracted. _Lint, cycles by review._
- **Rule 6. Three doors into a module, and no others.**
  - `app/` imports `index.ts` as a namespace (`import * as chats from "@/modules/chats"`): the
    session-bound API. `index.ts` also re-exports the module's error classes, so an adapter can
    map them (`chats.ChatNotFound`).
  - Other modules, system callers (`scripts/`, `app/api/system/`) and tests import `queries.ts`,
    `commands.ts` and `errors.ts` directly and pass the requester they act for. Never `index.ts`,
    which would bind the session; never `repo.ts` or `mappers.ts`.
  - UI, client components included, imports `contracts.ts` for input schemas and DTO types, so a
    form validates with the same schema the action parses.
    `contracts.ts` itself imports nothing but zod and types, so it can't drag the server into the
    bundle.

  _Lint._

- **Rule 8. No `as` cast** outside `mappers.ts`, `lib/db/` and `as const`. If the types don't line
  up, fix the schema or add a mapper. `components/ui/*` is vendor code and exempt. _Lint._
- **Rule 9. `lib/env.ts` is the only reader of `process.env`.** Everything else, the db client
  included, reads `env.X`, so a missing variable fails at startup, not in a request. Exempt: the
  tool configs at the root (`drizzle.config.ts`, `vitest.config.ts`), which their tools load
  outside Next, where `lib/env.ts` can't be imported. _Lint._
- **Rule 12. A module imports from `lib/` only the db, and types.** An external service (AI
  provider, mail, payments) is a client in `lib/<service>.ts`, built from `env`. The adapter
  constructs it and passes it in, so a module never configures a provider and its tests need no
  provider settings. `index.ts` is the one exception, for `lib/auth` (Rule 1). _Lint._

### The two states of a route

**Self-contained (the default).** `_lib/queries.ts` and `_lib/actions.ts` talk to the db directly.
Every function calls `requireUser()` first and parses its ids before they reach the db
(`z.uuid().safeParse`). A query returns `null` for a missing, foreign or malformed id; an action
calls `notFound()`. DTO types live in the `queries.ts` that returns them; once an action takes more
than an id, zod inputs and DTOs move to `_lib/contracts.ts`. Business rules stay inline; one with more than one
outcome is soft trigger 6. Nothing here is testable without Next, and that is accepted until
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

### Errors

A command throws, an adapter maps. Nothing above the module sees a driver error, and nothing in
the UI sees an error class.

| Case                                | Query / command                                       | Action                                                                 | Route handler               |
| ----------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------- |
| Missing, not-owned or malformed id  | query returns `null`; command throws `<Noun>NotFound` | `notFound()`                                                           | `404` + `{ error }`         |
| Forbidden (once `policy.ts` exists) | command throws `Forbidden`                            | `forbidden()` (needs `experimental.authInterrupts`), else `notFound()` | `403` + `{ error }`         |
| Constraint refused the write        | command catches the driver error, throws `<Fact>`     | `{ error }`                                                            | `409` + `{ error }`         |
| Invalid input                       | never reached: the adapter parses with `contracts.ts` | `{ error }`                                                            | `400` + `{ error }`         |
| Bug, broken invariant               | `throw new Error(…)`                                  | nearest `error.tsx`                                                    | `500` + `{ error }`, logged |

- Until `policy.ts` exists, "not owned" is "not found" by design (Rule 2); `Forbidden` arrives
  with hard trigger 4.
- `{ error }` holds copy the user can read (`useActionState`), never a class name or a tag.
- A route handler answers JSON `{ error }` on every status, `404` and `500` included: `notFound()`
  would render the HTML page.
- When a module must produce user-facing text itself, as in an error chunk after a stream has
  started, the adapter hands it in as a function. A module never holds copy.
- The driver's error codes are recognized in one place, `lib/db/errors.ts` (`23505` unique,
  `23503` foreign key). A command catches there and throws the fact that blocked the write
  (`TitleTaken`), so the adapter can choose the copy; nothing else reads a driver error.
- Error classes live in `modules/<x>/errors.ts`. A self-contained route has no adapter layer to
  map them, so it calls `notFound()` or returns `{ error }` directly; needing to tell failures apart
  there is soft trigger 8.

### Promotion: when `_lib` becomes `modules/<x>/`

Promote when **one** hard trigger is hit, or **two** soft ones. One concept at a time. Not
triggers: "it might be reused later", many small actions in one file, a cleaner folder tree.

**Hard triggers (any one):**

1. **A second adapter needs the same logic.** Route handler, webhook, cron, CLI. Server actions
   can't be imported there, and a copy means two ownership checks to keep in sync.
2. **Two route groups need the same query or write.** Cross-importing another route's `_lib` is
   the smell.
3. **A write touches more than one aggregate.** Creating a chat also charges credits. The module
   that owns the write calls the other module's `commands.ts` with the same requester (Rule 6). It opens the
   transaction and passes it on: a command another module calls takes the transaction as its last
   parameter and defaults to the db client.
4. **Authorization is no longer "the owner".** Roles, sharing, admin override. The rule needs a
   name and a unit test: `modules/<x>/policy.ts`, pure functions, no db.

**Soft triggers (two together):**

5. **`actions.ts` or `queries.ts` passes about 200 lines, or one function about 40.** Length from
   logic counts; length from the number of use cases doesn't.
6. **A business rule shares a function with the framework.** A calculation or a state
   transition, logic with more than one outcome, sits next to `requireUser` or `revalidatePath`,
   so a unit test would need Next.
7. **The same drizzle query is written twice** in the route, usually in a read and in a write's
   ownership check. The module's `repo.ts` is the fix.
8. **A caller has to tell failures apart.** The action answers "not found", "invalid input" and
   "bug" differently, and `new Error("…")` strings are being compared.

### Testing

| Level      | Self-contained route                       | Module-backed route                                             |
| ---------- | ------------------------------------------ | --------------------------------------------------------------- |
| API tests  | none (would need Next; see soft trigger 6) | every use case in `queries.ts` and `commands.ts`, real Postgres |
| Unit tests | business-critical pure functions only      | `domain.ts` and `policy.ts`, by example tables                  |
| UI tests   | business-critical workflows only, E2E      | same; the only coverage adapters in `app/` get                  |

> **TODO:** confirm the definition of "business critical". Draft: it moves money, changes who may
> access what, or can't be undone.

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
   `null` or throws, and changes nothing) and a malformed-id case next to its happy path. This one
   is part of the floor.
6. **Never mock `next/*`.** A test that needs Next means the logic sits in the adapter and belongs
   in the module.

```bash
createdb <app>_test   # once, on the local Postgres
pnpm test
```

### Naming

Files and folders are `kebab-case`; route folders follow Next (`(group)`, `[param]`, `_private`).
A module is named after a business noun, never a technical one: not `utils`, `common`, `shared`.
An exported name says what kind of thing it is (`deleteChatAction`, `getChat`, `ChatList`,
`chatsTable`). The patterns per kind, and the list of component roles, are in
[NAMING.md](./NAMING.md); read it when you create or rename a file or an export.

## Deliberately dropped

When two goals conflict, the order in Why decides. These are the conflicts already settled. Each
bullet says what was given up and, where there is one, the condition that reopens it; until that
condition is met, proposing the dropped thing again is not an improvement.

- **A branded `AuthCtx` type only `lib/auth` can mint.** Lint already restricts who imports
  `lib/auth` as a value, and a brand would force every test to mint one. Revisit if a second place
  starts constructing users.
- **A "who may import what" table here.** It drifted; `eslint.config.mjs` is the table.
- **`index.ts` as a public API before `modules/` exists.** A self-contained route has none.
- **Full module layering from day one.** `domain/`, `application/`, `infra/` folders and ports
  are correct and too heavy for a route that owns one table. Flat files, promoted on trigger.
- **`Result` types and tagged error unions.** Thrown classes mapped in the adapter are the
  TypeScript default and cost no runtime package. The price is exhaustiveness: a forgotten
  `instanceof` is a 500, not a compile error. Testing §5 proves the command throws; that the adapter maps it is seen
  only by an E2E test. Accepted while an adapter stays as thin as parse → module → map.
- **A separate browser-safe `index.ts` and server-only `server.ts`.** One server-only `index.ts`
  plus a browser-safe `contracts.ts` gives the same guarantee with one file fewer.
- **Cache tags, cross-module events, branded ids.** Not until `cacheComponents` is on, a second
  subscriber exists, or a swapped-argument bug slips past Testing §5.

## Examples

> **TODO:** replace these sketches with code from a real project. Examples are imitated more
> closely than prose, so they should be code you would sign.

A read in a self-contained route: user first, id parsed before the db, ownership in the `WHERE`,
one `null` for every kind of "not yours".

```ts
// app/(chat)/_lib/queries.ts
import "server-only"

export type ChatDetail = { id: string; title: string }

export async function getChat(id: string): Promise<ChatDetail | null> {
  const user = await requireUser()
  const chatId = z.uuid().safeParse(id)
  if (!chatId.success) return null

  const [row] = await db
    .select({ id: chatsTable.id, title: chatsTable.title })
    .from(chatsTable)
    .where(and(eq(chatsTable.id, chatId.data), eq(chatsTable.userId, user.id)))
  return row ?? null
}
```

The same read after promotion: the use case takes a `requester`, `index.ts` binds the session
once, and the page never mentions a user.

```ts
// modules/chats/index.ts
export const getChat = withUser(queries.getChat)
export const deleteChat = withUser(commands.deleteChat)
export { ChatNotFound } from "./errors"

// app/(chat)/[id]/page.tsx
import * as chats from "@/modules/chats"

const chat = await chats.getChat(id)
if (!chat) notFound()
```

## Open territory

What this document doesn't name is yours to decide: how a component is built inside, styling,
local state, the shape of an unexported helper. Decide by Why, in order.

Going further than a default in its own direction is not a deviation and needs no ADR: a tighter
type, a smaller function, a clearer name, a second test case for an id.

One direction is closed. Structure ahead of its trigger (a module, a layer or an abstraction "for
later") is not an improvement here; see Promotion and Deliberately dropped.

## Changing this document

- **A better way that fits the defaults:** do it.
- **A better way that conflicts with a default:** follow the default and name the idea where the
  work is reported. If the task can't be done well without departing, write the ADR first
  (Rule 11), then depart.
- **A problem with a floor rule:** stop and raise it. The floor changes in this file, never in
  source.
- **A new rule** earns its place by a problem that happened, and says how it is enforced: lint,
  review or test. A removed rule gets a bullet in Deliberately dropped, so the question is not
  reopened.
- **A default that keeps collecting ADRs** is reworded here.

## Sources of truth

- `NAMING.md`: file and identifier patterns per kind, component roles.
- `eslint.config.mjs`: the import graph, `server-only`, `'use server'`, casts, `process.env`, what
  a module may import from `lib/`.
- `docs/adr/`: every decision that interprets or
  deviates from a rule, with the options considered and how to reverse it.
- `test/global-setup.ts`, `test/factories.ts`: test database and fixtures.
- `lib/db/errors.ts`: the one place that knows the driver's error codes.
