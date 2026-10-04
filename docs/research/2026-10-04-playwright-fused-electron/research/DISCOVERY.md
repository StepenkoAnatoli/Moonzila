# Discovery Contract - How Playwright 1.63.0 can drive a packaged Electron 44.4.5 Windows app whose EnableNodeCliInspectArguments fuse is off

Started 2026-10-04. This file is the definition of "enough information to build".
`node "$HOME/.agents/research-kit/bin/preflight.mjs"` reads it and blocks the build until every unknown
below is either `CLOSED` with evidence or `KNOWN-UNKNOWN` with a verification step.

## Build intent

Moonzila (repository still named MoonAliza; Electron 44.4.5, electron-builder 26.15.3, Windows NSIS target) wants its
packaged build to ship with these fuses: runAsNode off, enableNodeOptionsEnvironmentVariable off,
enableNodeCliInspectArguments off, onlyLoadAppFromAsar on, enableEmbeddedAsarIntegrityValidation on (the reasons are in
`docs/research/2026-10-03-electron-fuses`). Its packaged end-to-end tests (`e2e/*.spec.ts`) launch the exe with
Playwright 1.63.0 `_electron.launch({ executablePath, args: ['--user-data-dir=...'] })` and most of them call
`app.evaluate` in the main process to replace native dialogs, then `app.firstWindow()` and `app.close()`. A lead's
reproduction showed that with only the inspect fuse off, that launch times out after 15 s (the stock exe launched in
323 ms). Done means a builder knows, from Playwright's and Electron's own pages: why the launch times out; what the
inspect fuse does and does not turn off; whether Playwright can drive the fused exe another way (a CDP attach) and what
that loses; and whether relying on `--remote-debugging-port` in a shipped build is allowed and advised - enough to choose
among: keep the fuse on, build a separate test-only package with the fuse on, or drop the packaged e2e step.

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
| U-1 | What Playwright 1.63's `_electron.launch` passes to the exe and waits for (`--inspect=0`, `--remote-debugging-port=0`, the "Debugger listening" and "DevTools listening" lines on stderr), and which of those failing makes it time out (map D-5, D-6, D-8, D-9) | If launch needs the Node inspector, no fuse-off binary can be launched by it, and the e2e harness must change | CLOSED | E-01, E-02 |
| U-2 | Exactly what the `EnableNodeCliInspectArguments` (nodeCliInspect) fuse disables, and whether it affects Chromium's `--remote-debugging-port` / `--remote-debugging-pipe` (map D-6, D-8, T-1) | Decides whether a CDP route stays open on the fused exe | CLOSED | E-05, E-06, E-02, E-01 |
| U-3 | Whether Playwright can attach to a running Electron app over CDP (`chromium.connectOverCDP`) and what that gives and loses compared with `_electron.launch` (main-process `evaluate`, `firstWindow`, app close) (map D-5, D-9, T-1) | The specs mock dialogs through main-process `evaluate`; losing it breaks them | CLOSED | E-04, E-03, E-02, E-07 |
| U-4 | Whether a packaged Electron app honours `--remote-debugging-port` on the command line by default, and any official Electron security guidance about leaving it reachable in a shipped build (map D-2, D-8, T-1) | A CDP route on the shipped exe is a debugging surface in production; guidance decides whether it is acceptable | CLOSED | E-06, E-05, E-08, E-01 |

## Questions for the human (maximum 3)

Intent questions only - things no document can answer. Facts never go here; they go in
the table above. If a question's answer is in public documentation, it is a research
task, not a question.

None.

## Already decided

Locked decisions for this project. Do not revisit these without the human.

- Budget: at most 8 fetched pages and 0 searches; owning pages named directly in `research/plan.json`.
- Phase-0 decompose was not run for real: its dry run planned 4 searches, over the budget of 0. The map is the dry run's seeded checklist, classified by hand.
- The target fuse set is decided (Build intent); this project decides only how the packaged e2e step can drive it.
