# Brief - Facts the October 3 break test could not observe: what npm 11's allowScripts does with an uncovered install script, what esbuild's npm postinstall does and whether skipping it matters, and what engine-strict enforces

_Auto-drafted 2026-10-03 by `bin/brief.mjs` from the corpus. Sections marked **TODO**
require the reviewing agent's judgement; everything else is assembled from evidence already
in `research/`. While a **TODO** remains, this brief is **not reviewed** and the
handoff is **not approved** - a structurally valid corpus, a reviewed one, and an
approved handoff are three different states._

Reviewed by: agent

**This is the phase-1 to phase-2 handoff.** **Gate: PASS.** Every blocking unknown is closed with evidence, and every claim below
traces to a cached page in `research/raw/`.

Whoever you are - another agent, a different model, or a person - read this file
first. You should not need to re-research anything to start work. If something
here is not enough to build from, say which fact is missing rather than guessing
it: that is a phase-1 gap to close, not a phase-2 judgment call.

## Intent

The break test of 2026-10-03 (`docs/evidence/2026-10-03-break-test.md`) left two facts unverified and one fix explained only by observation. This project closes them from the owner's pages so the report's "Remaining risks" and the F1 commit rest on documentation rather than on inference: what npm 11 does with an install script that `package.json#allowScripts` does not name (ran, skipped, or asked), what esbuild's npm postinstall does and whether esbuild works without it, and what `engine-strict` refuses. Done means each unknown below is CLOSED with a quoted page, and the break-test report cites the evidence rows.

## What we verified

