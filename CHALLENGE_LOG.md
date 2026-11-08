## My conventions

Here is what i started with:

- reads are located in a queries.ts
- deletes or writes are located in an actions.ts
- usually i want to locate queries, actions and ui components as close as possible. This is an open topic.
- db is under cross cutting (lib)
- auth is under cross cutting (lib)

Here is what it ended up (after a detour into a full module layering that was correct but too heavy):

```text
app/
├─ (chat)/
│  ├─ page.tsx                 # calls queries (or the module), never the db
│  ├─ _lib/                    # before promotion only; deleted once the route's concept is promoted
│  │  ├─ queries.ts            # reads: requireUser() → db → DTO
│  │  └─ actions.ts            # 'use server' writes: requireUser() → parse → db → revalidate/redirect
│  ├─ actions.ts               # after promotion: 'use server' adapter: parse → module → map errors → revalidate/redirect
│  ├─ _components/             # render; async server components may await a query, never the db
│  └─ [chatId]/
│     ├─ page.tsx
│     └─ _components/
├─ api/
│  └─ chat/route.ts            # route handler (adapter): parse → module → stream
modules/
└─ chats/                      # promoted at Stage 3 (hard trigger 1: the chat route handler)
   ├─ index.ts                 # public API; binds the current user (withUser); app/ imports only this
   ├─ contracts.ts             # boundary types: zod inputs (in) + DTO types (out)
   ├─ queries.ts               # reads (requester, …) → DTO
   ├─ commands.ts              # writes (requester, input)
   ├─ mappers.ts               # row ⇄ DTO
   ├─ repo.ts                  # db queries shared by reads and writes (ownership check)
   └─ errors.ts                # ChatNotFound
components/
hooks/
lib/
├─ auth.ts                     # getUser / requireUser (cache()), withUser
└─ db/                         # client, schema, migrations
```

**The default:** colocated `_lib/queries.ts` and `_lib/actions.ts` per route group, talking to the db directly.
The folder tells you which state a route is in: `_lib/` means the route talks to the db; a bare `actions.ts` next to `page.tsx` means it is backed by a module.

### Hard rules (always)

1. **The current user is resolved in exactly one place.** Before promotion: every `_lib` query and action calls `requireUser()` on its first line. After promotion to `modules/<x>/`: the module's `index.ts` wraps every public function with `withUser`, and internal functions take `requester`. In both states, adapters never pass a user ([ADR 0001](docs/adr/0001-where-the-current-user-is-resolved.md)). Reads filter by the caller (`eq(table.userId, user.id)`), writes scope by the caller. The ownership check is the policy.
2. **Only `_lib/*`, `modules/*` and `lib/` import the db.** Pages, components and route handlers never do.
3. **`import 'server-only'`** at the top of every `_lib` file, every `actions.ts`, every `modules/` file, every route handler (`app/api/**`), `lib/auth` and `lib/db/client.ts`. In `actions.ts`, `'use server'` comes first, then `import 'server-only'` (both are allowed per the Next 16 data-security guide). Not `schema.ts`: drizzle-kit and `seed.ts` load it outside Next.
4. **`lib/` never imports `app/`.**
5. **UI never decides permissions.** Queries put flags on the DTO (`chat.canDelete`); components only render them.

Rules 2, 3, 4 and the module import rules are enforced in `eslint.config.mjs` with core `no-restricted-imports` plus two small inline rules: `require-server-only`, and `require-use-server` for every `app/**/actions.ts`. Also enforced there: `_lib` and `actions.ts` never import `_components`, a route-level `actions.ts` never imports the db, and route handlers never import a route's `_lib`, `actions.ts` or `_components` (a server action is not an API for other adapters). The globs match by file role (`actions.ts`), not by folder, so moving a file doesn't silently drop its checks. Inside a module, only `index.ts` may import `@/lib/auth` as a value (everything else uses `import type`). Rules 1 and 5 are review rules: ESLint can't see whether a query filters by the caller or whether a component made a permission decision.

