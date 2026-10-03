# Discovery Contract - Facts the October 3 break test could not observe: what npm 11's allowScripts does with an uncovered install script, what esbuild's npm postinstall does and whether skipping it matters, and what engine-strict enforces

Started 2026-10-03. This file is the definition of "enough information to build".
`node "/home/user/Research-Kit/research-kit/bin/preflight.mjs"` reads it and blocks the build until every unknown
below is either `CLOSED` with evidence or `KNOWN-UNKNOWN` with a verification step.

## Build intent

The break test of 2026-10-03 (`docs/evidence/2026-10-03-break-test.md`) left two facts unverified and one fix explained only by observation. This project closes them from the owner's pages so the report's "Remaining risks" and the F1 commit rest on documentation rather than on inference: what npm 11 does with an install script that `package.json#allowScripts` does not name (ran, skipped, or asked), what esbuild's npm postinstall does and whether esbuild works without it, and what `engine-strict` refuses. Done means each unknown below is CLOSED with a quoted page, and the break-test report cites the evidence rows.

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
| U-01 | When `package.json` has an `allowScripts` field, what does npm 11 do with a dependency's install or postinstall script that the field does not name: run it, skip it, or stop and ask? | Decides whether esbuild's and electron-winstaller's scripts ran during MoonAliza's `npm ci` and what the "not yet covered by allowScripts" warning means; the recommendation to the owner is different for "ran with a warning" and "skipped". | CLOSED | E-08, E-12: with `allowScripts` present, npm 11.16.0 and later silently skip the install scripts of every dependency the field does not name and list them at the end of the install; nothing runs and nothing asks. In MoonAliza's `npm ci` under npm 11.19.0 the esbuild and electron-winstaller scripts were therefore skipped, not run with a warning. |
| U-02 | What does esbuild's npm `postinstall` (`install.js`) do, and does esbuild work when that script does not run? | Decides whether the skipped postinstall can break the Windows build that CI runs; on Linux the build passed, which does not answer it for Windows. | CLOSED | E-05, E-06: esbuild's postinstall only verifies the binary's version and, outside Windows, swaps the `.bin` shim for the binary; the binary itself comes from an optional dependency. Skipping it is a supported mode (`--ignore-scripts`) and on Windows loses only the version check, so the Windows build is not at risk from the skipped script. |
| U-03 | What does npm's `engine-strict` configuration enforce: only the root package's `engines`, or also every dependency's, and does `npm ci` read it from a repository `.npmrc`? | The F1 fix adds `engine-strict=true` to the repository `.npmrc`; if dependencies' `engines` fields are also enforced, a dependency can refuse the declared Node, and the fix must be read that way. | CLOSED | E-10, E-11: `engine-strict` makes npm refuse any package, root or dependency, whose `engines` excludes the current Node (`--force` overrides); a project `.npmrc` is the documented way to make a setting apply to every `npm ci`. The F1 fix therefore also lets a dependency refuse a Node the root allows, which the Node 24.21.0 verification run showed does not happen today. |
| U-04 | In which npm version did the install-script policy (`allowScripts`, `npm install-scripts`) appear, so which Node release lines carry it by default? | A contributor on an npm without the policy gets every install script run, which is what HANDOFF.md says the field prevents; the report must say which npm versions the field protects. | CLOSED | E-12, E-07: the opt-in policy exists from npm 11.16.0 (2026-05-27) and became default-deny in npm 12.0.0 (2026-07-08); npm 10, bundled with Node 22, has no `allowScripts` at all. Node 24.21.0 was observed to bundle npm 11.19.0 and Node 22.22.0 npm 10.9.4 (break-test report), so the field protects Node 24 installs and is inert on Node 22, which the F1 `engine-strict` fix now refuses. |

## Questions for the human (maximum 3)

Intent questions only - things no document can answer. Facts never go here; they go in
the table above. If a question's answer is in public documentation, it is a research
task, not a question.

## Already decided

Locked decisions for this project. Do not revisit these without the human.

- Collection is keyless (`http-keyless`, set through `RESEARCH_KIT_TRANSPORT` for this session) and spends nothing; the owner's pages are named directly in `research/plan.json`, no search.
- The kit runs from the Research-Kit checkout (`RESEARCH_KIT_HOME`), not from a deployed copy, because the session container has none; the commit and edit gates are therefore not installed here, and `doctor` says so.
- What this project does not do: it does not decide whether to approve the two scripts or to change electron-builder; those stay the owner's decisions in the break-test report.
