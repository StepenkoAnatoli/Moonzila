# Brief - How Playwright 1.63.0 can drive a packaged Electron 44.4.5 Windows app whose EnableNodeCliInspectArguments fuse is off

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

## Intent

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

## What we verified

| Claim | Source | Type |
|---|---|---|
| Playwright v1.63.0 server source: ElectronLauncher.launch prepends --inspect=0 and --remote-debugging-port=0 to the caller's args (for an executablePath launch it adds no -r loader, 'Only use our own loader for non-packaged apps'), deletes NODE_OPTIONS from the child env, then reads stderr for three lines: 'Debugger listening on ws://...' (Node inspector), 'DevTools listening on ws://...' (Chromium), and 'Waiting for the debugger to disconnect...'. It awaits the Node line FIRST and only then the DevTools line; the Node inspector WebSocket becomes the nodeConnection that ElectronApplication uses to evaluate require('electron') in main (backing evaluate, browserWindow, console events, page close via webContents, and app close via app.quit()). So with --inspect ignored no 'Debugger listening' line is printed and launch waits until the progress timeout, whether or not Chromium's DevTools port opened. [quote: const nodeMatch = await nodeMatchPromise;] | E-01 `raw.githubusercontent.com` (U-1, U-2, U-4) | P |
| Playwright's Electron API page (latest docs, read 2026-10-04) calls Electron support experimental (supported Electron v12.2.0+), and its Known issues state that if launch ends in timeouts one must ensure the nodeCliInspect fuse (FuseV1Options.EnableNodeCliInspectArguments) is not set to false - Playwright's own statement that _electron.launch needs that fuse on. electron.launch takes executablePath, args, env, and timeout (default 30000 ms; 0 disables). It also says native dialogs are not intercepted and must be replaced in main with electronApplication.evaluate(). [quote: If you are not able to launch Electron and it will end up in timeouts during launch, try the following:] | E-02 `playwright.dev` (U-1, U-2, U-3) | P |
| Electron fuses page (latest; the same page the 2026-10-03 electron-fuses corpus cites): nodeCliInspect, default Enabled, FuseV1Options.EnableNodeCliInspectArguments, toggles whether --inspect, --inspect-brk etc. are respected and, when disabled, stops SIGUSR1 from starting the main-process inspector; 'Most apps can safely disable this fuse.' The page's list of current fuses is runAsNode, cookieEncryption, nodeOptions, nodeCliInspect, embeddedAsarIntegrityValidation, onlyLoadAppFromAsar, loadBrowserProcessSpecificV8Snapshot, grantFileProtocolExtraPrivileges, wasmTrapHandlers - none governs Chromium's --remote-debugging-port or --remote-debugging-pipe, and the nodeCliInspect text names only the Node inspector flags. [quote: The `nodeCliInspect` fuse toggles whether the `--inspect`, `--inspect-brk`, etc. flags are respected] _(partial capture)_ | E-05 `electronjs.org` (U-2, U-4) | P |
| Electron command-line switches page (latest): --remote-debugging-port=port is listed among the Electron/Chromium CLI flags ('Enables remote debugging over HTTP on the specified port'), with an app.commandLine.appendSwitch('remote-debugging-port', '8315') example and no packaged-app restriction stated; --inspect, --inspect-brk, --inspect-port and --inspect-publish-uid are listed separately under Node.js Flags (the inspector URL goes to stderr by default). --remote-debugging-pipe is not on this page. So the doc separates the Chromium DevTools port from the Node inspector the fuse gates (E-05). [quote: Enables remote debugging over HTTP on the specified] _(partial capture)_ | E-06 `electronjs.org` (U-2, U-4) | P |
| Playwright v1.63.0 docs source: chromium.connectOverCDP(endpointURL) attaches Playwright to an existing browser instance over the Chrome DevTools Protocol (Chromium-based only, e.g. http://localhost:9222), returning a Browser whose default context is reached through browser.contexts(); the docs warn the connection is significantly lower fidelity than Playwright's own protocol, and that a browser launched without Playwright's curated arguments may break some Playwright functionality. [quote: This connection is significantly lower fidelity than the Playwright protocol connection via] | E-04 `raw.githubusercontent.com` (U-3) | P |
| Playwright's ElectronApplication class (latest docs) is what _electron.launch returns: evaluate and evaluateHandle run a function in the main Electron process (the parameter is require('electron')), firstWindow waits for the first window, close closes the Electron application, process returns the main process, plus browserWindow, context, windows and the close, console (main-process console) and window events. None of this is on the Browser object that connectOverCDP returns (E-04). [quote: Function to be evaluated in the main Electron process.] | E-03 `playwright.dev` (U-3) | P |
| Electron's automated-testing tutorial (latest) says Electron maintains no testing solution of its own and shows WebdriverIO (wdio electron service), Selenium with electron-chromedriver, and Playwright, which it says has experimental Electron support via Electron's CDP support and 'launches your app in development mode through the _electron.launch API' (its example logs isPackaged false). It gives no recipe for driving a packaged, fused build and does not mention fuses. [quote: Playwright launches your app in development mode through the] _(partial capture)_ | E-07 `electronjs.org` (U-3) | P |
| Electron security checklist (latest), item 19 'Check which fuses you can change': fuses like runAsNode and nodeCliInspect let the app behave differently when run from the command line with environment variables or CLI arguments, which can be used to execute commands on the device with the app's rights; it recommends flipping them. A text search of this capture finds no mention of remote debugging or --remote-debugging-port (the word 'debug' does not occur), so Electron's security guidance is silent on leaving the Chromium DevTools port reachable in a shipped build. [quote: can be used to execute commands on the device through your application.] _(partial capture)_ | E-08 `electronjs.org` (U-4) | P |

## Contradictions and how they were resolved

- **"Most apps can safely disable this fuse" (Electron, E-05) against "ensure the nodeCliInspect fuse is not set to false" (Playwright, E-02).** Not a factual contradiction: both are true for their audience. Electron speaks about the shipped app; Playwright speaks about its own launcher, whose source (E-01) shows why - it awaits the Node inspector's `Debugger listening on ws://...` line before anything else and builds its main-process connection on it. Trusted together: disabling the fuse is right for the shipped exe and fatal for `_electron.launch` on that exe.
- **Electron's testing tutorial says Playwright launches "in development mode" (E-07), while Playwright's API accepts any `executablePath` (E-02).** Not a conflict: E-01 shows an `executablePath` launch simply omits Playwright's `-r` loader ("Only use our own loader for non-packaged apps") and otherwise runs the same handshake, so packaged launch works exactly as long as the inspector answers. Neither page documents a packaged, fused route.
- **The lead's observed 15 s timeout against Playwright's 30 s default (E-02).** Not a conflict: the specs pass their own timeout. The default changes only how long the failure takes, not whether it happens (E-01).
- **Docs version.** The Playwright launch source and the BrowserType doc are pinned at tag v1.63.0 (E-01, E-04); the Playwright `Electron`/`ElectronApplication` pages and every Electron page are "latest" as read on 2026-10-04 (E-02, E-03, E-05..E-08). The four Electron captures are graded partial (two sibling sections of about 102 words outside the main content); every quoted passage is inside the capture, and the gate's citations check found all 8 quotes.

## Known unknowns

None is unknown to the point of blocking the choice below, but two runtime facts rest on documentation plus the lead's reproduction, not on a run of the fused Windows exe by this project. Check them on day one, before writing any CDP-attach code:

1. **The fused exe honours `--remote-debugging-port` from the command line.** Documented as a supported switch with no packaged-app exception and no fuse (E-06, E-05); not stated for packaged builds in so many words. Verify: start `release/win-unpacked/MoonAliza.exe --remote-debugging-port=9222 --user-data-dir=<tmp>` on the fused build and `curl http://127.0.0.1:9222/json/version`; expect a JSON body with `webSocketDebuggerUrl`.
2. **The fused exe prints `DevTools listening on ws://...` on stderr with `--remote-debugging-port=0`** (Playwright's launcher depends on that line, E-01, but no Electron page documents it). Verify: same launch with `=0`, read stderr. If it does not print on Windows, use a fixed free port and the `/json/version` endpoint instead.
3. `--remote-debugging-pipe` appears on no captured page (E-05, E-06); treat it as unsupported for this purpose rather than as an alternative.

## Options for the packaged e2e

Ranked strictly from the evidence above. The worktree fact the ranking depends on: in `e2e/*.spec.ts` (read 2026-10-04), `build`, `commands`, `context-recovery`, `folder-free-chat`, `github-reading`, `recovery`, `research-journeys` and `workbench` (8 of 10) call `app.evaluate(...)` in the main process (mostly to replace `dialog.showOpenDialog`/`showSaveDialog`, as Playwright's docs recommend, E-02); `local-models` and `research-collector` do not.

1. **A separate test-only package with only `enableNodeCliInspectArguments: true`, every other fuse identical to the shipped one.** The only route on which the existing specs run unchanged: `_electron.launch` needs the Node inspector (E-01, E-02), and nothing else in the handshake depends on the other four fuses. The shipped exe keeps the fuse off, as Electron's security checklist recommends (E-08). Cost: the tested binary differs from the shipped one by exactly one fuse bit (and its signature/integrity hash if signed); state that difference in the test report, and pair it with a fuse read of the shipped exe (`npx @electron/fuses read --app`, per the 2026-10-03 corpus) so the shipped bits are still asserted.
2. **Attach over CDP to the shipped, fused exe (`chromium.connectOverCDP`), as a supplement, not a replacement.** Possible on the documents: the fuse gates only `--inspect`/`--inspect-brk`/SIGUSR1 (E-05), and `--remote-debugging-port` is a separate Chromium switch no fuse governs (E-06, E-05). What it gives: a `Browser` whose `contexts()[0].pages()` are the renderer windows (E-04). What it loses: everything `ElectronApplication` builds on the Node inspector - main-process `evaluate`/`evaluateHandle`, `browserWindow`, main-process `console` events, `firstWindow`, and `close()` through `app.quit()` (E-01, E-03); the harness must spawn and kill the exe itself and wait for a page. Playwright calls this connection significantly lower fidelity and warns that a browser started without its curated arguments may break functionality (E-04). So it can run the two specs without `app.evaluate` and a smoke test of the real binary, not the dialog-mocking specs (unless the app grows a test-only dialog hook, which would be product code in the shipped build). Day-one checks 1 and 2 above come first.
3. **Keep `enableNodeCliInspectArguments` on in the shipped build.** Everything works unchanged (E-02), but it leaves `--inspect` and SIGUSR1 able to open a main-process debugger on the shipped exe, the exact surface Electron's security checklist item 19 says can be used to execute commands with the app's rights (E-08, E-05). Ranked below 1 and 2 because those reach the same test coverage without shipping that surface.
4. **Drop the packaged e2e step.** Removes the conflict and all packaged-build coverage; the dev-mode run (which Electron's own tutorial treats as Playwright's normal mode, E-07) would remain. Only if 1 is rejected and 2's coverage is judged too thin.

A point the choice should not overlook: turning the inspect fuse off does **not** remove a CDP surface from the shipped exe. `--remote-debugging-port` remains a supported, ungated switch (E-06, E-05), and Electron's security page says nothing about it (E-08, no occurrence of "debug" in the capture). Option 2 relies on that surface; options 1, 3 and 4 neither add nor remove it.

## Decision

**First build step.** Add a second electron-builder configuration (for example `electron-builder.e2e.yml` extending the main one) whose `electronFuses` block equals the shipped one except `enableNodeCliInspectArguments: true`, output to a separate directory (for example `release-e2e/`), and point `MOONALIZA_TEST_EXECUTABLE` / the specs' `packaged` path at that exe. Keep the shipped build's fuse read as a separate assertion. Then, optionally, add one CDP smoke spec against the shipped exe after day-one checks 1 and 2 pass.

**Out of scope.** Code signing of the test package; WebdriverIO or Selenium/ChromeDriver as replacement drivers (E-07 lists them, but nothing here establishes how they behave against the fused exe); changing which fuses the shipped build sets (decided in `docs/research/2026-10-03-electron-fuses`).

## Next steps

1. Review done (Contradictions, Known unknowns, Options and Decision answered above).
2. Hand this file to the builder (phase 2). Re-running `node "$HOME/.agents/research-kit/bin/brief.mjs"`
   redrafts this file while it is unedited; after any edit it refuses without `--force`,
   so your judgements are preserved.

<!-- research-kit:brief-draft body=d1ee6b444fe12e7c inputs=14051d8340274b1e gate=pass -->
