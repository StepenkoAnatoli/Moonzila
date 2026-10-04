# Research desktop journeys

This describes how the desktop tests (plan Task 7) run a real research job in the app: the real app, the real pinned Research Kit collector and the native helper, against the loopback fake GitHub. The collection behaviour itself is specified in [research collection](research-collection.md).

## The problem

The collector child gets a minimal environment (`collectorEnvironment` in `src/adapters/research-kit/collector.ts`): temporary folders, `SystemRoot` and the token. Nothing is inherited, so no proxy and no extra CA reach it, and no setting, IPC method or file in the data folder can add one. The protocol tests (`tests/research-collector-protocol.test.ts`) reach `tests/fixtures/fake-github.ts` by adding two variables to that environment: `HTTPS_PROXY` (a CONNECT proxy on 127.0.0.1 that tunnels only `api.github.com:443` and `artifacts.invalid:443`) and `NODE_EXTRA_CA_CERTS` (the test CA in `tests/fixtures/github-tls`). A desktop test has to do the same inside the running app.

## Designs considered

1. **A production switch** (an environment variable or command-line flag read by main, perhaps only when `app.isPackaged` is false). Rejected. The desktop tests also run against the packaged build (`MOONALIZA_TEST_EXECUTABLE` in `.github/workflows/windows.yml`), so a switch that worked there would be in the shipped app. Either way the shipped code would carry a path that adds a CA to a child that holds the GitHub token. (The chosen harness cannot cover the packaged run either; see below.)
2. **A separate test build** with the hook compiled in. Rejected: the packaged run would test a different `dist` from the one shipped, and it needs a second build in CI.
3. **A test-supplied Node in `installation.json`** (a wrapper that sets the variables). Rejected: `nodePath` must be an executable that `CreateProcessW` runs and whose hash the installation records; a wrapper executable would have to be built per platform, and the journeys would no longer run the user's kind of Node.
4. **Patching main from Playwright after launch** (`app.evaluate`, as `e2e/github-reading.spec.ts` replaces `fetch`). Rejected as the only mechanism: Playwright holds the `ready` event until it attaches, but main's startup continues as soon as it is released, and after a restart the adopted job's watch can launch before an `evaluate` lands. That watch would reach the real api.github.com with the test token.
5. **A test preload loaded with Electron's `-r`** (chosen). Electron's `default_app` runs a `-r` module in main before it loads the app, which is how Playwright adds its own loader to the unpackaged app. `e2e/fixtures/collector-network.cjs` is that module. **This works only for the unpackaged app.** A packaged executable such as `release/win-unpacked/Monnzila.exe` loads `resources/app.asar` and never runs `default_app`, so it ignores `-r`. Playwright also adds its loader only when no `executablePath` is given (`playwright-core/lib/coreBundle.js`, the `-r loader.js` unshift sits in the branch without `executablePath`). So the journeys do not run in the packaged `workflow_dispatch` run; see "Packaged runs" below.

## The chosen harness

