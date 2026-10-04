# Phase 5 integration: invariant audit (saved by the lead; structured sections kept)

- Audited `7e1f4d9..0f2b482` in `/home/user/task5-handoff/wt/p5-int-invariant`; tree clean.
- (1) HOLDS: `decide` keeps any digest another job references; `researchRetained` throws RESEARCH_STATE_INVALID on a malformed collected digest (no verification object, no digest, uppercase, numeric, 63 chars: purge refused, 0 unlinks, own ZIP and an orphan survive); invalid JSON refused at insert by the `json_valid` CHECK.
- (2) HOLDS: only `^[0-9a-f]{64}\.zip$`, lstat (regular, not a link) before each unlink, `artifactsRoot` realpath comparison.
- (3) HOLDS: readiness triggers and their tests unchanged; no transition.
- (4) HOLDS: full `quote()` dumps of research, research_events, runs, events, projects, sessions identical across a refused, a shared-digest and an approved purge (scratch test).
- (5) HOLDS: `research.retained` engine-only; `research.purge` strict `{researchId}`; no storage path in the renderer.
- (6) HOLDS: doctor secret-scan pass (560 files); leaf key memory-only.
- (7) HOLDS: approved gate and tokens untouched; reader verify under the lock; every src commit updates ARCHITECTURE.
- Verified: purge, jobs-state, purge panel, panel, github-tls 179/179; scratch 7/7.
- Open risks: the deleted fake test key remains in git history; invariant 4 rests on a scratch test (repo compares objects); a symlinked `storageRoot` passes the realpath check; a ZIP validated for an active job before the job records it (prevented by the no-active-job orphan rule and UNIQUE `client_ref`); AGENTS.md has no purge invariant row.
