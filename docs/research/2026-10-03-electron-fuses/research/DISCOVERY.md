# Discovery Contract - Electron fuses and packaged-app code loading: whether a packaged Electron app honours NODE_OPTIONS, --require/-r, ELECTRON_RUN_AS_NODE and --inspect, how fuses (RunAsNode, EnableNodeOptionsEnvironmentVariable, EnableNodeCliInspectArguments, OnlyLoadAppFromAsar, EnableEmbeddedAsarIntegrityValidation) turn them off, and how electron-builder sets fuses

Started 2026-10-03. This file is the definition of "enough information to build".
`node "$HOME/.agents/research-kit/bin/preflight.mjs"` reads it and blocks the build until every unknown
below is either `CLOSED` with evidence or `KNOWN-UNKNOWN` with a verification step.

## Build intent

MoonAliza (Electron 44.4.5, electron-builder 26.15.3, `asar: true`, Windows NSIS target) is about to implement plan
Task 5, the research review, which adds main-process capability (packaging the reviewed corpus). Its e2e harness loads a
test-only preload, `e2e/fixtures/collector-network.cjs`, into main with Electron's `-r` in unpackaged development runs,
and the invariant "it can never be active in a packaged production build" was left unproven; `electron-builder.yml`
configures no fuses. Done means a builder knows, from Electron's and electron-builder's own pages: which code-loading
paths (NODE_OPTIONS, --require/-r, ELECTRON_RUN_AS_NODE, --inspect/--inspect-brk) a packaged Electron 44 app honours by
default; which fuse turns each off and the fuse defaults; how electron-builder sets fuses and whether the pinned version
supports it; and what Electron's security guidance says, so the packaged build's code-loading surface can be closed in
config and checked with a test.

## Unknowns

A fact belongs here when guessing it wrong changes the design: API limits and pricing,
auth model, data schemas, rate limits, licensing/ToS, platform behavior, current library
versions, competitor pricing, data availability.

Status is exactly one of:
- `CLOSED` - proven by an `E-##` row in `research/EVIDENCE.md` (which must point at cached raw text).
- `KNOWN-UNKNOWN` - unreachable now; the `Evidence` cell names the day-one verification step.

Anything else (`OPEN`, blank, "in progress") fails the gate.

| ID | Unknown | Why it blocks the build | Status | Evidence |
|---|---|---|---|---|
| U-01 | Whether a packaged Electron 44 app honours NODE_OPTIONS (in particular `--require`) and NODE_EXTRA_CA_CERTS, and what turns them off | A NODE_OPTIONS preload would load arbitrary code into production main | CLOSED | E-02, E-01, E-04 |
| U-02 | Whether the packaged executable honours `--require`/`-r` and `--inspect`/`--inspect-brk` on its command line | Decides whether the e2e `-r` preload or a debugger can reach a packaged build | CLOSED | E-03, E-01, E-04 |
| U-03 | Whether ELECTRON_RUN_AS_NODE works on a packaged app by default, what it allows, and what disabling it breaks | Run-as-node turns the shipped exe into a Node runtime that loads any script; disabling it breaks `child_process.fork` | CLOSED | E-02, E-01, E-04 |
| U-04 | The fuse list for Electron 44, each default, and what each disables (RunAsNode, EnableNodeOptionsEnvironmentVariable, EnableNodeCliInspectArguments, OnlyLoadAppFromAsar, EnableEmbeddedAsarIntegrityValidation) | The fuse settings are the design | CLOSED | E-01, E-04 |
| U-05 | How electron-builder configures fuses (the `electronFuses` option and the afterPack route) | Decides where the setting lives in `electron-builder.yml` | CLOSED | E-04 |
| U-06 | Whether `electronFuses` exists in the pinned electron-builder 26.15.3 | An unavailable option forces an upgrade or an afterPack hook | CLOSED | E-05, E-04 |
| U-07 | What Electron's security guidance states directly about these fuses | Sets the recommendation the build follows | CLOSED | E-06 |

## Questions for the human (maximum 3)

Intent questions only - things no document can answer. Facts never go here; they go in
the table above. If a question's answer is in public documentation, it is a research
task, not a question.

None.

## Already decided

Locked decisions for this project. Do not revisit these without the human.

- Budget: at most 6 fetched pages and 3 searches; owning pages named directly, no queries.
- Phase-0 decompose was not run for real: its dry run planned 6 searches, over the budget of 3. The map is the dry run's seeded checklist, classified by hand.
