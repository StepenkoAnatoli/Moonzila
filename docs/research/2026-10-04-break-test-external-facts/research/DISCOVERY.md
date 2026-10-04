# Discovery Contract - Facts the 2026-10-04 break test could not observe on Linux: the Windows environment-block sort rule, Node's fs open flags on Windows, and where Node takes its default locale

Started 2026-10-04. This file is the definition of "enough information to build".
`node "$HOME/.agents/research-kit/bin/preflight.mjs"` reads it and blocks the build until every unknown
below is either `CLOSED` with evidence or `KNOWN-UNKNOWN` with a verification step.

## Build intent

The break test of 2026-10-04 (`docs/evidence/2026-10-04-break-test.md`) ran on Linux; MoonAliza ships on Windows. Three statements in its report rest on how Windows or Node behave there, which no Linux probe can show: the order Windows requires of an environment block (spawnOwned and the e2e harness sort it with `localeCompare`), which `fs.constants` open flags exist on Windows (the reader's `O_NOFOLLOW` / `O_NONBLOCK` guards), and where Node takes the default locale that `localeCompare` uses. Done means each is CLOSED from the owner's page or KNOWN-UNKNOWN with the Windows step that would close it, and the report cites the rows.

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
| U-01 | What order does Windows require of an environment block passed to CreateProcessW: any, ordinal, or locale-aware? | spawnOwned (`src/tools/commands.ts:66`) and `e2e/fixtures/collector-network.cjs` sort the block with `localeCompare`, which on Linux was observed to differ from ordinal order even in en-US (`a_b` before `a1b`); whether that is a defect depends on Windows' rule. | CLOSED | E-02, E-01: the block must be sorted by name, case-insensitively, in Unicode order and without regard to locale; a locale-aware sort does not meet that rule for names that differ in punctuation or digits, or under some locales. Neither page says what CreateProcess does with an unsorted block, so the consequence stays unverified. |
| U-02 | Which `fs.constants` open flags exist on Windows in Node 24.21.0; in particular O_NOFOLLOW and O_NONBLOCK? | The reader (`src/main/research-document.ts:175`) ORs both with `?? 0`; on Windows its open-time guards are absent if the constants are, and the report's Windows leg rests on that. | CLOSED | E-03: on Windows only O_APPEND, O_CREAT, O_EXCL, O_RDONLY, O_RDWR, O_TRUNC, O_WRONLY and the UV_FS_O_* flags exist; O_NOFOLLOW and O_NONBLOCK are undefined, so the reader opens without them and relies on its lstat and post-open dev/ino/nlink checks, as its comment states. |
| U-03 | Where does Node (and Electron's Node) take the default locale that `localeCompare` uses on Windows? | Decides whether the environment-block order can differ between users' machines (Linux observation: it follows LANG / LC_ALL). | KNOWN-UNKNOWN | E-04 shows only that official binaries carry full ICU, so `localeCompare` is locale-aware; the Node 24.21.0 intl page does not name the source of the default locale. Day-one step on Windows: `node -p "Intl.Collator().resolvedOptions().locale"` under two different Windows display or regional locales, and compare. |

## Questions for the human (maximum 3)

Intent questions only - things no document can answer. Facts never go here; they go in
the table above. If a question's answer is in public documentation, it is a research
task, not a question.

## Already decided

Locked decisions for this project. Do not revisit these without the human.

- Collection is keyless (`RESEARCH_KIT_TRANSPORT=http-keyless`) and spends nothing; owner pages are named directly, no search.
- No GitHub host is fetched: the break test ran unattended under a rule against reaching GitHub.
- This project does not decide whether spawnOwned's sort changes; that is the owner's decision in the break-test report.
