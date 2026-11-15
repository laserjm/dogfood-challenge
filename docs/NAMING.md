<!-- conventions 0.9.0 -->

# Naming

The lookup tables for [CONVENTIONS.md](./CONVENTIONS.md), Defaults → Naming. Read this when you create
or rename a file or an export.

## UI and use cases

| Kind                 | File                                                                     | Identifier                                                                                                                               | Example                                                   |
| -------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Server action        | `actions.ts`                                                             | `<useCase>Action`                                                                                                                        | `deleteChatAction`                                        |
| Query                | `queries.ts`                                                             | `get<Noun>` / `get<Nouns>`, returns `null` when missing (there is no `find`); in a module `(requester, …)`, bound to `(…)` by `index.ts` | `getChat(requester, id)` → `chats.getChat(id)`            |
| Command              | `modules/<x>/commands.ts`                                                | the use case's name, same binding                                                                                                        | `deleteChat(requester, id)` → `chats.deleteChat(id)`      |
| Domain rule          | `modules/<x>/domain.ts`, `policy.ts`                                     | a business verb or predicate, pure                                                                                                       | `applyCredits(chat, amount)`, `canShare(requester, chat)` |
| Input contract (zod) | `contracts.ts`                                                           | `<useCase>Input`; inferred type `<UseCase>Input`                                                                                         | `sendMessageInput`, `SendMessageInput`                    |
| Error class          | `errors.ts`                                                              | the fact that blocks the action                                                                                                          | `ChatNotFound`, `TitleTaken`                              |
| Error list           | `errors.ts`                                                              | with E8: `<noun>Errors`, union `<Noun>Error`, guard `is<Noun>Error`                                                                      | `chatErrors`, `ChatError`, `isChatError`                  |
| Refusal              | with E8: `refusals.ts` next to `actions.ts` or `route.ts`                | `<noun>Refusal(error)`, one per module it maps                                                                                           | `chatRefusal(error)`                                      |
| Agent tool           | `modules/<x>/tools.ts`                                                   | `<noun>Tools`; the tool's own name is `snake_case` unless the project chose another style (E5)                                           | `recordTools`, `search_records`                           |
| Component            | `components/<noun>-<role>.tsx`, or `app/.../_components/` if route-local | `<Noun><Role>`, props `<Component>Props`; client components start with `'use client'`, no suffix                                         | `ChatList`, `ChatListProps`                               |
| Hook                 | `hooks/use-<thing>.ts`, or `_components/` if route-local                 | `use<Thing>`                                                                                                                             | `useIsMobile`                                             |
| Page                 | `page.tsx`                                                               | `<Noun>Page` / `<Nouns>Page`                                                                                                             | `ChatPage`, `ChatsPage`                                   |

Roles (last word of a component name): `List`, `Table`, `Card`, `Row`, `Form`, `Dialog`, `Sheet`,
`Panel`, `Badge`, `Summary`, `Picker`, `Select`, `Filters`, `Toolbar`, `Empty`, `Provider`, or any
name from the [shadcn components list](https://ui.shadcn.com/docs/components.md), and:

| Role      | What it is                                                                   | Example           |
| --------- | ---------------------------------------------------------------------------- | ----------------- |
| `Icon`    | a glyph                                                                      | `ProjectIcon`     |
| `Chip`    | a compact token for one thing inside a sentence or an input, often removable | `RecordChip`      |
| `View`    | the body of one thing that a `Panel` or `Dialog` frames                      | `IssueView`       |
| `Section` | a titled part inside a view                                                  | `CommentsSection` |
| `Frame`   | a sandboxed `iframe` and what it hosts                                       | `PreviewFrame`    |
| `Shell`   | a page's outermost layout: sidebar, main area, dialogs                       | `WorkspaceShell`  |

A component that renders one kind of content is named for the content alone (`Markdown`,
`CodeBlock`, `MermaidDiagram`). The noun may be `App` for shell pieces (`AppSidebar`); a role may
stack to describe a state (`ChatListSkeleton`). A role the list lacks is added in
`docs/EXTENSIONS.md` (CONVENTIONS.md, E4), not invented silently. Unexported helpers are free-form
as long as they don't mimic `*Action`, `*Page` or a verb-first use-case name.
`components/ui/*` is shadcn: don't rename it, don't add your own components there.

A component lives as close to its use as it can, in one of two places:

- **One route group renders it:** the `_components/` of the nearest folder above every page that
  renders it. One page: `app/(chat)/[chatId]/_components/`; several pages of the group:
  `app/(chat)/_components/`.
- **More than one route group renders it:** in `components/`. The noun prefix groups related
  files (`components/chat-list.tsx`, `components/chat-list-skeleton.tsx`).

A component moves to `components/` when a second route group renders it, and back when only one
is left. The file and identifier patterns are the same in both places.

Both folders are flat until they no longer scan: when one holds many files of several nouns, it is
grouped one level deep by the noun a component renders (`_components/threads/thread-row.tsx`,
`_components/records/record-panel.tsx`). A component that renders several nouns, or none (the
shell, a shared button), stays at the root. A noun folder may share a module's name; it is still
the route's UI, not the module's, because a module holds no UI. Besides noun folders,
`components/` has only `ui/`.

## Data

| Kind     | Where                                                                                   | Identifier                                | Example                      |
| -------- | --------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------- |
| Table    | `lib/db/schema.ts` (exports tables only)                                                | `<nouns>Table`; SQL name plural `<nouns>` | `chatsTable` → `"chats"`     |
| Row type | not exported; derive inline where needed                                                | `typeof <nouns>Table.$inferSelect`        |                              |
| DTO      | `contracts.ts`; in a self-contained route without one, the `queries.ts` that returns it | `<Noun><Shape>`                           | `ChatDetail`, `ChatListItem` |
| Mapper   | `modules/<x>/mappers.ts`, not exported                                                  | `to<TargetType>`                          | `toChatMessage(row)`         |

Inputs are zod schemas because they are untrusted; DTOs are plain types because the data layer
builds them. UI imports DTO types, never a row type.
