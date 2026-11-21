<!-- conventions 0.10.0 -->

# Conventions

How a Next.js app on Drizzle, Postgres and zod is organized, and when a route grows into a
module. Rules that lint enforces are only pointed at here; the project's `eslint.config.mjs` is the
source of truth for the import graph, and `eslint.project.mjs` holds what the project adds to it.
What the project decides at the points this document leaves open is in `docs/EXTENSIONS.md`; read
it with this file.

## How to read this

The sections bind differently. Only the floor can be violated.

| Section              | What it is                                            | Departing from it                                            |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Why                  | The priorities every rule comes from                  | Decides whatever the rules don't cover                       |
| The floor            | What holds in every diff                              | Never. A wrong floor rule is challenged, not edited here     |
| Defaults             | How things are done unless there is a reason not to   | A decision, not a violation, once an ADR records it          |
| Extension points     | Seams the baseline leaves to the project, E1–E8       | Not a departure: decide it, write it in `docs/EXTENSIONS.md` |
| Deliberately dropped | Trade-offs already settled, each with what reopens it | Reopen when the named condition is met                       |
| Open territory       | Everything this document doesn't name                 | Free; decide by Why                                          |

Rule, trigger, Testing § and extension point (E) numbers are ids, not an order: the lint config,
the ADRs, `EXTENSIONS.md` and the changelog cite them, so they keep their number wherever the rule
sits.

Paths (`app/`, `lib/`, `eslint.config.mjs`, `docs/adr/`) are relative to the app root, the
folder that holds the Next.js app's `package.json`: the repository root in a single-app
repository, `apps/<app>/` in a monorepo. This file and NAMING.md sit in `docs/` there.

**Unproven.** Some parts are carried over from earlier projects, and no app has exercised them
yet: `app/api/system/`, the shared transaction of hard trigger 3, `scripts/` calling a use case
instead of writing rows, `policy.ts` and the `Forbidden` row, a module's variant folders, and UI
tests.
If one of them doesn't fit the first project that needs it, that is a finding about the rule, not
a deviation: challenge it (Changing this document).

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
- **Deep modules.** A module's interface (`index.ts`, `queries.ts`, `commands.ts`) is small next to
  what it hides: a caller learns a few functions, not the tables, the provider or the order of the
  steps. A new file, wrapper or export has to make the caller's side simpler; one that only moves
  lines makes the module shallower.