| Claim | Source | Type |
|---|---|---|
| The `npm install-scripts` documentation at the v11.19.0 tag, the npm bundled with the Node 24.21.0 the project pins: `allowScripts` in package.json records which dependencies may run `preinstall`, `install`, `postinstall` (and `prepare` for non-registry sources); an install silently skips the lifecycle scripts of any dependency without a matching entry and ends by listing the skipped packages; `approve` writes version-pinned entries, `deny` writes a `false` entry that survives `approve --all`, `ls` lists uncovered packages without writing, `prune` removes stale entries. This is the behaviour the break test observed as the "not yet covered by allowScripts" list after `npm ci`. [quote: Install commands silently skip lifecycle scripts for any dependency that does not have a matching entry in `allowScripts`, and end with a list of the packages whose scripts were skipped so you can review them here.] | E-08 `raw.githubusercontent.com` (U-01) | P |
| The npm 11 release line's changelog: the opt-in `allowScripts` install-script policy ("Phase 1") shipped in 11.16.0 (2026-05-27); 11.17.0 added the approval tooling and made prune, dedupe, uninstall, audit and link respect it; 11.18.0 (2026-06-29) namespaced the commands under `npm install-scripts` and closed enforcement gaps; 11.19.0 (2026-08-25) retitled the warning `install-scripts`. npm 10 (bundled with Node 22) has none of it, which matches the break test's Node 22 run, where `allowScripts` had no effect. [quote: Phase 1 of `allowScripts` opt-in install-script policy (#9360) (#9415)] | E-12 `raw.githubusercontent.com` (U-01, U-04) | P |
| esbuild's npm package gets its platform binary from an optional dependency chosen by npm, and its install script then only (a) checks that binary's version and (b) replaces the `node_modules/.bin/esbuild` JavaScript shim with the binary. With `--ignore-scripts` the binary still arrives and the CLI works through the shim at a small cost per launch; the package breaks only when `--ignore-scripts` and `--no-optional` are combined. [quote: npm install esbuild --ignore-scripts This means esbuild's install script doesn't run. However, the `esbuild` binary for the current platform should still be automatically selected and installed from esbuild's optional dependencies by npm.] | E-05 `esbuild.github.io` (U-02) | P |
| The install script's source confirms E-05 and adds the platform fact the break test needed: the shim-to-binary optimisation is skipped on Windows regardless, so on the Windows runner a skipped postinstall forgoes only the version check. [quote: This optimization does not work on Windows] | E-06 `raw.githubusercontent.com` (U-02) | P |
| The config definition of `engine-strict` in npm 11.19.0: default `false`; when `true`, npm refuses to install any package that declares itself incompatible with the current Node.js version, so the rule covers dependencies' `engines` as well as the root package's; `--force` overrides it. [quote: If set to true, then npm will stubbornly refuse to install (or even consider installing) any package that claims to not be compatible with the current Node.js version.] | E-10 `raw.githubusercontent.com` (U-03) | P |
| `npm ci` at v11.19.0 installs from an existing lockfile, fails if the lockfile and package.json disagree, removes an existing `node_modules` first and never writes package.json or the lock; the page's own advice for making a setting apply to every `npm ci` is a project `.npmrc` committed to the repository, which is how the break test's F1 fix applies `engine-strict`. [quote: An easy way to do this is to run, for example, `npm config set legacy-peer-deps=true --location=project` and commit the `.npmrc` file to your repo.] | E-11 `raw.githubusercontent.com` (U-03) | P |
| npm's main-branch changelog: npm 12.0.0 (2026-07-08) makes dependency install scripts blocked by default unless the root package's `allowScripts` allows them, with `npm install-scripts approve` to record approvals and `npm rebuild` to run newly approved scripts; the same release lists npm's supported Node as `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`. This branch's history stops at 11.12.1, so it does not describe the 11.x releases MoonAliza uses (E-12 does). [quote: Dependency lifecycle scripts are now blocked by default unless allowed by the root package's `allowScripts` policy.] | E-07 `raw.githubusercontent.com` (U-04) | P |

## Contradictions and how they were resolved

One, about versions. The `npm install-scripts` documentation at the v11.19.0 tag (E-08) says dependency install scripts "are blocked by default", while both changelogs (E-12, E-07) call the 11.x policy "opt-in" (11.16.0) and date the default-deny to npm 12.0.0. Read together: in npm 11 the policy is switched on by the presence of `allowScripts` in the root package.json, and from npm 12 it applies without it. The two agree on the mechanics that matter here (an uncovered script is skipped silently and listed at the end), and the break test observed exactly that under 11.19.0 with the field present. What was not observed or read: whether an npm 11 install **without** the field runs scripts; MoonAliza always carries the field, so that case does not affect it. The changelog is trusted for version boundaries, the documentation for mechanics.

One gap, not a contradiction: the package.json reference at v11.19.0 (E-09) does not document `allowScripts`; the field is documented only on the command's page (E-08). The rendered docs.npmjs.com pages (E-01 to E-04) were captured without a body because the site renders client-side; they are kept as the record of that attempt and are not cited.

## Known unknowns

None. Every blocking unknown was closed with cited evidence.

## Decision

Nothing is built from this corpus; it feeds the break-test report (`docs/evidence/2026-10-03-break-test.md`):

1. Remaining risk 2 ("allowScripts covers only better-sqlite3; npm 11 warns on every install") is re-stated from E-08, E-05 and E-06: the two uncovered scripts are skipped, not run; esbuild's binary comes from its optional dependency, so the Windows build is not at risk; the warning is the documented end-of-install list. The owner's decision is only whether to record `approve` or `deny` entries so the list disappears, and that stays theirs.
2. Finding F1's cause and fix are explained from E-10 and E-11: `engine-strict` refuses any package whose `engines` excludes the current Node, root or dependency, and a committed project `.npmrc` is npm's own documented way to make a setting apply to every `npm ci`.
3. The version facts (E-12, E-07) go into the report so a reader on npm 10 (Node 22) knows the field is inert there, which the `engine-strict` fix now refuses.

Out of scope: changing `allowScripts`, electron-builder or any dependency; those are the owner's decisions and the report says so.

## Next steps

1. Review the **TODO** sections above (Contradictions, Decision) before handing off.
2. Hand this file to the builder (phase 2). Re-running `node "/home/user/Research-Kit/research-kit/bin/brief.mjs"`
   redrafts this file while it is unedited; after any edit it refuses without `--force`,
   so your judgements are preserved.

<!-- research-kit:brief-draft body=343d1859cfd1d798 inputs=92ad74e625072b94 gate=pass -->
