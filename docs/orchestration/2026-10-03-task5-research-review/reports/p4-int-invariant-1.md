# Phase 4 integration: invariant audit (saved by the lead; structured sections kept)

- Audited `ab97386` (`7bc04e6..ab97386`) in `/home/user/task5-handoff/wt/p4-int-invariant`; tree clean. Pending B11 fixes and the e2e journey not checked.
- (1) No unredacted text or secret reaches the renderer: HOLDS. Scratch byte scan with vault secrets taken from the fixture BRIEF, EVIDENCE and approved BRIEF plus a workspace secret: every source redacted; error message, stack, cause and `safeError` output clean for a throwing redactor (text as message and cause), too large, hard link, broken vault, a control throwing the secret (-> INTERNAL_ERROR); no log written by the reader or route; `reports/` clean in the worktree and the main checkout.
- (2) `verified: true` only for bytes validated in the call: HOLDS (every collected/approved read calls `verifyRetained`, text from its buffer; workspace never verified by schema; Ready matches id, revision, digest).
- (3) A refused research-only change has no side effect: HOLDS (refusal under the lock before abort/revoke/hold; engine re-check before `putProject`/`cancelProject`).
- (4) `approved` only through the kit's gate: HOLDS (no new transition; `research-jobs-state` 70/70).
- (5) No path from the renderer: HOLDS (strict params; scratch test rejects `path` and a path-like document).
- Internal controls `policy.guard`, `session.project` unreachable from the renderer: HOLDS (not in MethodSpec; `parseRequest` rejects; preload forwards only parsed requests).
- AGENTS.md invariants touched: tokens HOLDS (the collector token is a vault entry, redacted); imported research untrusted HOLDS (plain text, no innerHTML or markdown).
- Verified: 40/40 reader, route, guard-control, engine-policy; scratch scans 2/2, reachability 1/1; 70/70 jobs state. Untested: real Electron IPC, Windows.
- Open risk: a run created outside `run.start` (missions later) would bypass the lock; main would abort and hold before the engine refuses.