- The spec launches the app with `-r e2e/fixtures/collector-network.cjs` and the environment variable `MOONALIZA_E2E_COLLECTOR_NETWORK`, a JSON object with exactly `HTTPS_PROXY` and `NODE_EXTRA_CA_CERTS`. The preload removes the variable from `process.env` before main runs, so the product never sees it.
- It refuses anything but `http://127.0.0.1:<port>` and an absolute CA path, and any other key.
- It wraps `spawn` on the shared `node:child_process` module (main's bundle calls `import_node_child_process.spawn` at call time, and in Electron `process.getBuiltinModule('node:child_process')` is the same object main requires). For a spawn of `MoonAlizaHost.exe` it rewrites the first stdin write, spawnOwned's protocol: a u32 timeout, then u32-length UTF-16LE fields for executable, command line, cwd and environment, then the guard list. Only when the command line runs `collect-remote.mjs` does it add the two variables to the environment, sorted as spawnOwned sorts. The validator, user commands and the guard list pass byte for byte.
- If the collector's environment already carries either variable, it refuses the launch (`E2E_NETWORK_ALREADY_SET`) and ends the helper's input, so no child runs. That would be the production regression to catch.
- It counts collector launches and rewrites on `globalThis.__monnzilaE2eCollectorNetwork`, so a journey can show every collector launch went through it. For each collector launch that ends it also records an outcome: the helper's exit code and, from the kit's last stdout line, only `status`, `clientRef` and `state` (never the raw output). The job's DTO does not expose why a `collecting` job is parked, and a kit or credentials park looks the same from outside (no failure, no further requests), so this is how a journey tells the import park apart. It also wraps main's own `fetch`: a request to any host but loopback is refused before it is sent, and only the host name is recorded in `refusedFetches`, so the verified import's GitHub run read can never carry the test token to the real `api.github.com`.

Why this does not weaken production:

- Nothing under `src/` reads the variable, the preload or the CA. The file is not in `dist/` and not in the installer (`electron-builder.yml` packs `dist/**`).
- Loading it needs control of Electron's command line and environment. Whoever has that can already run any code in main, which is how Playwright drives the app at all.
- TLS is never disabled. The test CA is trusted only by the collector child, only through `NODE_EXTRA_CA_CERTS`, and its private key was discarded when it was made (`tests/fixtures/github-tls/README.md`).
- The token reaches the fake only as the exact bearer header the real kit sends; the journeys assert every request carried it exactly and that no file under the data folder contains it.

The coupling to the helper protocol is deliberate and tested: `tests/research-journeys-network.test.ts` runs the preload against the real `spawnOwned` encoder (with the helper replaced by a recording child), so a protocol change turns that test red on any OS.

## Packaged runs

`e2e/research-journeys.spec.ts` skips its tests when `MOONALIZA_TEST_EXECUTABLE` is set. Run against a packaged executable, the preload would not load, the harness check would fail, and the journeys' collector would get no proxy and no CA, so it would send the test token to the real api.github.com. Every journey also fails closed: `launch()` reads `globalThis.__monnzilaE2eCollectorNetwork` straight after launch, before the journey saves the token or starts a job. If the preload is missing, `launch()` kills the app and throws `E2E_HARNESS_MISSING`. A restart uses the same command line, which its first launch already proved.

Covering the packaged app would need a mechanism that a packaged executable honours, such as a `NODE_OPTIONS=--require` preload where the build's fuses allow it. That is a decision about what the packaged run must prove, so it is left open and not built here.

## The journeys (`e2e/research-journeys.spec.ts`)

Each journey gets its own data folder with an `installation.json` naming the prepared pinned kit (`.build/research-kit-external/research-kit`) and the test runner's Node with its SHA-256, its own fake GitHub and a trusted project whose policy allows `public-technical` research. The collector is saved through `research.collector.save` and the job is started through `research.start`. The fake keeps the run `in_progress` until the journey changes it.

1. **Harness check (every OS).** The preload is loaded before the app and the variable is gone from main's environment.
2. **Start, restart mid-collection, park at import (Windows).** The job goes `queued -> collecting` with run id 1 after exactly one authenticated dispatch, whose `client_ref` is the job's. The watch reads the run through the proxy. The app quits and starts again while the run is in progress; the job is adopted, watched again, still `collecting`, and still has one dispatch. The pinned kit's own producer (`bin/artifact.mjs create` over `test/artifact-fixtures.mjs` `collectedProject`) then makes a package for the job's client ref, and the fake completes the run with it. The watch downloads it once. The verified import then reads the run from `api.github.com`; the harness refuses that read before it is sent (`refusedFetches` lists only `api.github.com`), so the import defers and the job parks as `import`: no request follows for 40 s (a transient outcome would relaunch within 30 s, an invalid package would fail the job), the job stays `collecting` without a failure, every collector launch was rewritten and has ended, the last one exited 0 with a `PASS` report for the job's client ref and a reviewable state (the only result `classifyWatch` turns into a package, which rules out the `kit` and `credentials` parks), and no file in the data folder holds the token.
3. **Cancel mid-collection (Windows).** With the watch running, `research.cancel` stops it and the job ends `cancelled` with its run id and no failure. No request follows for 15 s (the kit polls every 10 s) and there is still one dispatch.

## Verification

Exact-head Windows CI (`npm run test:e2e`, unpackaged; the packaged `workflow_dispatch` run skips this file) is the acceptance check for journeys 2 and 3: they need the native helper, because `spawnOwned` refuses other platforms (`WINDOWS_REQUIRED`) and project trust inspects the path through the helper.

What ran on Linux (Node 24.21.0, Electron 44.4.5, under `dbus-run-session -- xvfb-run -a`, with `MOONALIZA_E2E_ELECTRON_ARGS=--no-sandbox` because Electron runs as root there; Playwright's loader already adds `--password-store=basic`):

- `npx playwright test e2e/research-journeys.spec.ts`: the harness check passed; journeys 2 and 3 were skipped by their platform condition. Removing the preload's `delete process.env[...]` turned the harness check red. With `-r` removed from the launch and the platform skip removed, all three tests failed at launch with `E2E_HARNESS_MISSING`, before any token was saved.
- The packaged case was reproduced with a packaged-layout Electron: a copy of `node_modules/electron/dist` without `default_app.asar`, with the app in `resources/app`. Run as `MOONALIZA_TEST_EXECUTABLE`, the previous spec failed its harness check because the preload state was `null`. The current spec skips all three tests.
- `tests/research-journeys-network.test.ts` (4 tests) passed. Mutations each turned it red: not adding the variables, dropping the guard list, accepting an environment that already carries a variable, accepting a non-loopback proxy, not ending the helper's input on a refusal, comparing variable names case-sensitively (a lowercase `https_proxy`), and not recording a collector launch's outcome.
- Outside the committed tests, the journey's network steps were run against the real pinned kit without the app: a dispatch with `collectorEnvironment` plus the two variables classified as `dispatched` with run id 1, with one exact-token POST whose `inputs.client_ref` was the job's and one CONNECT to `api.github.com:443`; a package made by the kit's producer for an `mz-` client ref, served after an `in_progress` poll, classified as `package`.

Not run anywhere yet: journeys 2 and 3 themselves.

Observed on Linux while building this, not investigated: quitting the app before the renderer's first render (for example `app.close()` right after `firstWindow()`) fires `before-quit` twice and never reaches `will-quit`, so the process stays up. Waiting for the first render (`Your work starts here`) avoids it; every journey waits for it.

## Out of scope

- Journey "review to ready" (Task 5), and a journey that ends `collected`: that needs the fake to serve the run read (`GET /repos/<repo>/actions/runs/<id>`) and the importer's read routed to it, which is Task 7 work; until then journey 2 asserts the honest import park above.
- Real-network smoke tests against a real collector repository.
