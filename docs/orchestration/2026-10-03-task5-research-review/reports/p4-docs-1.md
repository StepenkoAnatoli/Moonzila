# Phase 4 docs report 1 (saved by the lead; structured sections kept)

- Worktree `/home/user/task5-handoff/wt/p4-docs`, branch `build/p4-docs`, commit `9840231` on `5e084ff`; commit gate passed.
- `research-review-ui.md`: "Phase 4 as built" (the spec reviewer's four groups, P4-4, P4-11, P4-17, P4-21, P4-24, P4-27, P4-23 moved out with a link); approved text unchanged. `ARCHITECTURE.md`: reader row (P4-25: every non-stale error -> RESEARCH_KIT_UNAVAILABLE; walk from the filesystem root; extra NOT_AVAILABLE/UNSAFE cases); policy route (`policy.guard` on every update; P4-11). Plan: Phase 4 entry; P4-27 note under missions. AGENTS.md: three invariant rows with their tests.
- Checks: identifiers and UI strings grep-found; commit ids and links resolve; the four cited test files 96/96 (verified).
- Mistake: the first AGENTS row overclaimed "every refusal"; narrowed to what the test checks.
- Refused by the permission system ("Instruction Poisoning"): editing `docs/ARCHITECTURE.md` line 29, which still says "The user reviews and merges it. Do not merge on the user's behalf." (conflicts with AGENTS.md and the user's 2026-10-04 decision). Not retried. The lead did not edit it either; raised with the user.
- Note: the plan entry claims only the spec and invariant reviews (breaker and mutation still running).
