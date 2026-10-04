# Requirements: Task 5 Phase 5 (auto-build)

Task statement (verbatim): "Continue the auto-build: Moonzila Task 5 Phase 5 (research.purge per docs/specification/research-purge.md, P4-40 test-time TLS fixtures, four-role review, gap-audit and break-test over Task 5)". The user's standing instructions: "continue without asking or stopping", "merge as you decide just be careful", "dont lower quality" (2026-10-04).

| ID | Requirement | Source |
|----|-------------|--------|
| F-1 | `research.purge {researchId}` is main-owned and returns `{removed, keptShared, keptBusy}` | spec research-purge.md decision 1 |
| F-2 | Allowed only for `approved`, `failed`, `cancelled`; otherwise `PURGE_NOT_ALLOWED` | user 2026-10-03 (finished jobs); spec decision 2 |
| F-3 | Deletes only the job's retained ZIPs that no other job references; the job, journal and hashes stay | user 2026-10-03; spec decisions 3, 7 |
| F-4 | References read through the internal control `research.retained` inside the adapter's storage lock | spec decision 4; repo: `serialized()` in `src/adapters/research-kit/adapter.ts` |
| F-5 | Unreferenced ZIPs removed only when no job is in `ACTIVE_RESEARCH`; else kept and `keptBusy` | Q7 (research-review.md); spec decision 5; repo: `src/engine/research-state.ts` |
| F-6 | Receipts for deleted digests forgotten | spec decision 6; P4-30 |
| F-7 | Panel: "Delete stored corpus" for finished jobs, a confirmation with the three disclosures, the result shown | spec decision 8 |
| F-8 | The e2e test CA and leaf are generated at test time; no private key is committed | P4-40; kit 0.9.5 doctor; README of tests/fixtures/github-tls |
| N-1 | Windows: deleting a ZIP another handle holds open is retried once, then `PURGE_INCOMPLETE`, keeping the packages already deleted (amended 2026-10-04 per P5-5; was `RESEARCH_KIT_UNAVAILABLE` with nothing half done) | docs/research/2026-10-03-windows-file-semantics BRIEF (E-01: an open handle without FILE_SHARE_DELETE blocks delete) |
| S-1 | No path from the renderer; `research.retained` unreachable from the renderer | Phase 4 invariant 5; repo: `MethodSpec`/`parseRequest` |
| T-1 | Every new test shown red with its guard removed; timing-sensitive tests repeated under load; Stores closed before cleanup | lead-orchestrator; P4-34, P4-35 |
| A-1 | Full Linux gate equals the baseline; Windows CI green on the merged head | AGENTS.md merge rule |
| D-1 | `pkijs` 3.4.1 and `asn1js` 3.0.10 (both BSD-3-Clause) become explicit devDependencies rather than transitive ones | engineering judgment: a transitive dependency of electron-builder can disappear in an upgrade |
