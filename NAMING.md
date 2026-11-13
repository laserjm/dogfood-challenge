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

A component lives as close to its use as it can, in one of two places:

- **One route group renders it:** the `_components/` of the nearest folder above every page that
  renders it. One page: `app/(chat)/[chatId]/_components/`; several pages of the group:
  `app/(chat)/_components/`.
- **More than one route group renders it:** flat in `components/`. The noun prefix groups related
  files (`components/chat-list.tsx`, `components/chat-list-skeleton.tsx`).

`components/` has no subfolders besides `ui/`, and none is named after a module: a module holds no
UI. A component moves to `components/` when a second route group renders it, and back when only
one is left. The file and identifier patterns are the same in both places.

## Data

| Kind     | Where                                                                                   | Identifier                                | Example                      |
| -------- | --------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------- |
| Table    | `lib/db/schema.ts` (exports tables only)                                                | `<nouns>Table`; SQL name plural `<nouns>` | `chatsTable` → `"chats"`     |
| Row type | not exported; derive inline where needed                                                | `typeof <nouns>Table.$inferSelect`        |                              |
| DTO      | `contracts.ts`; in a self-contained route without one, the `queries.ts` that returns it | `<Noun><Shape>`                           | `ChatDetail`, `ChatListItem` |
| Mapper   | `modules/<x>/mappers.ts`, not exported                                                  | `to<TargetType>`                          | `toChatMessage(row)`         |

Inputs are zod schemas because they are untrusted; DTOs are plain types because the data layer
builds them. UI imports DTO types, never a row type.
