# MAP - topic decomposition

## Topic

Electron fuses and packaged-app code loading: whether a packaged Electron app honours NODE_OPTIONS, --require/-r, ELECTRON_RUN_AS_NODE and --inspect, how fuses (RunAsNode, EnableNodeOptionsEnvironmentVariable, EnableNodeCliInspectArguments, OnlyLoadAppFromAsar, EnableEmbeddedAsarIntegrityValidation) turn them off, and how electron-builder sets fuses

## Subtopics

Statuses are blank on purpose: phase 0 gathers material, it does not judge. Mark each
row COVERED (cite the U-## rows that cover it), DISMISSED (reason required - dismissing
is fine, omitting is not), or GAP, and add topic-specific subtopics where the checklist
is not enough.

| ID | Subtopic | Why it matters | Status | Covered by |
|---|---|---|---|---|
| D-1 | Access model | Public pages, an official API, an auth-walled app, or a paywall - each is a different collection design | DISMISSED | The facts are public documentation pages; the product collects nothing from these sources |
| D-2 | Auth and credentials | What accounts, keys, or logins the collection and the product need, and who holds them | DISMISSED | No account or key is involved; fuses rely on OS code signing to stay set, and MoonAliza signing is outside this topic (noted in the brief) |
| D-3 | Rate limits and quotas | Caps every cadence in the design, and caps the research collection itself | DISMISSED | No API is called by the product; fuses are a build-time setting |
| D-4 | ToS, licensing, legality of the intended use | A prohibition on automated collection, storage, or display ends the design for that source - and sometimes the project | DISMISSED | No data use or redistribution question; Electron and electron-builder are used as already licensed by the project |
| D-5 | Data schema and its stability | How the data is shaped, and how often the source changes the shape without asking | COVERED | U-04, U-06 |
| D-6 | Freshness and staleness | How fast the data goes stale, and what staleness costs the product that depends on it | COVERED | U-04, U-06 |
| D-7 | Cost at expected volume | The economics at real usage, not the pricing page's first row - this decides viability | DISMISSED | Fuses cost nothing at build or run time beyond a marginally slower asar read with integrity validation (E-01) |
| D-8 | Runtime and platform limits | Where this actually executes - OS, runtime version, desktop app, cloud - and what those limits forbid | COVERED | U-01, U-02, U-03, U-04 |
| D-9 | Output obtainability | Does the data your stated "done" depends on exist, and can you actually get it? Load-bearing: a project whose output cannot be produced should die in phase 1, not phase 2 | COVERED | U-05, U-06 |
| T-1 | Packaged-app code-loading surface (env vars, CLI switches, app search order) | The invariant the e2e `-r` preload rests on | COVERED | U-01, U-02, U-03, U-07 |

## Coverage notes (per dimension)

- D-5 / D-6: the fuse wire is versioned (V1) and the docs link the v44.5.1 schema, the same major line as the installed Electron 44.4.5; electronFuses has existed since electron-builder 26.0.0 (E-01, E-05).
- D-8: NODE_OPTIONS is restricted in packaged apps, `-r` is not a supported Electron switch, ELECTRON_RUN_AS_NODE and --inspect stay live until their fuses are off (E-01, E-02, E-03).
- D-9: the pinned electron-builder 26.15.3 can set every needed fuse from config (E-04, E-05).
- T-1: closed by U-01..U-03 and the security checklist item 19 (E-06).
- D-1, D-2, D-3, D-4, D-7: dismissed with the reasons in the table.

## Candidate material

Gathered 2026-10-03.

_No material gathered - run without `--dry-run`, or add URLs to `research/plan.json`._

