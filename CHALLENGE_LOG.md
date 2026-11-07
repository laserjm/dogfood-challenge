## My conventions

Here is what i started with:

- reads are located in a queries.ts
- deletes or writes are located in an actions.ts
- usually i want to locate queries, actions and ui components as close as possible. This is an open to.
- db is under cross cutting (lib)
- auth is under cross cutting (lib)

Here is what it ended up (after a detour into a full module layering that was correct but too heavy):

```text
app/
├─ (chat)/
│  ├─ page.tsx                 # calls queries, never the db
│  ├─ _lib/
│  │  ├─ queries.ts            # reads: requireUser() → db → DTO
│  │  └─ actions.ts            # 'use server' writes: requireUser() → parse → db → revalidate/redirect
│  ├─ _components/             # render; async server components may await a query, never the db
│  └─ [chatId]/
│     ├─ page.tsx
│     └─ _components/
├─ api/
│  └─ chat/route.ts            # route handler (adapter): requireUser() → parse → module → stream
modules/
└─ chats/                      # promoted at Stage 3 (hard trigger 1: the chat route handler)
   ├─ index.ts                 # public API; app/ imports only this
   ├─ contracts.ts             # zod input schemas + inferred types
   ├─ queries.ts               # reads (requester, …) → DTO; DTO types live here
   ├─ commands.ts              # writes (requester, input)
   ├─ mappers.ts               # row ⇄ DTO
   ├─ repo.ts                  # db queries shared by reads and writes (ownership check)
   └─ errors.ts                # ChatNotFound
components/
hooks/
lib/
├─ auth.ts                     # getUser / requireUser, wrapped in cache()
└─ db/                         # client, schema, migrations
```

**The default:** colocated `_lib/queries.ts` and `_lib/actions.ts` per route group, talking to the db directly.

### Hard rules (always)

1. **Every query, action and route handler calls `requireUser()` on its first line.** Module functions don't: they take the user as `requester`. Reads filter by the caller (`eq(table.userId, user.id)`), writes scope by the caller. The ownership check is the policy.
2. **Only `_lib/*`, `modules/*` and `lib/` import the db.** Pages, components and route handlers never do.
3. **`import 'server-only'`** at the top of every `_lib` file, every `modules/` file, every route handler (`app/api/**`), `lib/auth` and `lib/db/client.ts`. In `actions.ts`, `'use server'` comes first, then `import 'server-only'` (both are allowed per the Next 16 data-security guide). Not `schema.ts`: drizzle-kit and `seed.ts` load it outside Next.
4. **`lib/` never imports `app/`.**
5. **UI never decides permissions.** Queries put flags on the DTO (`chat.canDelete`); components only render them.

Rules 2, 3, 4 and the module import rules are enforced in `eslint.config.mjs` with core `no-restricted-imports` plus two small inline rules: `require-server-only`, and `require-use-server` for `_lib/actions.ts`. Also enforced there: `_lib` never imports `_components`, and route handlers never import a route's `_lib` or `_components` (a server action is not an API for other adapters). Rules 1 and 5 are review rules: ESLint can't see whether a query filters by the caller or whether a component made a permission decision.

