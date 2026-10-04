# Research Kit offline consumer implementation plan

**Goal:** Validate actual pinned Research Kit artifacts through an owned, bounded Windows process, retaining exact verified bytes and distinguishing validity/research readiness from Moonzila permissions.

**Architecture:** A main-owned adapter under `src/adapters/research-kit/` consumes independent strict contracts and trusted installation/job inputs. It stages verified runtime files and the artifact in private storage, acquires native read locks before hashing/launch, invokes the actual external CLI and retains content-addressed artifact bytes. The renderer cannot supply executable paths or dispatch identities. Stage 2 will connect job-owned IPC admission and UI; this stage provides serializable boundary contracts and an opt-in executable verifier, not a fake job lifecycle.

**Stack:** Existing TypeScript, Zod, yauzl, Windows Job Object helper, Vitest, Node 24 and pinned Research Kit `5588ce3def50e7e3702e5f84251bfd3d445f3df0`. No bundled Research Kit runtime or new npm dependency.

**Spec:** [Approved review and fixture requirement](../../specification/research-kit-integration-review.md). [Fetched evidence](../../../research/BRIEF.md). User approved this design and requires a PR at every completed phase, merging it themselves.

## Constraints

- Artifact validity, research readiness and app permission remain separate; no Build gate or permission override is introduced.
- Trusted main configuration supplies the external kit directory and Node executable digest; the checked-in file inventory pins the kit bytes, not merely its claimed version.
- Bound archive input, expansion, JSON/output, entry count and execution time. Abort/timeout/output overflow must stop only the owned process tree.
- Validator messages and imported instructions never become executable instructions or raw renderer errors. Private temporary directories and a minimal environment exclude inherited credentials.
- Source archive bytes are read once through a bounded handle, hashed and copied to private staging. Locks include files and ancestor directories to prevent replacement during validation. Retained reads verify the digest into a buffer, avoiding a later pathname re-read.
- Existing ordinary coding projects keep working. No production qualification or signing claim is made.

## Tasks

1. [x] **Native guarded execution** — add optional read locks and a pre-start handshake to `src/tools/commands.ts` and `native/host.cpp`; tests in `tests/commands.test.ts` or a focused guarded-process file. First prove the missing behavior, then verify that writes/renames fail while locked, failed hash admission starts no child, abort releases ownership, and ordinary commands retain their behavior. Rebuild the helper before passing tests.
2. [x] **Pinned artifacts and installation inventory** — create a maintainer-only generator under `scripts/`, explicit fixture provenance and exact-byte ZIPs under `tests/fixtures/research-kit/`, and a trusted digest inventory under the adapter. Use real pinned producer CLI outputs from explicitly synthetic corpus/review inputs. Include a real prior-version producer for legacy fixtures; record that second pin. Record expected actual validator outputs and labeled negative mutations. Tests never regenerate goldens. CI obtains the external pinned kit in ignored storage and must fail if it is missing or altered.
3. [x] **Consumer boundary and storage** — independent bounded request/report/manifest/receipt schemas; bounded archive inspection; runtime/file identity verification; private staging; actual fixed CLI invocation with minimal environment; digest/revision/job binding; sanitized failure codes; content-addressed retained reads. Write behavioral tests first, including the actual validator against real artifacts, unsupported/mixed versions, contradictory readiness, tampering, wrong job, path/size attacks, bad output, timeout/Stop, changed installation and source replacement.
4. [ ] **Delivery and handoff** — add a portable opt-in CLI verifier, update architecture/current status/continuation with real results and limits, preserve all historical bytes, run targeted/full/native/type/lint/build/runtime/desktop checks, scan secrets, push and open a new PR. Verify actual final-head Windows CI. The user merges; this backend stage does not replace the published 0.6 installer or pretend the later research UI exists.

## Progress

September 30: PR #11 is merged at `2a3dd9e`; clean branch `feat/research-kit-offline` starts there. Pinned external kit checked out under ignored `.build`. Three primary sources collected through the research collector; preflight PASS, zero blocking and the two pre-existing warnings. An actual CLI probe produced valid `REVIEW_IN_PROGRESS` and `APPROVED_BRIEF` artifacts with false/true readiness respectively. Synthetic fixture metadata is not evidence of a real research dispatch.

Native guarded execution now compiles. All four new behavioral regressions failed against the previous implementation, then passed with the new protocol; the focused run passed 14 tests across guarded-process and existing command tests. It checks locks before verification/launch, failed admission, Stop during admission and stopping on output overflow. This is focused evidence only; the remaining adapter, fixtures, full verification and PR are still outstanding.

User steering: ordinary conversation without a project folder is now an explicit upcoming requirement, recorded in [folder-free chat](../../specification/folder-free-chat.md) and linked from the handoff. Recommended sequence is that user-facing phase after this offline stage, before research jobs/review UI. No folder-free chat implementation or installer change is claimed by this branch.

October 1 local delivery evidence: 458 tests / 35 files passed in 317.67 seconds, including all 15 actual-validator fixture reports, 43 consumer tests and seven native guard tests. Typecheck, lint, native build, app build, real Electron/SQLite load and six desktop journeys passed. The standalone verifier returned PASS/ready and PASS/not-ready for the approved and unreviewed fixtures. Two full-suite worker-start failures were reproduced; separate isolated UI fork workers preserve all test files/assertions and the final full run has zero errors or skips. Push/PR and its exact-head Windows checks remain the delivery acceptance step; the user merges the PR.
