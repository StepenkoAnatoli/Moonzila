# Brief - Electron fuses and packaged-app code loading: whether a packaged Electron app honours NODE_OPTIONS, --require/-r, ELECTRON_RUN_AS_NODE and --inspect, how fuses (RunAsNode, EnableNodeOptionsEnvironmentVariable, EnableNodeCliInspectArguments, OnlyLoadAppFromAsar, EnableEmbeddedAsarIntegrityValidation) turn them off, and how electron-builder sets fuses

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

MoonAliza (Electron 44.4.5, electron-builder 26.15.3, `asar: true`, Windows NSIS target) is about to implement plan
Task 5, the research review, which adds main-process capability (packaging the reviewed corpus). Its e2e harness loads a
test-only preload, `e2e/fixtures/collector-network.cjs`, into main with Electron's `-r` in unpackaged development runs,
and the invariant "it can never be active in a packaged production build" was left unproven; `electron-builder.yml`
configures no fuses. Done means a builder knows, from Electron's and electron-builder's own pages: which code-loading
paths (NODE_OPTIONS, --require/-r, ELECTRON_RUN_AS_NODE, --inspect/--inspect-brk) a packaged Electron 44 app honours by
default; which fuse turns each off and the fuse defaults; how electron-builder sets fuses and whether the pinned version
supports it; and what Electron's security guidance says, so the packaged build's code-loading surface can be closed in
config and checked with a test.

## What we verified

