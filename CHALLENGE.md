# Dogfood Challenge: Persistent AI Chat

Nov 6, 2026 · @Michael

## Goal

Build a simple chat app that sends and receives messages and calls at least one tool, while strictly following your own conventions for folder structure, access logic and naming. The app is the vehicle; the real output is a tested and improved set of conventions.

**Stack:** Next.js (App Router, TypeScript) · Vercel AI SDK with Vercel AI Gateway · Drizzle ORM · Postgres in local Docker Compose

## User stories

1. As a user I can create new chats, and they are persisted in the database.
2. As a user I can send messages, stored and identifiable as user messages.
3. As a user I receive assistant messages, stored and identifiable as assistant messages.
4. As a user I can see when the assistant used a tool, and still see it when I reopen the chat.
5. As a user I can open older chats, and their messages display in the right order.
6. As a user I can delete chats.

Renaming a chat completes the CRUD journey and is listed as a stretch goal.

## Scope and ground rules

- **In scope:** single user, runs locally.
- **Out of scope:** authentication, multiple users, deployment (all available as stretch goals).
- Keep a dedicated data-access layer even without auth, so your access rules are still exercised.
- Pin package versions. The AI SDK changes major versions often and AI assistants frequently suggest outdated APIs, so check every suggestion against the docs for your installed version.

## Design decisions to make

Each of these is a choice your conventions should guide. Record every decision and its reason in `CHALLENGE_LOG.md`.

| Decision           | Why it matters                                                                                                                  | Decide in |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Message storage    | AI SDK messages (`UIMessage`) consist of typed `parts` (text, tool calls), not one string: `jsonb` column or normalized tables? | Stage 1   |
| Message ordering   | Two messages saved in the same request can share a timestamp, so you need a deterministic tiebreaker                            | Stage 1   |
| IDs                | The AI SDK generates message IDs on the client                                                                                  | Stage 1   |
| Delete semantics   | Hard delete with FK cascade, or soft delete?                                                                                    | Stage 1   |
| Persistence timing | What is stored when a stream is aborted, errors or the page is refreshed mid-reply?                                             | Stage 4   |
| Tool call display  | How tool calls are stored and rendered so they survive a reload                                                                 | Stage 5   |

## How to use this challenge

You write the code; AI acts as a reviewer at each checkpoint and as a coach only when you are stuck. Each stage ends with a commit tagged `cp-<n>`, a self-check against its acceptance criteria, and an AI review against your conventions.

**AI help levels** (log the highest level you used per stage):

| Level | What you ask AI for                  | Example                                             |
| ----- | ------------------------------------ | --------------------------------------------------- |
| L0    | Nothing                              | —                                                   |
| L1    | Concepts or a docs pointer           | "How does `useChat` get initial messages?"          |
| L2    | A hint about your code, no code back | "Why do my messages come back out of order?"        |
| L3    | A code snippet                       | "Show me the Drizzle relation for chats → messages" |

**Keep a `CHALLENGE_LOG.md`** in the repo with one entry per stage: time spent, highest AI level, and _convention friction_ — every moment a rule was unclear, missing, contradictory or got in your way. That friction list is the real output of the dogfooding.

**Checkpoint ritual:**

1. Tick off the stage's acceptance criteria yourself first.
2. Commit and tag: `git tag cp-<n>`.
3. Run the review prompt below with your conventions doc, the diff and the stage's criteria.
4. Fix what you agree with, note what you disagree with in the log (that is often a convention to change).

**Checkpoint review prompt** (reuse for every stage):

```markdown
You are reviewing a coding challenge checkpoint. Do NOT write or rewrite code.

## My conventions

<paste conventions doc>

## Stage <n> acceptance criteria

<paste the stage's checklist>

## Changes since last checkpoint

<paste output of: git diff cp-<n-1>..cp-<n>>

Please report:

1. Each acceptance criterion: PASS / FAIL / CAN'T TELL, with one line of evidence.
2. Every convention violation: file, rule, why it violates it.
3. Places where my conventions are silent or ambiguous and I had to make a call.
4. Up to 3 risks for the next stage.
   Be strict. Hints only, no solutions.
```

## Stages

Eight stages, each ending in a working, committable state. AI enters the app only at stage 3, so stages 0–2 test your structure and data conventions without AI noise.

### Stage 0 — Skeleton and local infrastructure

**Build:** Next.js (App Router, TypeScript) laid out per your folder conventions; lint and format setup; `docker-compose.yml` with Postgres (named volume, healthcheck); `.env.example`; a README with run instructions.

- [x] `docker compose up -d` starts Postgres and it reports healthy
- [x] `pnpm dev` (or npm) serves a page
- [x] `.env.local` is git-ignored, `.env.example` is committed
- [x] Folder structure matches your conventions, including empty placeholders where needed

**Convention focus:** Does every top-level folder have a rule? Where does server-only code live, and how is that enforced (e.g. `server-only` imports, lint rules)?

### Stage 1 — Data model and DB layer

**Build:** Drizzle config, schema for `chats` and `messages`, migrations, a DB client, a seed script and a data-access module.