- **Developer experience is the leading indicator.** When following a rule makes a change longer,
  harder to read or slower to make than the problem it guards against, the rule is wrong for that
  case: fill an extension point if one fits, write an ADR if a default is in the way. Pragmatism
  over perfection: a rule guards against a problem two apps have had, not one that might come.

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
  comment that links an ADR. A rule nobody can follow is challenged (Changing this document),
  not disabled in source. _Review._

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
├─ domain/<group>.ts      # in place of domain.ts once it holds a second group of rules (on trigger)
├─ policy.ts              # authorization beyond "the owner can"; pure functions (on trigger)
├─ repo.ts                # db queries shared by reads and writes (the ownership check) (on need)
├─ mappers.ts             # row ⇄ DTO (on need)
├─ errors.ts              # domain error classes (on need)
├─ tools.ts               # the tools the module offers an agent (on need)
└─ <variants>/<id>/       # one implementation of an interface the module owns, e.g. providers/github/ (on need)
components/               # UI more than one route group renders; components/ui/* is shadcn, untouched
lib/
├─ auth.ts                # getUser / requireUser (cache()), withUser
├─ env.ts                 # validated env; the only reader of process.env
├─ <service>.ts           # client for an external service (AI, mail): built from env, handed to modules by adapters (E3)
└─ db/                    # client, schema (code-first), generated migrations; errors.ts names the driver codes
scripts/                  # seed and maintenance: system callers (optional)
```

A route is in one of two states, and the folder shows which: `_lib/` means the route talks to the
db itself; a bare `actions.ts` next to `page.tsx` means a module does.

A module has `contracts.ts` and the doors its callers use: `index.ts` once `app/` calls it,
`queries.ts` once it reads, `commands.ts` once it writes. Every other file appears when its content
does; an empty file or an export nobody calls is structure ahead of its trigger.

A module's pure rules are one `domain.ts` until it holds a second independent group of them: rules
that are read and tested apart, each with its own example table. Then the groups move to
`domain/<group>.ts`, one file per group, named for what it holds (`domain/retry.ts`), each with its
`<group>.test.ts` beside it. The folder has no `index`; its files import each other one way only,
and the module's other files import the group they use.

A module that holds several implementations of one interface it owns (a provider per external
system) gives each its own folder, `<variants>/<id>/`. The interface is `<variant>.ts`, the
registry that lists the implementations `<variants>.ts`; outside its folder an implementation is
reached only through the registry. What the browser reads of one implementation is in its own
`contracts.ts`, which is browser-safe like the module's and may build on it.

### Dependencies

Lint enforces all of these, so a departure shows up as an `eslint-disable` with its ADR link. A
boundary the project adds (one module never imports another, only one folder imports a library,
E1) goes into `eslint.project.mjs` with a rule the conventions leave free, such as
`import/no-restricted-paths` or `no-restricted-syntax`. `eslint.config.mjs` refuses to load a
project block that sets one of its own rules: a later block replaces that rule's options instead of
adding to them, and would switch the conventions' check off for the same files.

- **Rule 3. Only `_lib/*`, `modules/*` and `lib/` import the db.** Outside the app, `test/`
  (setup, factories) and seed scripts do too. In a module, the pure rules don't: `domain.ts`,
  `domain/` and their tests never import the db, types included. A rule that needs a row takes it
  from the query or command that calls it. _Lint._
- **Rule 4. Server-side code starts with `import 'server-only'`;** in `actions.ts`, `'use server'`
  comes first. Exempt: `contracts.ts` (browser-safe by design), `schema.ts` (drizzle-kit loads it
  outside Next) and tests. Tests and scripts run outside Next, where `server-only` resolves to
  its empty export. That is configured once each: the script runner sets the `react-server`
  condition (`pnpm seed`), and `vitest.config.ts` aliases `server-only` to its empty file. _Lint._
- **Rule 5. Dependencies point one way.** `lib/` imports neither `app/` nor `modules/`; `modules/`
  imports neither `app/` nor `next/*`. Two modules that import each other are merged, or a third
  is extracted. _Lint, cycles by review._
- **Rule 6. Four doors into a module, and no others.**
  - `app/` imports `index.ts` as a namespace (`import * as chats from "@/modules/chats"`): the
    session-bound API. `index.ts` also re-exports the module's error classes, so an adapter can
    map them (`chats.ChatNotFound`).
  - Other modules, system callers (`scripts/`, `app/api/system/`) and tests import `queries.ts`,
    `commands.ts` and `errors.ts` directly and pass the requester they act for, and may import
    `contracts.ts` for its schemas and types. Never `index.ts`, which would bind the session, and
    no other file of the module.
  - UI, client components included, imports `contracts.ts` for input schemas and DTO types, so a
    form validates with the same schema the action parses.
    `contracts.ts` itself imports nothing but zod, types and another `contracts.ts`, so it can't
    drag the server into the bundle. A variant folder's `contracts.ts` is the same door.
  - An agent module (one that runs a model's tool loop) imports another module's `tools.ts`: the
    tools that module offers the model, next to the code that answers them. Nothing else imports a
    `tools.ts`, and a tool's `execute` takes the requester from the context the server fills,
    never from the model.

  _Lint; who imports a `tools.ts`, review._

- **Rule 8. No `as` cast** outside `mappers.ts`, `lib/db/` and `as const`. If the types don't line
  up, fix the schema or add a mapper. `components/ui/*` is vendor code and exempt. _Lint._
- **Rule 9. `lib/env.ts` is the only reader of `process.env`.** Everything else, the db client
  included, reads `env.X`, so a missing variable fails at startup, not in a request. Exempt: the
  tool configs at the root (`drizzle.config.ts`, `vitest.config.ts`), which their tools load
  outside Next, where `lib/env.ts` can't be imported. _Lint._
- **Rule 12. A module imports from `lib/` only the db, and types.** An external service (AI
  provider, mail, payments) is a client in `lib/<service>.ts` (a folder once it needs one), built
  from `env`. The adapter constructs it and passes it in, so a module never configures a provider
  and its tests need no provider settings. `index.ts` is the one exception, for `lib/auth`
  (Rule 1). A project widens this for named paths with the `moduleLibImports` seam (E2), e.g. a
  client's error classes a module catches. _Lint._

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
map domain errors (`instanceof`) → `revalidatePath` / `redirect`. Pages and server components
call the module directly; `_lib/` is deleted.

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
- `{ error }` holds copy the user can read (`useActionState`), never a class name or a tag. It may
  carry flags its caller acts on: the field the copy is about, that the thing no longer exists.
- An action the browser calls from client state (an event handler, an optimistic update; not a
  `<form>` on a page that renders server state) answers `{ error }` where the table says
  `notFound()` or `forbidden()`. A bug still throws; the caller catches the rejected call, shows a
  generic line and undoes its optimistic change. `notFound()` and `error.tsx` would replace the
  page and throw away the state the browser holds.
- **The adapter maps inline.** `actions.ts` or `route.ts` catches around the module call, maps
  each error it answers with `instanceof` (`if (error instanceof chats.ChatNotFound) notFound()`)
  and rethrows the rest as a bug. The adapter stays parse → module → map → revalidate/redirect,
  and its mapping reads top to bottom in one function. The price is that a forgotten mapping is a
  `500`, not a compile error (Deliberately dropped). An app that has paid that price switches to
  the exhaustive mapping, E8. _Review._
- **An error from outside the modules is a bug until the project says otherwise.** A service
  client's failure, a library's exception: the adapter rethrows it like any error it doesn't map.
  How a client fails, retries and times out, which of its failures an adapter answers, and which
  use cases carry on without it are extension point E3. A module never turns such a failure into
  a domain error. _Review._
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

5. **One function in `actions.ts` or `queries.ts` passes about 40 lines.** A file that is long
   because it holds many small use cases is not a trigger.
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
| Unit tests | business-critical pure functions only      | `domain.ts` or `domain/`, and `policy.ts`, by example tables    |
| UI tests   | business-critical workflows only, E2E      | same; the only coverage the rest of an adapter gets             |

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

## Extension points

The baseline stops where apps start to differ. At these seams the project decides, writes the
decision once in `docs/EXTENSIONS.md` (from the conventions' `templates/EXTENSIONS.md`) and
follows it from then on. Filling a seam departs from nothing: it needs no ADR and no challenge,
and a rollout never overwrites it. Leave a point out of the file until the app needs it.

An entry says what was decided, where it lives in the code and, in a line, why. An extension
fills a seam; it never loosens the floor or contradicts a default. If it has to, it is an ADR.

- **E1. Boundaries of the project's own.** One module never imports another, only one folder
  imports a library: a block in `eslint.project.mjs` with a rule the conventions leave free
  (Dependencies). The entry names the boundary; the block enforces it. _Lint._
- **E2. Lint seams.** `eslint.project.mjs` exports `seams`, options the conventions' config reads
  to widen one of its rules for named paths instead of an `eslint-disable` per file. Today:
  `moduleLibImports`, paths under `@/lib/` a module may import as values (Rule 12). A widening
  the config has no seam for is an ADR and its `eslint-disable`. _Lint._
- **E3. External services.** For each client in `lib/`: the failures it reports and how (its
  error classes, if any), its timeout and retries, how adapters answer each failure (copy, status,
  what is logged), and which use cases carry on without it (a read that leaves a value out, work
  completed later). The baseline only says that what nobody maps is a bug, and that a module never
  turns a client's failure into a domain error. An adapter maps it like a module's error.
  A module that carries on without the client catches only the client's failures and rethrows the
  rest, which is what `moduleLibImports` (E2) is for. _Review._
- **E4. Naming additions.** A component role, or a kind of file, the tables in NAMING.md lack: name
  it, say what it is, give an example. _Review._
- **E5. Agent tool names.** The case style of the tools' own names. The baseline only requires
  names every provider accepts: a letter, then letters, digits or `_`, at most 64. Without an
  entry, tools are `snake_case`. Saved conversations store the name, so renaming a tool is a
  migration of stored messages, whatever the style. _Review._
- **E6. Observability.** Where an error that the Errors table says is "logged" goes (console, an
  error tracker) and what an expected refusal reports, if anything. _Review._
- **E7. Test support.** `test/global-setup.ts`, `test/factories.ts`, fixtures and recordings of
  external services: what exists and how a test uses it. _Review._
- **E8. Exhaustive error mapping.** For an app where a forgotten `instanceof` reached users, or
  whose adapters' copy and statuses need tests. Each class in `errors.ts` has a literal `name`
  (`override readonly name = "ChatNotFound"`), and the file exports the list, the union and a guard
  (`chatErrors`, `ChatError`, `isChatError`), re-exported by `index.ts`. The mapping moves to
  `refusals.ts` next to `actions.ts` or `route.ts`: a `<noun>Refusal(error)` per module, a `switch`
  on `error.name` that ends in a `never` check, so a new class doesn't compile until every adapter
  answers it. It imports no `next/*`, so where the action must call `notFound()` or `forbidden()`
  the refusal says so in its answer (`{ error, notFound: true }`). `refusals.test.ts` has a case
  per class, and `test/errors.test.ts` (from `templates/errors.test.ts`) checks every list is
  complete. The entry says which modules and adapters use it; the rest map inline. _tsc, plus
  test._

## Deliberately dropped

When two goals conflict, the order in Why decides. These are the conflicts already settled. Each
bullet says what was given up and, where there is one, the condition that reopens it; until that
condition is met, proposing the dropped thing again is not an improvement.

- **A branded `AuthCtx` type only `lib/auth` can mint.** Lint already restricts who imports
  `lib/auth` as a value, and a brand would force every test to mint one. Revisit if a second place
  starts constructing users.
- **A "who may import what" table here.** It drifted; `eslint.config.mjs` is the table.
- **`index.ts` as a public API before `modules/` exists.** A self-contained route has none.
- **Every module starting with `index.ts`, `queries.ts` and `commands.ts`.** An `index.ts` nobody
  imports binds the session for nothing, and an empty `commands.ts` says the module writes when it
  doesn't. A module has the doors its callers use (Layout); lint refuses `app/` reaching past
  `index.ts`, so a missing one shows the day an adapter needs it.
- **Full module layering from day one.** `domain/`, `application/`, `infra/` folders and ports
  are correct and too heavy for a route that owns one table. Flat files, promoted on trigger. A
  `domain/` folder (Layout) is not that layering: it splits one file of pure rules that grew, and
  changes nothing about who calls whom.
- **`Result` types and tagged error unions.** Thrown classes mapped in the adapter are the
  TypeScript default and cost no runtime package. The price is exhaustiveness: a forgotten
  `instanceof` is a `500`, not a compile error. Testing §1 proves the command throws; that the
  adapter maps it is seen only by an E2E test. Accepted while an adapter stays as thin as parse →
  module → map; E8 pays for exhaustiveness without a `Result`. An answer a remote system gives (a
  refusal the user or a model is shown) is data the code returns, not an error, and is open
  territory.
- **Exhaustive error mapping as a default** (0.7.0, Testing §7; the id is retired). Every module
  paid for a list, a guard, a `refusals.ts` and two tests, and every new error class touched four
  files, against a mistake one app had made. The inline `instanceof` read better and held. It is
  E8 for the app that has made that mistake.
- **A separate browser-safe `index.ts` and server-only `server.ts`.** One server-only `index.ts`
  plus a browser-safe `contracts.ts` gives the same guarantee with one file fewer.
- **Cache tags, cross-module events, branded ids.** Not until `cacheComponents` is on, a second
  subscriber exists, or a swapped-argument bug slips past Testing §5.
- **File length as a promotion trigger.** A long file of small use cases reads fine; length that
  comes from logic shows up in one function first. Soft trigger 5 measures that function.
- **A `components/<module>/` folder as a third place for UI.** It read as the module's UI layer,
  though a module holds no UI; nobody could say when a component went there rather than into
  `_components/` or flat `components/`; and the one this app had was rendered by a single page. A
  component sits in the nearest `_components/`, or in `components/` once two route groups render
  it. A folder that no longer scans flat is grouped by the noun its components render
  (NAMING.md), which keeps that placement.
- **One prescribed design for external service clients** (0.8.0: four failure classes, the
  client's retry policy, fixed statuses). It came from one client in one app and needed an
  exception in the first one it met: reads that carry on without the service. How a client fails
  is E3. Reopen when two apps have written the same E3 entry.
- **A test of tool names** (0.8.0, Testing §8). A provider refuses a bad name on the first request,
  so nothing is left for a test to catch, and the `snake_case`-only pattern it checked was a style
  no provider requires. The style is E5.

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
export { ChatNotFound, TitleTaken } from "./errors"

// app/(chat)/[id]/page.tsx
import * as chats from "@/modules/chats"

const chat = await chats.getChat(id)
if (!chat) notFound()
```

A module's error and the action that maps it inline: the copy and the not-found page sit next
to the call that can fail, and everything else is rethrown as a bug.

```ts
// modules/chats/errors.ts
import "server-only"

export class ChatNotFound extends Error {
  constructor(readonly chatId: string) {
    super(`Chat ${chatId} not found`)
  }
}
export class TitleTaken extends Error {
  constructor(readonly title: string) {
    super(`Title ${title} is taken`)
  }
}

// app/(chat)/actions.ts
export async function renameChatAction(_: { error: string } | null, formData: FormData) {
  const input = renameChatInput.safeParse(Object.fromEntries(formData))
  if (!input.success) return { error: "Give the chat a title." }
  try {
    await chats.renameChat(input.data)
  } catch (error) {
    if (error instanceof chats.ChatNotFound) notFound()
    if (error instanceof chats.TitleTaken) {
      return { error: `You already have a chat called ${error.title}.` }
    }
    throw error
  }
  revalidatePath(`/chats/${input.data.chatId}`)
  return null
}
```

## Open territory

What this document doesn't name is yours to decide: how a component is built inside, styling,
local state, the shape of an unexported helper. Decide by Why, in order. Open territory is decided
in the code and needs no entry; an extension point is decided once and written down, because every
later change at that seam has to follow it.

Going further than a default in its own direction is not a deviation and needs no ADR: a tighter
type, a smaller function, a clearer name, a second test case for an id.

One direction is closed. Structure ahead of its trigger (a module, a layer or an abstraction "for
later") is not an improvement here; see Promotion and Deliberately dropped.

## Changing this document

This file is a copy. It is changed only in the home repository of the conventions,
`laserjm/conventions`, released there and rolled out to every project that uses it. The project
never edits it and doesn't open issues or pull requests against the home repository. The baseline
changes rarely, and on purpose: a project that grows grows into its extension points, not into
this file.

- **A need an extension point covers:** decide it and write it in `docs/EXTENSIONS.md`.
- **A better way that conflicts with a default:** write the ADR first (Rule 11), then depart.
- **A need no extension point covers, where a default is in the way:** write the ADR, and name the
  missing seam in a `Conventions challenge`.
- **A floor rule, or an unproven part, that doesn't fit:** stop and challenge it. Don't edit this
  file and don't work around the rule in source.
- **An improvement that worked here:** keep it as an extension. It is not challenged. It moves into
  the baseline when a second app has written the same extension, and the owner moves it.

**How to challenge.** Where the work is reported (the pull request description or the final
message), add a section `Conventions challenge` per rule or seam. Name it by its id, what happened
here (link the commit, issue or ADR), and the change you propose. Before a rule is added, it has to
make the usual change shorter or safer for its reader in two apps; a rule that adds a file or a
step to every feature names the bug it prevented. A removed rule gets a bullet in Deliberately
dropped, so the question is not reopened.

## Sources of truth

- `NAMING.md`: file and identifier patterns per kind, component roles.
- `docs/EXTENSIONS.md`: what the project decided at each extension point it uses.
- `eslint.config.mjs`: the import graph, `server-only`, `'use server'`, casts, `process.env`, what
  a module may import from `lib/`. `eslint.project.mjs`: the boundaries the project adds (E1) and
  its lint seams (E2).
- `docs/adr/`: every decision that interprets or
  deviates from a rule, with the options considered and how to reverse it.
- `test/global-setup.ts`, `test/factories.ts`: test database and fixtures. With E8,
  `test/errors.test.ts`: every module error is in its list.
- `lib/db/errors.ts`: the one place that knows the driver's error codes.
