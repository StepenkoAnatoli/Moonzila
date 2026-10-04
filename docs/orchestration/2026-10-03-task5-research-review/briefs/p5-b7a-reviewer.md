# Unit review: b7a (Phase 5)

OBJECTIVE    Review unit b7a (the commits the lead names in your launch message, on `main-axuse`) against its brief and under adverse conditions. Assume a defect exists. You did not author this change.
SOURCES      Builder brief: `briefs/p5-b7a-builder.md` and `briefs/p5-common.md` (in `docs/orchestration/2026-10-03-task5-research-review/`). Builder report: `reports/p5-b7a-builder-1.md`. Spec: `docs/specification/research-purge.md`; requirements: `REQUIREMENTS-P5.md`.
PRE-MORTEM   The lead expected this unit to fail on the "Pre-mortem" lines of its builder brief. Check those first.
SCOPE        A detached worktree the lead gives you. You may add tests and scratch files under your own mkdtemp; product code is read-only. Leave the tree clean.
FOCUS        1. Spec: behaviour missing or different; behaviour the brief does not describe; codes, limits and edge cases.
             2. Report: re-run two of the builder's claimed commands; remove the guard of one new test yourself and confirm it goes red on its own input.
             3. Adverse conditions on this unit's paths: restart, duplicates, stale replies, malformed/empty/oversized input, limits, Windows path and link semantics (every filesystem test: links only as junctions inside the test's mkdtemp, no fixed host path, no assertion on a link's stored text - a finding even if green here).
ENV          `export PATH=/versions/node/v24.21.0/bin:$PATH`; node_modules is a symlink; never npm install. 74 baseline failures need the Windows helper: `/home/user/task5-handoff/baseline-failing.json`.
REPORT       Max 400 words: worktree and commit reviewed; each finding with file:line, reproduction, impact, severity (S1/S2/S3/Rejected); builder claims re-run with results; scenarios that held; what you did not check; Verified / Untested / Mistakes / Open risks.
