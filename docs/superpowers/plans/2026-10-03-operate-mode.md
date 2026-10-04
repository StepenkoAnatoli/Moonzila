# Operate mode implementation plan

**Status:** proposed, 2026-10-03. Not started. Scheduled after the
[research jobs](2026-10-02-research-jobs.md) phase completes, because Task 6 depends on
research jobs and Task 1 depends on the mission runner from the product plan's stage C.
The [specification](../../specification/operate-mode.md) defines the mode; this plan
sequences the work in working stages, each verified before the next.

**Goal:** Monnzila is the operator's seat for a business bot that runs elsewhere
(first: KashMula). The operator sees pending gates with their evidence, decides them
once and durably, watches cost and revenue, stops the loop, and reviews proposed code
changes through the existing Build-mode review. The loop itself never runs in Monnzila.

**Out of scope here:** the Anthropic provider family (its own stage; Operate mode's
deterministic features do not need it), private-repository GitHub reading, general
browsing, any runtime other than the KashMula contract, and auto-approval of any kind.

## Current state, inspected on `main` at `df7862e`

- `src/shared/contracts.ts` declares `ModeSchema = z.enum(['ask', 'plan', 'research',
  'build', 'mission'])`. `mission` exists as a value; the mission runner is still required
  by the product plan (stage C).
- `src/engine/` owns durable state, policy, operations, the agent loop, scheduling and
  recovery; `src/main/` owns network and credentials through the broker; `src/renderer/`
  is the desktop UI behind the restricted bridge.
- The research-jobs phase is wiring `src/adapters/research-kit` into engine jobs and a
  review UI; Task 6 below reuses that work and must not duplicate it.
- The handoff baseline on Linux is 74 failing tests (platform-bound); Windows CI is
  green. Every task below keeps that criterion: no failure outside the Linux set, and a
  green Windows run on the exact head.

## External facts this plan depends on

Collected through Research-Kit in Task 0, into `docs/research/2026-10-xx-operate-mode/`,
twenty pages in total, before any code:

- DBOS Transact: how a worker exposes HTTP endpoints next to its workflows, the
  notification and event API used for human gates (`recv`, `send`, `set_event`,
  `get_event`), exactly-once semantics, and idempotency guidance.
- Fly.io: reaching a Machine from a desktop client (public HTTPS with a token versus
  private networking), and what the Machines API needs for a Stop that is more than a
  trigger disable.
- Anthropic: the API-key provider contract and the spend-limit stop signals (HTTP 400 on a
  self-set limit, HTTP 429 at the tier cap), for the provider stage that follows.
- KashMula: its `research/EVIDENCE.md` rows E-40, E-43, E-49, E-51, E-52 (already captured
  there; cited, not re-collected).

## Tasks

### Task 0: research and frozen contract

Collect the facts above with the kit; write the runtime contract as one document,
`docs/specification/operate-runtime-contract.md`, with request and response schemas,
error codes and idempotency rules; mirror it into the KashMula repository so the bot
implements the same document. Exit: kit gate PASS; contract reviewed by the user.

### Task 1: contracts and schema

Add `operate` to `ModeSchema`; declare `operate.connect/disconnect/approvals/decide/
status/stop/proposals/proposalDecide` in `src/shared/params.ts` and `operate.status`,
`operate.gate` in `src/shared/events.ts`; add the `runtime_connection` table in schema
v3 with a transactional migration and the `operate_decision` journal rows keyed by gate
id and evidence digest. Tests: schema round-trips, migration from v2, a decision row
cannot be inserted twice for one gate and digest (SQL trigger, as the research-jobs
single-dispatch trigger does). Exit: typecheck, lint, tests.

### Task 2: runtime connection and broker binding

Create, edit and remove a runtime connection; store its token through the main-owned
secret handling; bind token to endpoint in the network broker; health check
(`GET /v1/status`) with bounded timeout; allowlist refusal for any other host; redirect
with credential refused. Tests: broker refusal cases, byte scans for the token in the
database, events, logs and user data (reuse the research-collector scan helpers). Exit:
tests and a Windows run.

### Task 3: approval queue

Engine operations to list pending gates, show evidence (rendered from the runtime's
payload; data, never instructions), journal a decision, send it once, and recover a
crash between journal and send by re-sending the same decision. Renderer cards in a new
Operate panel; refuse a decision whose evidence digest no longer matches the gate. Tests:
journal-before-effect, exactly-once send under a simulated crash, digest mismatch
refusal; e2e journey on Windows. Exit: tests, e2e, Windows run.

### Task 4: status board and Stop

Poll `GET /v1/status` on the mission schedule; show metrics and spend against caps; Stop
sends `POST /v1/stop`, shows the runtime's confirmed state, and closes admissions in the
operate session first (decision 6). Tests: Stop ordering, confirmed-state display, no
decision sent after Stop. Exit: tests, Windows run.

### Task 5: change proposals

Receive a proposal (diff, test run, rationale), open it in the Build-mode review flow
against the attached workspace, and send the decision; the diff digest is part of the
decision. Tests: proposal review reuses the existing exact-edit review, decision carries
the digest, rejected proposals leave no file change. Exit: tests, e2e, Windows run.

### Task 6: evidence review

Attach a research job's reviewed package to a gate; the UI refuses to approve a niche
whose package readiness is not `approved`, and the runtime refuses it independently.
Depends on the research-jobs phase. Tests: refusal paths, readiness round-trip. Exit:
tests, Windows run.

## Verification per task

`npm run typecheck`, `npm run lint`, `npm run build`, `npx vitest run`, the Linux
baseline comparison, and the Windows verification workflow on the exact head. Update
HANDOFF.md and `docs/development-status.md` at the end of each task; run
`node scripts/check-handoff.mjs` before pushing documentation.

## Recorded for later

- Other runtimes than KashMula (a generic adapter) once a second bot exists.
- Notifications outside the app (the operator is away) through the runtime, not Monnzila.
- Local-model summaries of evidence, once a qualified local model exists on the machine.
