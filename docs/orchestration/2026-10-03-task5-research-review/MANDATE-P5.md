# Mandate: Task 5 Phase 5

Standing mandate from the user (2026-10-04): "continue without asking or stopping"; "merge as you decide just be careful"; "dont lower quality"; "/auto build". Read as GO MERGE for this bounded phase under the AGENTS.md merge checks.

- Research: SKIPPED. The Windows delete-with-open-handle behaviour is closed by docs/research/2026-10-03-windows-file-semantics (E-01); certificate generation uses the installed pkijs 3.4.1, read from node_modules.
- Requirements: REQUIREMENTS-P5.md. Design: docs/specification/research-purge.md (decisions with rejected alternatives).
- Classification: bounded (one method, one internal control, one panel control, test fixtures). An architectural change would stop for the user.
- Merge policy: the lead merges when every AGENTS.md merge check holds on the exact head.
- Stop-list: scope beyond the task statement, an invariant change, deleting user data outside retained ZIPs, a metered collection, a force-push.
