# Extensions

What this app decided at the conventions' extension points (`docs/CONVENTIONS.md`, Extension
points). The conventions leave these seams to the app. An entry here departs from nothing, so it
needs no ADR. A rollout of the conventions never overwrites this file.

An entry says what was decided, where it lives in the code and, in a line, why. Change an entry
when the decision changes, in the same pull request as the code.

## E5. Agent tool names

- camelCase: `getWeatherInformation`, `askForConfirmation`, `getLocation` in
  `modules/chats/tools.ts`, and a new tool in `chatTools` follows them. Conversations store the
  names (`tool-<name>` in `messages.parts`), and they predate the conventions' `snake_case`.
  Renaming one is a custom migration of the stored parts. Before 0.9.0 this was ADR 0002.

## E8. Exhaustive error mapping

- `chats`, the only module: `modules/chats/errors.ts` exports `chatErrors`, `ChatError` and
  `isChatError`, re-exported by `index.ts`. `app/(chat)/refusals.ts` serves `actions.ts` and
  `app/api/chat/refusals.ts` serves `route.ts`. Each has a `refusals.test.ts`, and
  `test/errors.test.ts` checks the list.
- Where the action must call `notFound()`, `chatRefusal` answers `"notFound"` and
  `deleteChatAction` calls it.
- Why: adopted when 0.7.0 made it the default, and kept. A new class in `chats` fails to compile
  until both adapters answer it.