**Data in components.** A server component in `_components/` may await a function from
`_lib/queries.ts` when it owns that data (e.g. the sidebar's chat list), wrapped in
`<Suspense>` next to it. Client components get data as props or as a promise (`use`).
Neither imports the db (Rule 2), and neither decides permissions (Rule 5).
Source: Next 16 docs, "Fetching data" (fetch where it's needed, Suspense close to the data).

### Errors

- **Missing or not-owned resource:** `notFound()`, in queries' callers and in actions. Same
  response for both, so ownership isn't leaked.
- **Malformed id:** same as missing. `_lib` parses every id before it reaches the db
  (`isUuid` from `lib/ids.ts`); queries return `null`, actions call `notFound()`.
- **Invalid input:** return `{ error }` from the action (for `useActionState`), don't throw. A route handler returns `400` with `{ error }`.
- **`throw`:** only for bugs and broken invariants; `error.tsx` catches them.
- **Domain error classes** (`ChatNotFound`) only after promotion to `modules/` (soft trigger 8).

### Promotion ladder (optional, create on trigger)

| File                        | Create it when                                                                 |
| --------------------------- | ------------------------------------------------------------------------------ |
| `contracts.ts` (zod)        | An action takes more than an id. Until then, parse inline in the action.       |
| `policy.ts`                 | A rule is more than "owner can": roles, sharing, admin. Pure functions, no db. |
| `repo.ts`                   | The same db query appears in both a read and a write path, or in two routes.   |
| `modules/<x>/` + `index.ts` | See the promotion triggers below.                                              |

### When to promote `_lib` to `modules/<x>/`

Promote when **one** of the hard triggers is hit, or **two** of the soft ones. Promote one concept at a time (chats first, not "everything"), and keep the route's `actions.ts` as a thin adapter that parses input and calls the module.

**Hard triggers (any one is enough):**

1. **A second adapter needs the same logic.** An API route, a webhook, a cron job or a CLI script needs to do what an action does. Server actions can't be imported there, and copying the body means two places to keep the ownership check.
2. **Two route groups need the same query or write.** `app/(chat)/_lib` and `app/(admin)/_lib` both read chats. Cross-importing another route's `_lib` is the smell; a module is the fix.
3. **A write touches more than one aggregate.** Creating a chat also charges credits, or deleting a user also deletes their chats. The transaction now spans concepts that belong to different routes.
4. **Authorization is no longer "the owner".** Roles, sharing, team membership, admin override. The rule needs a name and a unit test, which means `policy.ts`, which means a module to hold it.

**Soft triggers (two together):**

5. **`actions.ts` or `queries.ts` passes about 200 lines**, or a single function passes about 40. The file stopped being a list of use cases and became the implementation.
6. **You want to unit test the logic without Next.** `revalidatePath`, `redirect` and `requireUser` in the same function as the business rule means the test needs the framework.
7. **The same drizzle query is written twice** inside the route, usually once in a read and once inside a write's ownership check.
8. **Domain errors appear.** You start throwing `ChatNotFound` or `InsufficientCredits` instead of `new Error("...")`, and the adapter has to map them to `notFound()` or a form error.

**Not a trigger:**

- Many small actions in one file. Length from count is fine; length from logic is not.
- "It might be reused later." Wait for trigger 1 or 2 to actually happen.
- Wanting a cleaner folder tree.

When a module exists: `app/` imports only its `index.ts`, the module never imports `next/*`, and use cases take the user as a parameter instead of calling `requireUser()` themselves (so webhooks and pages can share them). The route's `_lib/actions.ts` stays, and shrinks to `requireUser() → parse → module.command() → revalidate/redirect`.

### Deliberately dropped

- The "only `lib/auth` can mint an `AuthCtx`" compiler trick as a default. It is a good pattern once a module is called from more than one adapter; before that it only adds a parameter to every function.
- The full "who may import what" table. Rules 2 and 4 cover it.
- `index.ts` as a public API boundary before `modules/` exists.

### Naming

#### UI layer (`actions.ts`, `queries.ts`, `components/`, `app/`)

| Kind                     | File                                                      | Identifier                                                        | Example                       |
| ------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------- |
| Server action            | `actions.ts`                                              | `<useCase>Action`                                                 | `payOrderAction`              |
| Query                    | `queries.ts`                                              | `<verb><Noun>`                                                    | `getOrder(id)`                |
| Command (wired use case) | `modules/<x>/commands.ts`, exported via `index.ts`        | the use case's name, `(requester, input)`                         | `payOrder(requester, input)`  |
| Input contract (zod)     | `contracts.ts`                                            | `<useCase>Input`; inferred type `<UseCase>Input`                  | `sendMessageInput`            |
| Cache tags               | `queries.ts`                                              | `<NOUN>_TAGS = { all: '<nouns>', one: (id) => \`<noun>:${id}\` }` | `ORDER_TAGS`                  |
| Revalidation helper      | `actions.ts`, exported via `index.ts`                     | `revalidate<Noun>(id)`                                            | `revalidateOrder`             |
| Component                | `components/<noun>-<role>.tsx`                            | `<Noun><Role>`, props `<Component>Props`                          | `OrderCard`, `OrderCardProps` |
| Client component         | same; file starts with `'use client'`; no `Client` suffix |                                                                   |                               |
| Hook (shared)            | `hooks/use-<thing>.ts`                                    | `use<Thing>`                                                      | `useIsMobile`                 |
| Hook (route-local)       | `app/.../_components/use-<thing>.ts`                      | `use<Thing>`                                                      | `useOrderForm`                |
| Route-local component    | `app/.../_components/<noun>-<role>.tsx`                   | same                                                              |                               |
| Page component           | `page.tsx`                                                | `<Noun>Page` / `<Nouns>Page`                                      | `OrdersPage`                  |

Cache tags and `revalidate<Noun>()` apply only once `cacheComponents` is on. Until then,
actions call `revalidatePath()` directly.

Component role vocabulary (last word):

- **Domain roles:** `List`, `Table`, `Card`, `Row`, `Form`, `Dialog`, `Sheet`, `Panel`, `Badge`,
  `Summary`, `Picker`, `Select`, `Filters`, `Toolbar`, `Empty`.
- **Framework roles:** `Provider` (React convention), plus any component name from the
  [shadcn components list](https://ui.shadcn.com/docs/components.md) (e.g. `Sidebar`, `Skeleton`, `Button`).

The noun may be `App` for app-wide shell pieces (`AppSidebar`). A role may stack on a
composite name when it describes a state of it (`ChatListSkeleton` = loading state of `ChatList`).

**Private helpers are free-form.** Only exported components follow `<Noun><Role>`. Unexported
components inside a file can use any plain name, as long as it doesn't mimic a reserved pattern
(`*Action`, `*Page`, or a verb-first use-case name like `deleteChat`).

**Vendor code is exempt.** `components/ui/*` is generated by shadcn and keeps upstream names.
Don't rename it, and don't put your own components there.

#### Data layer (`lib/db/schema.ts`, `_lib/queries.ts`)

| Kind     | Where                                             | Identifier                                | Example                                      |
| -------- | ------------------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| Table    | `lib/db/schema.ts`                                | `<nouns>Table`; SQL name plural `<nouns>` | `chatsTable` → `"chats"`                     |
| Row type | not exported; derive inline in `_lib/`/`modules/` | `typeof <nouns>Table.$inferSelect`        | `typeof messagesTable.$inferSelect["parts"]` |
| DTO      | the `queries.ts` that returns it                  | `<Noun><Shape>`                           | `ChatDetail`, `ChatListItem`                 |
| Mapper   | `modules/<x>/mappers.ts`, not exported            | `to<TargetType>`                          | `toChatMessage(row)`, `toMessageRow(…)`      |

`schema.ts` exports tables only. A DTO is the contract between a query and its UI, so it lives
next to the query that returns it (`_lib/queries.ts`, or `modules/<x>/queries.ts` exported via
`index.ts`); UI imports the DTO type from there, never a row type. Client components use
`import type` from a module, so `server-only` never reaches the browser bundle.

## Stage 3: AI Gateway hello world

- Time: _fill in_
- Highest AI level: _fill in_

**Convention friction**

- The chat route handler imported a server action (`upsertMessageAction`), because neither the folder tree nor lint mentioned `app/api/`. Fixed by promoting `chats` to `modules/` (hard trigger 1) and adding lint rules for `app/api/**`.
- Message types (`DatabaseMessages`, `Parts`) ended up in a client component and were imported by `_lib` and the route. The log said where DTOs live, but not that `_lib` must never import `_components`. Now enforced by lint.
- The log didn't say where provider/AI code lives. For now the model call stays in the route handler; the model id comes from `lib/env.ts`.
- The naming table said commands are exported via `server.ts`, the promotion section said `index.ts`. Settled on `index.ts`.
- No rule for mapper or zod-schema names. Added `to<TargetType>` and `<useCase>Input`.
- Decision for Stage 4: only completed assistant replies are stored (`outcome.status === "completed"`); aborted and failed replies are dropped.