| Claim | Source | Type |
|---|---|---|
| In packaged apps NODE_OPTIONS is explicitly disallowed except --max-http-header-size and --http-parser, so a NODE_OPTIONS=--require preload is not honoured by a packaged build even with the nodeOptions fuse at its default; with the fuse disabled NODE_OPTIONS and NODE_EXTRA_CA_CERTS are ignored altogether. ELECTRON_RUN_AS_NODE starts the process as a plain Node.js process that accepts Node.js CLI options as the node executable does (so -r/--require loads code there), and is ignored only when the runAsNode fuse is disabled. [quote: are explicitly disallowed in packaged apps, except for the following:] | E-02 `electronjs.org` (U-01, U-03) | P |
| Electron's fuses (the page links the fuse schema of v44.5.1, the same major line as the installed Electron 44.4.5) are bits flipped at package time before signing. Defaults: runAsNode Enabled (ELECTRON_RUN_AS_NODE honoured), nodeOptions Enabled (NODE_OPTIONS and NODE_EXTRA_CA_CERTS honoured), nodeCliInspect Enabled (--inspect, --inspect-brk and SIGUSR1 honoured), embeddedAsarIntegrityValidation Disabled, onlyLoadAppFromAsar Disabled, grantFileProtocolExtraPrivileges Enabled, cookieEncryption Disabled. Disabling runAsNode makes child_process.fork throw. Without onlyLoadAppFromAsar Electron looks for app.asar, then an app directory, then default_app.asar; with it, only app.asar, and with integrity validation it is impossible to load non-validated code. Fuses can be read with npx @electron/fuses read --app. [quote: By default, Electron will search for this code in the following order:] | E-01 `electronjs.org` (U-01, U-02, U-03, U-04) | P |
| electron-builder sets fuses with the configuration property electronFuses (type FuseOptionsV1: runAsNode, enableNodeOptionsEnvironmentVariable, enableNodeCliInspectArguments, enableEmbeddedAsarIntegrityValidation, onlyLoadAppFromAsar, enableCookieEncryption, grantFileProtocolExtraPrivileges, loadBrowserProcessSpecificV8Snapshot, wasmTrapHandlers, resetAdHocDarwinSignature), using @electron/fuses, flipping them after packaging and before signing; the afterPack hook with context.packager.addElectronFuses remains supported, and strictlyRequireAllFuses can force every fuse to be named. Windows ASAR integrity needs Electron >= 30 and asar.disableIntegrity not true. The page is the next (v27) docs. [quote: Now, you can instead set electron-builder configuration property] | E-04 `electron.build` (U-01, U-02, U-03, U-04, U-05, U-06) | P |
| Electron honours only a listed subset of Node.js flags: --inspect, --inspect-brk, --inspect-brk-node, --inspect-port, --inspect-publish-uid and diagnostic flags; --require/-r is not among them, and unsupported Node switches have no effect unless the process runs under ELECTRON_RUN_AS_NODE. --inspect opens a Chrome DevTools Protocol debugger on 127.0.0.1:9229 by default (and is gated by the nodeCliInspect fuse, E-01). [quote: Passing unsupported command line switches to Electron when it is not running in] | E-03 `electronjs.org` (U-02) | P |
| The electron-builder (app-builder-lib) changelog records the @electron/fuses integration (PR #8588) under 26.0.0 (first in 26.0.0-alpha.2), and lists releases up to 26.15.3, the version this repository pins, so electronFuses is available to MoonAliza without an upgrade. [quote: feat: adding integration with @electron/fuses] | E-05 `raw.githubusercontent.com` (U-06) | P |
| Electron's security checklist item 19 tells apps to check which fuses they can change, because runAsNode and nodeCliInspect let the app be driven from the command line by environment variables or CLI arguments to execute commands with the app's rights; it recommends @electron/fuses to flip them. [quote: can be used to execute commands on the device through your application.] | E-06 `electronjs.org` (U-07) | P |

## Contradictions and how they were resolved

- **NODE_OPTIONS and `--require` in a packaged app.** electron-builder's typedoc for `enableNodeOptionsEnvironmentVariable` says NODE_OPTIONS "allows injecting arbitrary Node.js runtime flags (e.g. `--require`)" (E-04). Electron's own environment-variables page says NODE_OPTIONS is explicitly disallowed in packaged apps except `--max-http-header-size` and `--http-parser` (E-02). Electron owns the runtime behaviour, so E-02 is trusted; E-04 describes the fuse in general, not the packaged-app restriction. Consequence: the open idea in `docs/specification/research-journeys.md` ("a `NODE_OPTIONS=--require` preload where the build's fuses allow it") would not work on a packaged build even with the fuse on. Disable the fuse anyway (defence in depth); day-one check below.
- **Docs version.** The electron-builder page is the "next (v27)" documentation, while the repository pins 26.15.3. The changelog (E-05) places the fuses integration in 26.0.0, so the option exists in the pinned line; the exact `FuseOptionsV1` keys in 26.15.3 are checked on day one (below). Electron's pages are "latest" and link the v44.5.1 fuse schema, the same major line as the pinned 44.4.5 (E-01).
- **`-r` and `default_app`.** No captured page documents `-r` as an Electron switch; E-03 lists the supported Node flags without it and says unsupported switches have no effect outside ELECTRON_RUN_AS_NODE. The spec's statement that `-r` works only through `default_app` is consistent with that but is not stated on these pages; it rests on the spec's own reading of Playwright and Electron.

## Known unknowns

None. Every blocking unknown was closed with cited evidence.

## Decision

**First build step.** Add an `electronFuses` block to `electron-builder.yml` (supported since electron-builder 26.0.0, E-04, E-05):

```yaml
electronFuses:
  runAsNode: false                            # ELECTRON_RUN_AS_NODE ignored (E-01, E-02)
  enableNodeOptionsEnvironmentVariable: false # NODE_OPTIONS and NODE_EXTRA_CA_CERTS ignored (E-01, E-02)
  enableNodeCliInspectArguments: false        # --inspect, --inspect-brk, SIGUSR1 ignored (E-01, E-03)
  onlyLoadAppFromAsar: true                   # no app/ directory or default_app.asar fallback (E-01)
  enableEmbeddedAsarIntegrityValidation: true # Windows needs Electron >= 30; asar integrity must not be disabled (E-04)
  grantFileProtocolExtraPrivileges: false     # only if the renderer is not served from file:// - check first (E-01)
```

Then add a packaged-build check that reads the fuses of `release/win-unpacked/MoonAliza.exe` with `npx @electron/fuses read --app <path>` (E-01, E-04) and fails unless the four code-loading fuses are as above. That check is the proof of the invariant "the e2e `-r` preload can never be active in a packaged production build": `-r` is not an Electron switch (E-03), NODE_OPTIONS is restricted in packaged apps and then ignored (E-02), run-as-node and the inspector are off, and only `app.asar` loads (E-01).

**Why these are safe for MoonAliza.** In the worktree read on 2026-10-03, main starts its engine with `utilityProcess.fork` (`src/main/engine.ts`), which the fuses page names as the replacement for `child_process.fork` (E-01), and the collector runs a separate Node executable (`nodePath` in `src/adapters/research-kit/adapter.ts`), not `process.execPath` under ELECTRON_RUN_AS_NODE; `src/tools/commands.ts` already forbids NODE_OPTIONS and ELECTRON_RUN_AS_NODE in spawned command environments. So disabling runAsNode and nodeOptions should not break product code. NODE_EXTRA_CA_CERTS is ignored by the main process once the nodeOptions fuse is off (E-01); the e2e harness passes it only to collector children, which are plain Node, so they are unaffected.

**Day-one verification (before merging).**
1. After `npm ci`, confirm `electronFuses` and its keys exist in the installed 26.15.3 typings (`node_modules/app-builder-lib/out/configuration.d.ts`, `FuseOptionsV1`).
2. Build `release/win-unpacked`, run `npx @electron/fuses read --app release/win-unpacked/MoonAliza.exe`, and confirm the values.
3. On the packaged exe, confirm that `ELECTRON_RUN_AS_NODE=1` does not make it run as Node, that `--inspect` opens no port 9229, and that `NODE_OPTIONS=--require=<file>` loads nothing.
4. Confirm whether the renderer loads from `file://` before setting `grantFileProtocolExtraPrivileges: false`.

**Out of scope.** Code signing (fuses are protected against being flipped back only by OS code-signing validation, E-01), the cookie-encryption and V8-snapshot fuses, and making the e2e journeys run against the packaged app. The last stays the open decision in `research-journeys.md`, and this research shows a NODE_OPTIONS preload is not a route to it.

## Next steps

1. Review done (Contradictions and Decision answered above).
2. Hand this file to the builder (phase 2). Re-running `node "$HOME/.agents/research-kit/bin/brief.mjs"`
   redrafts this file while it is unedited; after any edit it refuses without `--force`,
   so your judgements are preserved.

<!-- research-kit:brief-draft body=4f0bb9e0ac59229a inputs=59e870ab51036a0b gate=pass -->