**Data in components.** A server component in `_components/` may await a query when it owns
that data (e.g. the sidebar's chat list), wrapped in `<Suspense>` next to it: from
`_lib/queries.ts` before promotion, or from `modules/<x>/queries.ts` after (imported through
the module's `index.ts`). Client components get data as props or as a promise (`use`).
Neither imports the db (Rule 2), and neither decides permissions (Rule 5).
Source: Next 16 docs, "Fetching data" (fetch where it's needed, Suspense close to the data).

### Errors

- **Missing or not-owned resource:** `notFound()`, in queries' callers and in actions. Same
  response for both, so ownership isn't leaked.
- **Malformed id:** same as missing. The owner of the data parses every id before it reaches
  the db: `_lib` (`isUuid` from `lib/ids.ts`), or the module once promoted (`chatIdInput` in
  `contracts.ts`). Queries return `null`; actions call `notFound()`, module commands throw `ChatNotFound`.
- **Invalid input:** return `{ error }` from the action (for `useActionState`), don't throw. A route handler returns `400` with `{ error }`.
- **`throw`:** only for bugs and broken invariants; `error.tsx` catches them.
- **Domain error classes** (`ChatNotFound`) only after promotion to `modules/` (soft trigger 8).

### Promotion ladder (optional, create on trigger)

| File                        | Create it when                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts.ts` (zod)        | An action takes more than an id. Holds zod inputs and, from then on, the DTO types. Until then, parse inline and keep DTOs in `queries.ts`. |
| `policy.ts`                 | A rule is more than "owner can": roles, sharing, admin. Pure functions, no db.                                                              |
| `repo.ts`                   | The same db query appears in both a read and a write path, or in two routes.                                                                |
| `modules/<x>/` + `index.ts` | See the promotion triggers below.                                                                                                           |

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

When a module exists: `app/` imports only its `index.ts`, the module never imports `next/*`, and use cases take the user as `requester` instead of calling `requireUser()` themselves (so webhooks and pages can share them); `index.ts` binds it with `withUser` ([ADR 0001](docs/adr/0001-where-the-current-user-is-resolved.md)). The route's actions stay (they are the `'use server'` boundary) and shrink to `parse → module.command() → map errors → revalidate/redirect`. `_lib/queries.ts` is deleted; pages and server components call the module directly. With nothing left in `_lib/` but one adapter, the folder is deleted too, and the file moves next to the page as `app/<group>/actions.ts`. It no longer touches the db, so it doesn't belong in `_lib`. `app/` imports a module as a namespace: `import * as chats from "@/modules/chats"`.

### Deliberately dropped

- The "only `lib/auth` can mint an `AuthCtx`" compiler trick as a default. It is a good pattern once a module is called from more than one adapter; before that it only adds a parameter to every function.
- The full "who may import what" table. Rules 2 and 4 cover it.
- `index.ts` as a public API boundary before `modules/` exists.

### Naming

#### UI and use-case layer (`app/`, `components/`, `hooks/`, `_lib/`, `modules/<x>/`)

| Kind                     | File                                                            | Identifier                                                        | Example                       |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------- |
| Server action            | `actions.ts`                                                    | `<useCase>Action`                                                 | `payOrderAction`              |
| Query                    | `queries.ts`                                                    | `<verb><Noun>`                                                    | `getOrder(id)`                |
| Command (wired use case) | `modules/<x>/commands.ts`, exported via `index.ts`              | the use case's name, `(requester, input)`                         | `payOrder(requester, input)`  |
| Auth binder              | `lib/auth.ts`                                                   | `with<Context>`                                                   | `withUser(fn)`                |
| Input contract (zod)     | `contracts.ts`                                                  | `<useCase>Input`; inferred type `<UseCase>Input`                  | `sendMessageInput`            |
| Cache tags               | `queries.ts`                                                    | `<NOUN>_TAGS = { all: '<nouns>', one: (id) => \`<noun>:${id}\` }` | `ORDER_TAGS`                  |
| Revalidation helper      | the route's `actions.ts` (never a module: it uses `next/cache`) | `revalidate<Noun>(id)`                                            | `revalidateOrder`             |
| Component                | `components/<noun>-<role>.tsx`                                  | `<Noun><Role>`, props `<Component>Props`                          | `OrderCard`, `OrderCardProps` |
| Client component         | same; file starts with `'use client'`; no `Client` suffix       |                                                                   |                               |
| Hook (shared)            | `hooks/use-<thing>.ts`                                          | `use<Thing>`                                                      | `useIsMobile`                 |
| Hook (route-local)       | `app/.../_components/use-<thing>.ts`                            | `use<Thing>`                                                      | `useOrderForm`                |
| Route-local component    | `app/.../_components/<noun>-<role>.tsx`                         | same                                                              |                               |
| Page component           | `page.tsx`                                                      | `<Noun>Page` / `<Nouns>Page`                                      | `OrdersPage`                  |

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

#### Data layer (`lib/db/schema.ts`, `_lib/`, `modules/<x>/`)

| Kind     | Where                                                                            | Identifier                                | Example                                      |
| -------- | -------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| Table    | `lib/db/schema.ts`                                                               | `<nouns>Table`; SQL name plural `<nouns>` | `chatsTable` → `"chats"`                     |
| Row type | not exported; derive inline in `_lib/`/`modules/`                                | `typeof <nouns>Table.$inferSelect`        | `typeof messagesTable.$inferSelect["parts"]` |
| DTO      | `contracts.ts` (module or `_lib`); before that, the `queries.ts` that returns it | `<Noun><Shape>`                           | `ChatDetail`, `ChatListItem`                 |
| Mapper   | `modules/<x>/mappers.ts`, not exported                                           | `to<TargetType>`                          | `toChatMessage(row)`, `toMessageRow(…)`      |

`schema.ts` exports tables only. A DTO is the contract between the data layer and its UI. It
lives in `contracts.ts` together with the input schemas, so one file shows everything that
crosses the boundary in either direction. Inputs are zod schemas because they're untrusted;
DTOs are plain types because the data layer builds them. UI imports DTOs from `_lib/` before
promotion and through the module's `index.ts` after (client components with `import type`, so
`server-only` never reaches the browser bundle), never a row type.

## Stage 3: AI Gateway hello world

- Time: _fill in_
- Highest AI level: _fill in_

**Decisions**

- For Stage 4: only completed assistant replies are stored (`outcome.status === "completed"`); aborted and failed replies are dropped.
