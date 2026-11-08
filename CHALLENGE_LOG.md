## My conventions

Started with: reads in `queries.ts`, writes in `actions.ts`, both colocated with the route; db and
auth under `lib/`. Took a detour into full module layering (correct, too heavy), then settled on
colocated `_lib/` by default with promotion to `modules/<x>/` on explicit triggers (chats was
promoted at Stage 3, hard trigger 1: the chat route handler). The rules now live in
[CONVENTIONS.md](CONVENTIONS.md); the earlier in-log version is in git history.

## Stage 3: AI Gateway hello world

- Time: _fill in_
- Highest AI level: _fill in_

**Decisions**

- For Stage 4: only completed assistant replies are stored (`outcome.status === "completed"`); aborted and failed replies are dropped.
