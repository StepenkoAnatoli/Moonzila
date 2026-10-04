# Brief - Facts the 2026-10-04 break test could not observe on Linux: the Windows environment-block sort rule, Node's fs open flags on Windows, and where Node takes its default locale

_Auto-drafted 2026-10-04 by `bin/brief.mjs` from the corpus. Sections marked **TODO**
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

## The prior, registered before anything was collected

_Ledger seq 1, chained: neither this text nor its place before the evidence
can be changed now. Read it against the findings below - it may well be wrong, and a wrong
prior that was recorded in advance is worth more than a right one remembered afterwards._

> Expected: Microsoft's CreateProcessW page says the environment block must be sorted alphabetically by name, case-insensitive, in Unicode order without regard to locale, which a localeCompare sort does not guarantee; Node's fs docs say only a short list of open flags (not O_NOFOLLOW or O_NONBLOCK) exists on Windows; Node's intl docs say the default locale comes from the environment/ICU. Cannot know here: whether Windows actually misbehaves when the block is out of order, which only a Windows run can show.

## Intent

The break test of 2026-10-04 (`docs/evidence/2026-10-04-break-test.md`) ran on Linux; MoonAliza ships on Windows. Three statements in its report rest on how Windows or Node behave there, which no Linux probe can show: the order Windows requires of an environment block (spawnOwned and the e2e harness sort it with `localeCompare`), which `fs.constants` open flags exist on Windows (the reader's `O_NOFOLLOW` / `O_NONBLOCK` guards), and where Node takes the default locale that `localeCompare` uses. Done means each is CLOSED from the owner's page or KNOWN-UNKNOWN with the Windows step that would close it, and the report cites the rows.

## What we verified

| Claim | Source | Type |
|---|---|---|
| Microsoft's rule for a caller-built environment block: every string sorted by name, case-insensitively, in Unicode order and not by locale. MoonAliza's spawnOwned (src/tools/commands.ts:66) and the e2e harness sort with String.prototype.localeCompare, which is locale-aware (E-04), so the block they build is not guaranteed to be in the order this page requires. The page states the rule; it does not say what CreateProcess does with a block out of order. [quote: All strings in the environment block must be sorted alphabetically by name. The sort is case-insensitive, Unicode order, without regard to locale.] _(partial capture)_ | E-02 `learn.microsoft.com` (U-01) | P |
| CreateProcessW's lpEnvironment is a null-terminated block of name=value strings, and the CreateProcessW page itself states no ordering rule: the sort requirement is on the environment-variables page (E-02). It also says a block the caller supplies does not carry the per-drive current directories. [quote: An environment block consists of a null-terminated block of null-terminated strings.] _(partial capture)_ | E-01 `learn.microsoft.com` (U-01) | P |
| In Node.js 24.21.0, fs.constants on Windows carries only the open flags this sentence lists, so O_NOFOLLOW and O_NONBLOCK are undefined there and src/main/research-document.ts:175's `?? 0` opens the workspace document on Windows without either guard; the reader's dev/ino/nlink check after open is then the only defence against a swapped file on Windows, as its comment says. [quote: `O_TRUNC`, `O_WRONLY`, `UV_FS_O_FILEMAP`, `UV_FS_O_TEMPORARY`,] _(partial capture)_ | E-03 `nodejs.org` (U-02) | P |

## Contradictions and how they were resolved

No contradiction between the sources. One gap between the prior and the evidence: the prior expected Node's intl page to name the default locale's source; it does not (E-04 is a partial capture and the full page source has no such sentence), so U-03 stays KNOWN-UNKNOWN rather than being closed by assumption. A second gap the sources leave open on purpose: Microsoft states the sort rule (E-02) but not what CreateProcessW does with an unsorted block, so the break-test report records the localeCompare sort as an unverified risk, not a finding.

## Known unknowns

- **U-03** - Where does Node (and Electron's Node) take the default locale that `localeCompare` uses on Windows?
  - Day-one verification: E-04 shows only that official binaries carry full ICU, so `localeCompare` is locale-aware; the Node 24.21.0 intl page does not name the source of the default locale. Day-one step on Windows: `node -p "Intl.Collator().resolvedOptions().locale"` under two different Windows display or regional locales, and compare.

## Decision

Nothing is built from this corpus by the break test. For the owner: if the environment-block order is to match the platform rule, the change is to sort by an ordinal comparison of the upper-cased (or lower-cased) names instead of `localeCompare` in `src/tools/commands.ts:66` and, in the same commit, `e2e/fixtures/collector-network.cjs` line 123 (their orders must stay equal, `tests/research-journeys-network.test.ts` pins it), verified on Windows CI. Out of scope: the reader's Windows open flags (E-03 confirms the code comment; no change suggested).

## Next steps

1. Review the **TODO** sections above (Contradictions, Decision) before handing off.
2. Hand this file to the builder (phase 2). Re-running `node "$HOME/.agents/research-kit/bin/brief.mjs"`
   redrafts this file while it is unedited; after any edit it refuses without `--force`,
   so your judgements are preserved.

<!-- research-kit:brief-draft body=8252241024a96253 inputs=71ab1b7f41bb8a25 gate=pass -->
