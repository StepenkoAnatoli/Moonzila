---
url: https://www.electron.build/docs/tutorials/adding-electron-fuses
retrieved: 2026-10-03
command: firecrawl scrape https://www.electron.build/docs/tutorials/adding-electron-fuses --only-main-content --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Adding Electron Fuses | electron-builder
---
[Skip to main content](https://www.electron.build/docs/tutorials/adding-electron-fuses/#__docusaurus_skipToContent_fallback)

You are reading the documentation for **next (v27)**, which has not been released yet. For the current stable release, see the [v26 documentation](https://www.electron.build/v26/).

On this page

note

Information below has been partially copied from integration with [@electron/fuses](https://github.com/electron/fuses) and [electron tutorial](https://raw.githubusercontent.com/electron/electron/refs/heads/main/docs/tutorial/fuses.md) for easier reading/access.

## What are fuses? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#what-are-fuses "Direct link to What are fuses?")

For a subset of Electron functionality it makes sense to disable certain features for an entire application. For example, 99% of apps don't make use of `ELECTRON_RUN_AS_NODE`, these applications want to be able to ship a binary that is incapable of using that feature. We also don't want Electron consumers building Electron from source as that is both a massive technical challenge and a significant cost in time and money.

Fuses are the solution to this problem, at a high level they are "magic bits" in the Electron binary that can be flipped when packaging your Electron app to enable / disable certain features / restrictions. Because they are flipped at package time before you code sign your app the OS becomes responsible for ensuring those bits aren't flipped back via OS level code signing validation (Gatekeeper / App Locker).

## How do I flip the fuses? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#how-do-i-flip-the-fuses "Direct link to How do I flip the fuses?")

Under-the-hood, electron-builder leverages the official [`@electron/fuses`](https://npmjs.com/package/@electron/fuses) module to make flipping these fuses easy. Previously, electron fuses could only be flipped within the `afterPack` hook (this is still a supported method). Now, you can instead set electron-builder configuration property `electronFuses: FuseOptionsV1` to activate electron-builder's integration.

### Example [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#example "Direct link to Example")

note

The true/false below are just an example, customize your configuration to your own requirements

```typescript
electronFuses: {

  runAsNode: false,

  enableCookieEncryption: true,

  enableNodeOptionsEnvironmentVariable: false,

  enableNodeCliInspectArguments: false,

  enableEmbeddedAsarIntegrityValidation: true,

  onlyLoadAppFromAsar: true,

  loadBrowserProcessSpecificV8Snapshot: false,

  grantFileProtocolExtraPrivileges: false

}
```

It is also still possible to continue to keep your current logic in the `afterPack` hook, so a convenience method has been exposed in the `PlatformPackager` for easy customization of the flags on your own. It directly accepts an `AfterPackContext` and a `FuseConfig` object of [type](https://github.com/electron/fuses/blob/main/src/config.ts).
This convenience method was added so that custom FuseConfigs could be provided, allowing usage of `strictlyRequireAllFuses` to monitor your fuses and stay up-to-date with fuses as they're released, and/or force override the version of @electron/fuses in electron-builder if there's an update you'd like to leverage.

afterPack.ts

```typescript
const { FuseConfig, FuseVersion, FuseV1Options } = require("@electron/fuses")

exports.default = function (context: AfterPackContext) {

  const fuses: FuseConfig = {

    version: FuseVersion.V1,

    strictlyRequireAllFuses: true,

    [FuseV1Options.RunAsNode]: false,

    ... // all other flags must be specified since `strictlyRequireAllFuses = true`

  }

  await context.packager.addElectronFuses(context, fuses)

}
```

## Validating Fuses [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#validating-fuses "Direct link to Validating Fuses")

You can validate the fuses have been flipped or check the fuse status of an arbitrary Electron app using the fuses CLI.

```bash
npx @electron/fuses read --app /Applications/Foo.app
```

## Typedoc [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#typedoc "Direct link to Typedoc")

# Interface: FuseOptionsV1

Feature flags ("fuses") baked into the Electron binary at build time.

All options map 1:1 to the flags documented by
[`@electron/fuses`](https://github.com/electron/fuses) and the upstream
[Electron fuses guide](https://www.electronjs.org/docs/latest/tutorial/fuses).

electron-builder flips fuses after packaging and **before** signing so that the final
code signature covers the modified binary. On Apple Silicon, the ad-hoc signature is
re-applied automatically after flipping fuses.

## Extends [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#extends "Direct link to Extends")

- `Partial`<`Record`<`Uncapitalize`<keyof _typeof_`FuseV1Options`>, `boolean`>>

## Properties [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#properties "Direct link to Properties")

### enableCookieEncryption? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#enablecookieencryption "Direct link to enableCookieEncryption?")

> `optional` **enableCookieEncryption?**: `boolean`

Controls whether the Chromium cookie store is encrypted using OS-level cryptography keys.

When enabled, cookies are stored encrypted on disk (the same mechanism Chrome uses).
**This is a one-way transition**: existing unencrypted cookies are re-encrypted on write, but
disabling the fuse afterwards will leave the cookie database unreadable.

Most production apps can safely enable this fuse.

#### See [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#see "Direct link to See")

https://github.com/electron/fuses

#### Overrides [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#overrides "Direct link to Overrides")

`Partial.enableCookieEncryption`

* * *

### enableEmbeddedAsarIntegrityValidation? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#enableembeddedasarintegrityvalidation "Direct link to enableEmbeddedAsarIntegrityValidation?")

> `optional` **enableEmbeddedAsarIntegrityValidation?**: `boolean`

Enables ASAR integrity validation — Electron verifies the embedded SHA-256 hash of
`app.asar` before loading it.

Platform support:

- macOS: Electron ≥ 16.0.0
- Windows: Electron ≥ 30.0.0

For this fuse to be meaningful, `asar.disableIntegrity` must **not** be
`true` (otherwise the hash is not embedded).

#### See [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#see-1 "Direct link to See")

https://www.electronjs.org/docs/latest/tutorial/asar-integrity

#### Overrides [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#overrides-1 "Direct link to Overrides")

`Partial.enableEmbeddedAsarIntegrityValidation`

* * *

### enableNodeCliInspectArguments? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#enablenodecliinspectarguments "Direct link to enableNodeCliInspectArguments?")

> `optional` **enableNodeCliInspectArguments?**: `boolean`

Controls whether the `--inspect`, `--inspect-brk`, and related Node.js debugger flags are
honoured.

When disabled, `SIGUSR1` no longer opens the V8 inspector in the main process either.
Most production apps can safely disable this fuse.

#### See [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#see-2 "Direct link to See")

https://github.com/electron/fuses

#### Overrides [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#overrides-2 "Direct link to Overrides")

`Partial.enableNodeCliInspectArguments`

* * *

### enableNodeOptionsEnvironmentVariable? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#enablenodeoptionsenvironmentvariable "Direct link to enableNodeOptionsEnvironmentVariable?")

> `optional` **enableNodeOptionsEnvironmentVariable?**: `boolean`

Controls whether the [`NODE_OPTIONS`](https://nodejs.org/api/cli.html#node_optionsoptions)
and `NODE_EXTRA_CA_CERTS` environment variables are respected.

`NODE_OPTIONS` allows injecting arbitrary Node.js runtime flags (e.g. `--require`) and is
rarely needed in production. Most apps can safely disable this fuse.

#### See [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#see-3 "Direct link to See")

https://github.com/electron/fuses

#### Overrides [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#overrides-3 "Direct link to Overrides")

`Partial.enableNodeOptionsEnvironmentVariable`

* * *

### grantFileProtocolExtraPrivileges? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#grantfileprotocolextraprivileges "Direct link to grantFileProtocolExtraPrivileges?")

> `optional` **grantFileProtocolExtraPrivileges?**: `boolean`

Controls whether pages loaded from the `file://` protocol receive elevated privileges
beyond what a standard web browser would grant.

These extra privileges include `fetch` to other `file://` URLs, service workers, and
universal frame access for child frames also on `file://`. This behaviour pre-dates modern
Electron security best practices.

Disable this fuse if your app does not load content directly from `file://` (i.e. you use
a [custom protocol](https://www.electronjs.org/docs/latest/tutorial/security#18-avoid-usage-of-the-file-protocol-and-prefer-usage-of-custom-protocols)).

#### See [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#see-4 "Direct link to See")

https://github.com/electron/fuses

#### Overrides [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#overrides-4 "Direct link to Overrides")

`Partial.grantFileProtocolExtraPrivileges`

* * *

### loadBrowserProcessSpecificV8Snapshot? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#loadbrowserprocessspecificv8snapshot "Direct link to loadBrowserProcessSpecificV8Snapshot?")

> `optional` **loadBrowserProcessSpecificV8Snapshot?**: `boolean`

When enabled, the browser (main) process uses a separate V8 snapshot file
(`browser_v8_context_snapshot.bin`) instead of the shared one.

This is only useful when you ship a custom V8 snapshot for the main process that differs
from the renderer snapshot. Standard apps do not need this.

#### See [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#see-5 "Direct link to See")

https://github.com/electron/fuses

#### Overrides [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#overrides-5 "Direct link to Overrides")

`Partial.loadBrowserProcessSpecificV8Snapshot`

* * *

### onlyLoadAppFromAsar? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#onlyloadappfromasar "Direct link to onlyLoadAppFromAsar?")

> `optional` **onlyLoadAppFromAsar?**: `boolean`

When enabled, Electron searches for the app exclusively in `app.asar`, skipping the `app`
directory and `default_app.asar` fallbacks.

Combined with `enableEmbeddedAsarIntegrityValidation`, this makes it impossible to side-load
unverified code by replacing `app.asar` with an unarchived `app/` directory.

#### See [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#see-6 "Direct link to See")

https://github.com/electron/fuses

#### Overrides [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#overrides-6 "Direct link to Overrides")

`Partial.onlyLoadAppFromAsar`

* * *

### resetAdHocDarwinSignature? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#resetadhocdarwinsignature "Direct link to resetAdHocDarwinSignature?")

> `optional` **resetAdHocDarwinSignature?**: `boolean`

Re-applies the ad-hoc codesignature on macOS after fuses are flipped.

electron-builder already re-signs the app after flipping fuses, so this flag is
generally not needed and exists only as a compatibility shim for edge cases.

#### See [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#see-7 "Direct link to See")

https://github.com/electron/fuses?tab=readme-ov-file#apple-silicon

* * *

### runAsNode? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#runasnode "Direct link to runAsNode?")

> `optional` **runAsNode?**: `boolean`

Controls whether the `ELECTRON_RUN_AS_NODE` environment variable is respected.

When `true` (the Electron default), setting `ELECTRON_RUN_AS_NODE=1` in the environment
makes Electron behave like a plain Node.js process, bypassing the app entirely. Disable
this fuse in production apps to prevent that escape path.

**Note:** Disabling this fuse also breaks `process.fork()` in the main process because
it relies on `ELECTRON_RUN_AS_NODE` internally. Use
[Utility Processes](https://www.electronjs.org/docs/latest/api/utility-process) as a
replacement.

#### See [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#see-8 "Direct link to See")

https://github.com/electron/fuses

#### Overrides [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#overrides-7 "Direct link to Overrides")

`Partial.runAsNode`

* * *

### wasmTrapHandlers? [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#wasmtraphandlers "Direct link to wasmTrapHandlers?")

> `optional` **wasmTrapHandlers?**: `boolean`

Enables V8 signal-based trap handlers for out-of-bounds WebAssembly memory accesses.

When enabled, Electron uses OS signals (e.g. `SIGSEGV` on Linux/macOS) to catch Wasm
OOB accesses at the hardware level rather than inserting explicit bounds checks in JIT'd
code. This improves Wasm performance and is enabled by default in Electron.

Disable only if the host environment restricts signal handlers (e.g. certain sandboxing
configurations) and you observe crashes in Wasm-heavy workloads.

#### See [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#see-9 "Direct link to See")

https://github.com/electron/fuses

#### Overrides [​](https://www.electron.build/docs/tutorials/adding-electron-fuses/\#overrides-8 "Direct link to Overrides")

`Partial.wasmTrapHandlers`

- [What are fuses?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#what-are-fuses)
- [How do I flip the fuses?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#how-do-i-flip-the-fuses)
  - [Example](https://www.electron.build/docs/tutorials/adding-electron-fuses/#example)
- [Validating Fuses](https://www.electron.build/docs/tutorials/adding-electron-fuses/#validating-fuses)
- [Typedoc](https://www.electron.build/docs/tutorials/adding-electron-fuses/#typedoc)
- [Extends](https://www.electron.build/docs/tutorials/adding-electron-fuses/#extends)
- [Properties](https://www.electron.build/docs/tutorials/adding-electron-fuses/#properties)
  - [enableCookieEncryption?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#enablecookieencryption)
  - [enableEmbeddedAsarIntegrityValidation?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#enableembeddedasarintegrityvalidation)
  - [enableNodeCliInspectArguments?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#enablenodecliinspectarguments)
  - [enableNodeOptionsEnvironmentVariable?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#enablenodeoptionsenvironmentvariable)
  - [grantFileProtocolExtraPrivileges?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#grantfileprotocolextraprivileges)
  - [loadBrowserProcessSpecificV8Snapshot?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#loadbrowserprocessspecificv8snapshot)
  - [onlyLoadAppFromAsar?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#onlyloadappfromasar)
  - [resetAdHocDarwinSignature?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#resetadhocdarwinsignature)
  - [runAsNode?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#runasnode)
  - [wasmTrapHandlers?](https://www.electron.build/docs/tutorials/adding-electron-fuses/#wasmtraphandlers)
