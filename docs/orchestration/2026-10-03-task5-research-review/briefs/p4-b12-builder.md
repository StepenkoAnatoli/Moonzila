# B12: the Phase 4 e2e journey (P4-20)

Worktree: `/home/user/task5-handoff/wt/p4-b12`, branch `build/p4-b12`, from the current `main-axuse` (B4, B4b, B8, B8e, B11 integrated). Read `p4-common.md` first (in this folder).

Spec: `docs/specification/research-review-ui.md` section 5: "One new e2e journey: turn research on through the confirmation, then read the brief of a collected job."

Owns: `e2e/research-journeys.spec.ts` (add a journey; do not change existing ones) or a new `e2e/research-review-ui.spec.ts`; e2e fixtures under `e2e/fixtures/` if needed; nothing under `src/`.

Facts to start from (verify): `e2e/research-journeys.spec.ts` already drives the real app, the real pinned kit and the Windows native helper against a loopback fake GitHub, loads a harness into main with Electron's `-r`, and reaches a collected package (`collectedProject` from the kit's `test/artifact-fixtures.mjs`). The collector runs only through the Windows native helper, so collecting journeys `test.skip` off Windows; the `-r` harness skips under `MOONALIZA_TEST_EXECUTABLE` (the packaged run). Reuse that harness and its skip rules exactly.

The journey:
1. A trusted project with research off: open Research, click **Allow research**, see the disclosures, click **Allow public research**; the panel shows research on and the details pane no longer says research is off.
2. Start a collection the way the existing journey does, let the fake GitHub produce the collected package, wait for `collected`.
3. Open the brief in the reader: source "collected", "verified by the Research Kit", the brief's text shown as plain text; no "Ready" anywhere.
4. Also assert the research-off refusal path only if it can be reached without a Build run's model; otherwise leave it to the unit tests and say so.

Must hold: no timed sleeps (wait on visible state, as the existing journeys do); no network beyond the loopback fake; no secrets in the test; the same skips as the existing collecting journey.

Pre-mortem: the journey cannot run here (Linux) and turns Windows CI red on a selector or a timing assumption; or it re-implements the harness instead of reusing it; or it is skipped everywhere and proves nothing.

Verification: `npm run typecheck`, `npm run lint`, and `npx playwright test <your file> --list` (it must list the journey). Run it on Linux if the existing journey runs on Linux (it does not: say so). The lead verifies it through Windows CI on the PR. Report what you could and could not run, each marked verified / untested / expected.
