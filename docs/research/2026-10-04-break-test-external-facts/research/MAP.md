# MAP - topic decomposition

## Topic

Facts the 2026-10-04 break test could not observe on Linux: the Windows environment-block sort rule, Node's fs open flags on Windows, and where Node takes its default locale

## Subtopics

Statuses are blank on purpose: phase 0 gathers material, it does not judge. Mark each
row COVERED (cite the U-## rows that cover it), DISMISSED (reason required - dismissing
is fine, omitting is not), or GAP, and add topic-specific subtopics where the checklist
is not enough.

| ID | Subtopic | Why it matters | Status | Covered by |
|---|---|---|---|---|
| D-1 | Access model | Public pages, an official API, an auth-walled app, or a paywall - each is a different collection design | COVERED | U-01, U-02, U-03 |
| D-2 | Auth and credentials | What accounts, keys, or logins the collection and the product need, and who holds them | DISMISSED | public documentation pages; no account or key is needed and nothing in MoonAliza authenticates here |
| D-3 | Rate limits and quotas | Caps every cadence in the design, and caps the research collection itself | DISMISSED | no API is called; four public pages fetched once |
| D-4 | ToS, licensing, legality of the intended use | A prohibition on automated collection, storage, or display ends the design for that source - and sometimes the project | DISMISSED | reading vendor documentation for the platform the app targets, which is published for that use |
| D-5 | Data schema and its stability | How the data is shaped, and how often the source changes the shape without asking | COVERED | U-02 |
| D-6 | Freshness and staleness | How fast the data goes stale, and what staleness costs the product that depends on it | COVERED | U-02, U-03 |
| D-7 | Cost at expected volume | The economics at real usage, not the pricing page's first row - this decides viability | DISMISSED | keyless; the collection spends nothing and the facts carry no price |
| D-8 | Runtime and platform limits | Where this actually executes - OS, runtime version, desktop app, cloud - and what those limits forbid | COVERED | U-01, U-02, U-03 |
| D-9 | Output obtainability | Does the data your stated "done" depends on exist, and can you actually get it? Load-bearing: a project whose output cannot be produced should die in phase 1, not phase 2 | COVERED | U-01, U-02, U-03 |
| S-1 | Windows environment-block order | Decides whether spawnOwned's localeCompare sort meets the platform rule | COVERED | U-01, U-03 |
| S-2 | Node fs open flags on Windows | Decides which of the reader's open-time guards exist on the shipped platform | COVERED | U-02 |

## Coverage notes (per dimension)

D-1, D-8, D-9, S-1, S-2: every fact sits on an owner page (learn.microsoft.com for Win32, nodejs.org for Node 24.21.0) named in `research/plan.json`. D-5, D-6: the Node pages are pinned to v24.21.0, the version in `.node-version`; U-03's source is not on the page fetched, so it stays a known unknown. D-2, D-3, D-4, D-7: dismissed as stated.

## Candidate material

Gathered 2026-10-04.

_No material gathered - run without `--dry-run`, or add URLs to `research/plan.json`._

