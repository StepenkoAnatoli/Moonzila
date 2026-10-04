# Operate mode

## User requirement and current status

On October 3 the user asked whether Moonzila could later serve the KashMula project, a
fully automated multi-agent online income bot whose phase-1 research is complete
([KashMula `docs/PLAN.md`](https://github.com/StepenkoAnatoli/KashMula/blob/main/docs/PLAN.md)),
and then asked for a mode that allows it. This specification defines that mode. It is
**specified, not implemented**. The [stage plan](../superpowers/plans/2026-10-03-operate-mode.md)
schedules it after the research-jobs phase, and nothing in it claims that any part exists
today.

The same request renamed the product from MoonAliza to Moonzila. The rename is recorded in
[decisions](decisions.md) item 12; identifiers that would break installed apps or links
(the Windows app ID `com.moonaliza.desktop`, the native helper file name, the GitHub
repository name, historical snapshots and research corpora) keep their old spelling.

## What Operate mode is

Operate mode is the sixth value of `Mode` (`ask`, `plan`, `research`, `build`, `mission`,
`operate`). It turns Moonzila into the operator's seat for a business bot that runs
elsewhere: the operator reviews what the bot wants to do, sees what it costs and earns,
can stop it, and reviews the evidence and code changes it proposes. Moonzila is the
client; the bot's loop runs on its own server (for KashMula: a DBOS Transact worker on
Postgres, hosted on Fly.io, per its plan). A desktop application that sleeps and
restarts must never be the process that keeps a business alive, and keeping that line is
also what makes the mode safe to use.

Operate mode builds on `mission`: a mission is durable, resumable and bounded by steps
and time; an operate session is a mission whose tools are the runtime connection below
instead of the local workspace.

### Capabilities

1. **Approval queue.** The runtime pauses on human gates (a new niche, a design batch, a
   refund above the auto-approve threshold, a change to its policy). Each gate arrives as
   a card with the evidence behind it. The operator approves or rejects; the decision is
   journaled before it is sent, carries the digest of the evidence it was taken on, and is
   idempotent by gate id, so a retry after a crash can never approve twice.
2. **Status board and Stop.** Cost per 1,000 results, paid users, spend against the
   provider cap, payout status, last run per agent, and the runtime's own kill switch.
   Stop in Operate mode is the runtime's loop stop (it halts the scheduler and the
   queues), not merely a trigger disable; Moonzila shows the runtime's confirmation, never
   its own assumption.
3. **Evidence review.** A research job (the current phase) can be started for the bot's
   next niche, followed durably, and its reviewed package attached to the approval that
   depends on it. Approval of a niche without a passing kit gate is refused by the
   runtime, not only by the UI.
4. **Change proposals.** When the runtime proposes a code change (a broken Actor, a new
   source adapter), the proposal arrives as a Build-mode review: the diff, the test run,
   approve or reject. Nothing lands on the bot without the same reviewed edit that local
   Build mode already enforces.

### Non-goals

- Running the business loop, scheduling the bot's agents, or holding the bot's platform
  credentials (Apify, PayPal, Paddle, Etsy). Those stay on the runtime.
- Auto-approval of any gate. A gate the operator does not answer stays open; the runtime
  decides what an unanswered gate means (for KashMula: nothing is published).
- Browsing, private-repository access, or any capability the product has not implemented
  for other modes.

## Runtime connection

A **runtime connection** is a new entity: `id`, `name`, `endpoint` (HTTPS URL), `kind`
(`kashmula-dbos` first; others later), `hasCredential`, `revision`, timestamps. Its
credential (a bearer token issued by the runtime) is stored only through the existing
main-owned secret handling and bound to the endpoint by the network broker (decision 4):
the renderer never sees it, and a request to any other host with it is refused before it
is sent.

The runtime exposes a small HTTPS API, served by the bot's own worker. Moonzila consumes
it; it does not define the bot. The contract is frozen in Task 1 of the stage plan and
mirrored in the KashMula repository so both sides build to one document:

| Method and path | Purpose | Idempotency |
|---|---|---|
| `GET /v1/approvals?state=pending` | pending gates with their evidence digests | read |
| `POST /v1/approvals/{id}/decision` | `approve` or `reject`, with the evidence digest the decision was taken on and the operator's note | by gate id and digest; a second decision with a different digest is refused |
| `GET /v1/status` | metrics, spend against caps, last run per agent, stop state | read |
| `POST /v1/stop` | halt the loop; returns the confirmed stop state | idempotent |
| `GET /v1/proposals?state=pending` | code-change proposals with diff, test run and rationale | read |
| `POST /v1/proposals/{id}/decision` | approve or reject a proposal | by proposal id and diff digest |
| `GET /v1/research/{jobId}` | the kit package readiness the runtime holds for a niche | read |

Every call is logged in the journal with the request id, method, input hash and the
runtime's reply, following the existing method-registry rule (decision 1). Stop closes
admissions first (decision 6): an operate session that is stopping sends no further
decisions.

## Policy and limits

- Operate sessions carry the conversation and project policy of the workspace they are
  attached to; a general chat can attach a runtime connection the way it attaches a
  workspace today (reviewed, creating a new conversation).
- Step and time limits apply as in missions. A model is not required to read or decide a
  gate: the approval queue, status board and Stop are deterministic UI over the runtime
  API. The model is used to summarise evidence, draft the operator's note, and explain a
  proposal's diff, within the usual budgets.
- Provider: KashMula's plan calls Claude through API keys with provider-side spend caps.
  Operate mode's model features therefore require the Anthropic provider family, which
  the product does not implement yet; until it exists, the deterministic features work
  with no provider configured.

## Security

- The runtime token is a secret under the existing invariant: never in the engine, the
  database, events, logs, the renderer, argv or files in clear.
- Endpoints are explicit allowlist entries per runtime connection; no redirect to another
  host is followed with the credential.
- A decision is sent only after the journal row is durable; a crash between journal and
  send is recovered by re-sending the same decision, which the runtime treats as a repeat.
- Evidence shown on a card is data, never an instruction: a gate's text cannot change
  what Moonzila does.

## Acceptance

Operate mode is accepted when, against a test runtime that implements the contract:
a pending gate is shown with its evidence, a decision is journaled, sent once, and
survives a crash between journal and send without being sent twice; Stop returns the
runtime's confirmed state and the session refuses further decisions; a proposal is
reviewed through the Build-mode flow and the approval reaches the runtime; the token
never appears in any byte scan of the database, events, logs or user data; and all of
this passes the Windows verification workflow on the exact head.

## Sources

The runtime side of this specification rests on KashMula's reviewed corpus (its
`research/EVIDENCE.md`: DBOS durable queues, notifications and scheduled workflows,
E-51 and E-52; Fly.io Machines, E-49; Anthropic spend caps and stop signals, E-43; the
AI-disclosure duty, E-40). Moonzila's own external facts for the implementation (the DBOS
HTTP and notification surface, Fly.io access from a desktop client, the Anthropic
provider contract) are collected through Research-Kit in Task 0 of the stage plan before
any code is written, following this repository's rule.
