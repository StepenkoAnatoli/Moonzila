# B4: Research panel review flow

Worktree: `/home/user/task5-handoff/wt/p4-b4`. Read `common.md` beside this file first.

Spec: `docs/specification/research-review-ui.md` sections 1 and 3 ("Display"), and section 5.

Owns: `src/renderer/ResearchPanel.tsx`, `src/renderer/research-text.ts`, `src/renderer/App.tsx` (Open review only), `tests/research-panel.test.tsx` and any new renderer test file, the ARCHITECTURE.md row. NOT the research switch (that is B8, later, in the same files: keep the off-state dead-end text as it is).

Must hold:
- Status table exactly as the spec: Start review (with a model picker; cloud profiles disabled with the reason when the project allows local inference only) for `collected` and `not_ready`; Open review + Cancel review for `reviewing`; Cancel review for `packaging`; nothing for `approved` except the reader and Check again after "Cannot check".
- `approved`: "Checking the reviewed package" -> call `research.document.read` for the brief -> "Ready ..." + first 12 characters of `reviewedPackageDigest` only on `verified: true`; "Unverified ..." on `verified: false`; "Cannot check the reviewed package now" + the error's public message on a rejected call. Discard replies that do not match the job's `researchId`, `revision` and `reviewedPackageDigest` at reply time.
- Open review closes the modal and opens conversation `reviewSessionId`.
- Cancel label by status.
- `RESEARCH_FAILURES` gains an entry for every `REVIEW_FAILURES` member (`src/engine/review-contract.ts`), the admission codes listed in the spec, and `RESEARCH_KIT_UNAVAILABLE`; a test keeps it complete against `REVIEW_FAILURES`. Renderer code must not import engine runtime code if the existing pattern forbids it; check how the collection test keeps its map complete and mirror it.
- Reader: brief / evidence, untrusted plain text in a scrollable `<pre>` through `displayText`; no links, markdown or HTML; source and verification shown above; the `DOCUMENT_*` messages shown on errors.
- The panel test's button-text rule: allow exactly Start review, Open review, Cancel review; still forbid authorize and approve.

Pre-mortem: offers Start review in a status the engine refuses; the failure map drifts from `REVIEW_FAILURES`; renders reader text as markup; shows Ready from the status alone or from a stale reply; treats a rejected read as Unverified.

Tests: jsdom bridge pattern in `tests/research-panel.test.tsx`. Cover each status's controls, Checking -> Ready / Unverified / Cannot check, a stale reply discarded, the map completeness, plain-text rendering of a `<script>`/markdown-link body, Open review.
