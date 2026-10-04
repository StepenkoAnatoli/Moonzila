# MAP - topic decomposition

## Topic

How Playwright 1.63.0 can drive a packaged Electron 44.4.5 Windows app whose EnableNodeCliInspectArguments fuse is off

## Subtopics

Statuses are blank on purpose: phase 0 gathers material, it does not judge. Mark each
row COVERED (cite the U-## rows that cover it), DISMISSED (reason required - dismissing
is fine, omitting is not), or GAP, and add topic-specific subtopics where the checklist
is not enough.

| ID | Subtopic | Why it matters | Status | Covered by |
|---|---|---|---|---|
| D-1 | Access model | Public pages, an official API, an auth-walled app, or a paywall - each is a different collection design | DISMISSED | The facts are public documentation pages and a public source file; the product collects nothing from these sources |
| D-2 | Auth and credentials | What accounts, keys, or logins the collection and the product need, and who holds them | DISMISSED | No account or key is involved in driving a local exe; the only credential-like surface is the debugging port itself, which is U-4 |
| D-3 | Rate limits and quotas | Caps every cadence in the design, and caps the research collection itself | DISMISSED | No API is called; launch timeout is a local wait, covered as runtime behaviour in U-1 |
| D-4 | ToS, licensing, legality of the intended use | A prohibition on automated collection, storage, or display ends the design for that source - and sometimes the project | DISMISSED | Playwright (Apache-2.0, E-01 header) and Electron are used as already licensed by the project; no data use question |
| D-5 | Data schema and its stability | How the data is shaped, and how often the source changes the shape without asking | COVERED | U-1, U-3 |
| D-6 | Freshness and staleness | How fast the data goes stale, and what staleness costs the product that depends on it | COVERED | U-1, U-2 |
| D-7 | Cost at expected volume | The economics at real usage, not the pricing page's first row - this decides viability | DISMISSED | A separate test package costs one extra package step in CI; no money is involved, and build time is not a design input here |
| D-8 | Runtime and platform limits | Where this actually executes - OS, runtime version, desktop app, cloud - and what those limits forbid | COVERED | U-1, U-2, U-4 |
| D-9 | Output obtainability | Does the data your stated "done" depends on exist, and can you actually get it? Load-bearing: a project whose output cannot be produced should die in phase 1, not phase 2 | COVERED | U-1, U-3 |
| T-1 | Driving the shipped fused binary itself (CDP attach) versus a test-only binary | Decides which of the three ways forward is real | COVERED | U-2, U-3, U-4 |

## Coverage notes (per dimension)

- D-5 (schema/stability): the API surface is Playwright's ElectronApplication (E-03) versus the Browser from connectOverCDP (E-04); Electron support is labelled experimental (E-02), so the launch handshake in the v1.63.0 source (E-01) is pinned to that tag rather than read from main.
- D-6 (freshness): the Playwright launch source is pinned at v1.63.0 (E-01, E-04); the Playwright and Electron docs pages are "latest" (E-02, E-03, E-05..E-08), read 2026-10-04 against Playwright 1.63.0 and Electron 44.4.5.
- D-8 (runtime): Playwright waits for the Node inspector line before the DevTools line (E-01); the fuse gates only the Node inspector flags and SIGUSR1 (E-05); --remote-debugging-port is a separate, ungated switch (E-06); the Windows-specific behaviour of the fused exe is a day-one check, recorded under U-4.
- D-9 (output obtainability): `_electron.launch` cannot drive a binary with the fuse off (E-01, E-02); a CDP attach can reach the windows but not the main process (E-03, E-04), which most MoonAliza specs use for dialog mocking.
- T-1: the three ways forward are ranked in BRIEF.md from U-1..U-4.
- D-1, D-2, D-3, D-4, D-7: dismissed with the reasons in the table.
- Phase-0 decompose was not run for real: its dry run planned 4 searches against a budget of 0 searches, so this map is the dry run's seeded checklist, classified by hand.

## Candidate material

Gathered 2026-10-04.

_No material gathered - run without `--dry-run`, or add URLs to `research/plan.json`._

