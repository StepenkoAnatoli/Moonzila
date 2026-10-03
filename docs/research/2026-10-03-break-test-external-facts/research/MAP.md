# MAP - topic decomposition

## Topic

Facts the October 3 break test could not observe: what npm 11's allowScripts does with an uncovered install script, what esbuild's npm postinstall does and whether skipping it matters, and what engine-strict enforces

## Subtopics

Statuses are blank on purpose: phase 0 gathers material, it does not judge. Mark each
row COVERED (cite the U-## rows that cover it), DISMISSED (reason required - dismissing
is fine, omitting is not), or GAP, and add topic-specific subtopics where the checklist
is not enough.

| ID | Subtopic | Why it matters | Status | Covered by |
|---|---|---|---|---|
| D-1 | Access model | Public pages, an official API, an auth-walled app, or a paywall - each is a different collection design | COVERED | U-01, U-02, U-03, U-04 |
| D-2 | Auth and credentials | What accounts, keys, or logins the collection and the product need, and who holds them | DISMISSED | public documentation pages and a public repository file; no account, key or login is needed to read them, and nothing in MoonAliza changes |
| D-3 | Rate limits and quotas | Caps every cadence in the design, and caps the research collection itself | DISMISSED | no API is called; the collection is seven public pages fetched once |
| D-4 | ToS, licensing, legality of the intended use | A prohibition on automated collection, storage, or display ends the design for that source - and sometimes the project | DISMISSED | reading the npm and esbuild documentation and the esbuild repository, which are published for exactly that use; the facts govern MoonAliza's own development tooling |
| D-5 | Data schema and its stability | How the data is shaped, and how often the source changes the shape without asking | COVERED | U-04 |
| D-6 | Freshness and staleness | How fast the data goes stale, and what staleness costs the product that depends on it | COVERED | U-04 |
| D-7 | Cost at expected volume | The economics at real usage, not the pricing page's first row - this decides viability | DISMISSED | keyless transport; the collection spends nothing, and the facts carry no price |
| D-8 | Runtime and platform limits | Where this actually executes - OS, runtime version, desktop app, cloud - and what those limits forbid | COVERED | U-01, U-03 |
| D-9 | Output obtainability | Does the data your stated "done" depends on exist, and can you actually get it? Load-bearing: a project whose output cannot be produced should die in phase 1, not phase 2 | COVERED | U-01, U-02, U-03 |
| S-1 | npm's install-script policy (`allowScripts`, `npm install-scripts`) | Decides whether esbuild's postinstall ran in MoonAliza's `npm ci` and what the warning on every install means | COVERED | U-01, U-04 |
| S-2 | esbuild's npm postinstall and the optional platform package | Decides whether a skipped postinstall can break the build on another platform | COVERED | U-02 |
| S-3 | npm `engine-strict` | Decides what the break test's F1 fix refuses and whether a dependency's engines field can refuse the declared Node | COVERED | U-03 |

## Coverage notes (per dimension)

D-1, D-9, S-1 to S-3: every fact is on a public owner page (docs.npmjs.com for npm, esbuild.github.io and the esbuild repository for esbuild), named directly in `research/plan.json`; no search is needed. D-5 and D-6: npm's documentation is versioned (`/cli/v11/`), and the policy under study is new in npm 11, so U-04 pins the version at which it exists. D-8: the behaviour differs between npm 10 (bundled with Node 22, where the break test observed no policy) and npm 11 (bundled with Node 24.21.0, observed as 11.19.0). D-2, D-3, D-4, D-7: dismissed as stated in the table; nothing here is metered, authenticated or restricted.

## Candidate material

Gathered 2026-10-03.

_No material gathered - run without `--dry-run`, or add URLs to `research/plan.json`._

