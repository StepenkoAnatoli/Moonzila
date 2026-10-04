# B8: research switch in the Research panel (continuation of the B4 builder)

Worktree: `/home/user/task5-handoff/wt/p4-b4` (B4's, on top of B4's commits). Branch `build/p4-b4`. Read `p4-common.md` first.

Spec: `docs/specification/research-review-ui.md` section 4.

Owns: the switch section of `src/renderer/ResearchPanel.tsx`, `src/renderer/research-text.ts` strings, panel tests, the ARCHITECTURE.md row.

Must hold:
- Research off, project trusted: **Allow research** replaces the dead-end text; confirmation lists the three disclosures and the GitHub-collection disclosure; buttons Cancel / Allow public research; the second sends `project.policy.update` with `inference` exactly as currently stored and `research: 'public-technical'`.
- Research on: a small **Turn research off** with its confirmation (jobs, collections and reviews stop; a GitHub collection keeps running there and is not used); sends `research: 'off'`, `inference` unchanged.
- `RUN_ACTIVE` refusal shown as "Finish or stop the running task first"; no retry.
- Never `private-connected`. Untrusted project: the existing "Trust this project" text and no switch.
- The button-text rule from B4 must still pass (Allow research / Turn research off contain neither "authorize" nor "approve").

Pre-mortem: sends `inference` changed or `private-connected`; turns research off without the confirmation; retries after `RUN_ACTIVE`; shows the switch for an untrusted project.

Tests: each must-hold above, including the exact `project.policy.update` params captured from the bridge, Cancel sending nothing, and the e2e journey in section 5 (turn research on through the confirmation, then read a collected job's brief) if the e2e harness can drive it on Linux; otherwise write it and report it untested.