**Decide and write down:** ID strategy (the AI SDK generates message IDs on the client), role column type, how `parts` are stored, the ordering column, FK delete behaviour, timestamps.

- [x] Migrations apply cleanly on a fresh database
- [ ] Seed creates 2 chats with a few messages each
- [ ] Querying a chat's messages returns the right order, even when two rows share a timestamp
- [ ] Deleting a chat removes its messages
- [ ] No file outside the data-access layer imports the DB client

**Convention focus:** Naming — table names (singular/plural), snake\_case in SQL vs camelCase in TS, schema file names, query function names (`getChatById` vs `findChat`).

### Stage 2 — Chat CRUD without AI

**Build:** Sidebar listing chats (newest first), "New chat" that creates a row and navigates to `/chats/[id]`, a chat page showing stored messages from the seed, delete with confirmation.

- [ ] New chat appears in the sidebar and persists after reload
- [ ] Opening a seeded chat shows its messages in order, with user and assistant visually distinct
- [ ] Deleting a chat removes it from the sidebar and redirects sensibly
- [ ] An unknown chat ID shows a 404, not a crash

**Convention focus:** Access logic — may components import data-access functions directly? Server Actions vs route handlers: which for what, and how are they named?

### Stage 3 — AI Gateway hello world

**Build:** Install `ai` and `@ai-sdk/react`, add `AI_GATEWAY_API_KEY`, a route handler that streams a reply from a gateway model string (`provider/model`), `useChat` on the chat page. No persistence yet.

- [ ] A sent message streams a reply into the UI
- [ ] A missing or invalid API key shows a readable error, not a blank screen
- [ ] Model ID lives in one config place, not in components
- [ ] Env vars are read and validated in one place

**Convention focus:** Where does AI/provider code live? Is it a feature folder, a lib, a service?

### Stage 4 — Persist the conversation

**Build:** On each request, save the user message, load history from the DB (send only the newest message from the client), stream the reply, save the assistant message when it finishes. Hydrate `useChat` with stored messages on page load.

- [ ] Reload after a reply shows the identical conversation
- [ ] Every row has the correct role
- [ ] Order is correct after 10+ exchanges
- [ ] Refreshing mid-stream keeps the user message and leaves no broken assistant row (or exactly the behaviour you decided)
- [ ] Retrying a message creates no duplicates
- [ ] Request body is validated before anything is written

**Hint (L1):** look up `onFinish`, `originalMessages` and `consumeStream` in the docs for your installed AI SDK version.

**Convention focus:** Naming of mapping functions between DB rows and `UIMessage`; where shared types live; transaction boundaries.

### Stage 5 — Tool calling

**Build:** One server-side tool. Good options: `getCurrentTime(timezone)` (no dependencies) or `searchMyChats(query)` (reads your own DB, so it tests your access rules). Allow multiple steps so the model answers after the tool result. Render tool parts in the UI.

- [ ] Asking a question that needs the tool triggers it and the model uses the result
- [ ] The UI shows tool input, state and output distinctly from text
- [ ] Reopening the chat still shows the tool call
- [ ] A failing tool shows an error part instead of breaking the chat
- [ ] Tool input is validated with a schema

**Convention focus:** Where tools live, how they are named (`verbNoun`?), and whether a tool may call the data-access layer.

### Stage 6 — Hardening

**Build:** Loading, empty and error states; an auto-generated chat title from the first message; integration tests for the data layer against a test database.

- [ ] Empty state for no chats and for an empty chat
- [ ] Sending to a deleted chat returns a clean 404 from the API
- [ ] Tests cover ordering, cascade delete and role mapping, and pass
- [ ] No `any` and no unhandled promise in the data and API layers

### Stage 7 — Final audit

**Build:** Nothing new. Run the checkpoint prompt on the whole repo instead of a diff, then do a fresh-clone test.

- [ ] Clone into a new folder, follow only the README, chat works in under 10 minutes
- [ ] AI audit finds no unaddressed convention violations
- [ ] `CHALLENGE_LOG.md` has an entry for every stage

## Stretch goals and retrospective

Once stage 7 passes, pick any stretch goal, then run the retrospective. The retrospective's output is version 2 of your conventions.

**Stretch goals:**

- Rename a chat (completes CRUD properly)
- Regenerate or edit the last message
- A tool that needs user approval before it runs
- Model switcher via the gateway
- Deploy to Vercel with hosted Postgres
- Auth with per-user access checks (the real test of your access logic)

**Retrospective questions** (answer from `CHALLENGE_LOG.md`):

1. Which rules did you break, and was the rule or the code wrong?
2. Which decisions did your conventions not cover at all?
3. Which rules did AI suggestions violate most often? Those need clearer wording or tooling.
4. Which rules can be enforced automatically (lint, folder boundaries, CI) instead of by memory?
5. What would you change before handing these conventions to someone else?

**References:** [AI SDK docs](https://ai-sdk.dev/) · [Vercel AI Gateway docs](https://vercel.com/docs/ai-gateway) · [Drizzle ORM docs](https://orm.drizzle.team/)
