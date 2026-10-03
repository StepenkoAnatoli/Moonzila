---
url: https://www.electronjs.org/docs/latest/tutorial/fuses
retrieved: 2026-10-03
command: firecrawl scrape https://www.electronjs.org/docs/latest/tutorial/fuses --only-main-content --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Electron Fuses | Electron
---
[Skip to main content](https://www.electronjs.org/docs/latest/tutorial/fuses#__docusaurus_skipToContent_fallback)

On this page

> Package time feature toggles

## What are fuses? [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#what-are-fuses "Direct link to What are fuses?")

From a security perspective, it makes sense to disable certain unused Electron features
that are powerful but may make your app's security posture weaker. For example, any app that doesn't
use the `ELECTRON_RUN_AS_NODE` environment variable would want to disable the feature to prevent a
subset of "living off the land" attacks.

We also don't want Electron consumers forking to achieve this goal, as building from source and
maintaining a fork is a massive technical challenge and costs a lot of time and money.

Fuses are the solution to this problem. At a high level, they are "magic bits" in the Electron binary
that can be flipped when packaging your Electron app to enable or disable certain features/restrictions.

Because they are flipped at package time before you code sign your app, the OS becomes responsible
for ensuring those bits aren't flipped back via OS-level code signing validation
(e.g. [Gatekeeper](https://support.apple.com/en-ca/guide/security/sec5599b66df/web) on macOS or
[AppLocker](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/applocker-overview)
on Windows).

## Current fuses [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#current-fuses "Direct link to Current fuses")

### `runAsNode` [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#runasnode "Direct link to runasnode")

**Default:** Enabled

**@electron/fuses:**`FuseV1Options.RunAsNode`

The `runAsNode` fuse toggles whether the [`ELECTRON_RUN_AS_NODE`](https://www.electronjs.org/docs/latest/api/environment-variables)
environment variable is respected or not. With this fuse disabled, [`child_process.fork`](https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options) throws,
as it depends on this environment variable to function. Instead, we recommend that you
use [Utility Processes](https://www.electronjs.org/docs/latest/api/utility-process), which work for many use cases where you need a
standalone Node.js process (e.g. a SQLite server process).

### `cookieEncryption` [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#cookieencryption "Direct link to cookieencryption")

**Default:** Disabled

**@electron/fuses:**`FuseV1Options.EnableCookieEncryption`

The `cookieEncryption` fuse toggles whether the cookie store on disk is encrypted using OS level
cryptography keys. By default, the SQLite database that Chromium uses to store cookies stores the
values in plaintext. If you wish to ensure your app's cookies are encrypted in the same way Chromium
does, then you should enable this fuse. Please note it is a one-way transition—if you enable this
fuse, existing unencrypted cookies will be encrypted-on-write, but subsequently disabling the fuse
later will make your cookie store corrupt and useless. Most apps can safely enable this fuse.

info

On macOS, this fuse relies on the same OS-level access to the Keychain as
[`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage), so your app should be
[code signed](https://www.electronjs.org/docs/latest/tutorial/code-signing#macos-apis-that-require-code-signing) for it to work correctly.

### `nodeOptions` [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#nodeoptions "Direct link to nodeoptions")

**Default:** Enabled

**@electron/fuses:**`FuseV1Options.EnableNodeOptionsEnvironmentVariable`

The `nodeOptions` fuse toggles whether the [`NODE_OPTIONS`](https://nodejs.org/api/cli.html#node_optionsoptions)
and [`NODE_EXTRA_CA_CERTS`](https://github.com/nodejs/node/blob/main/doc/api/cli.md#node_extra_ca_certsfile)
environment variables are respected. The `NODE_OPTIONS` environment variable can be used to pass all
kinds of custom options to the Node.js runtime and isn't typically used by apps in production.
Most apps can safely disable this fuse.

### `nodeCliInspect` [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#nodecliinspect "Direct link to nodecliinspect")

**Default:** Enabled

**@electron/fuses:**`FuseV1Options.EnableNodeCliInspectArguments`

The `nodeCliInspect` fuse toggles whether the `--inspect`, `--inspect-brk`, etc. flags are respected
or not. When disabled, it also ensures that `SIGUSR1` signal does not initialize the main process
inspector. Most apps can safely disable this fuse.

### `embeddedAsarIntegrityValidation` [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#embeddedasarintegrityvalidation "Direct link to embeddedasarintegrityvalidation")

**Default:** Disabled

**@electron/fuses:**`FuseV1Options.EnableEmbeddedAsarIntegrityValidation`

The `embeddedAsarIntegrityValidation` fuse toggles a feature on macOS and Windows that validates the
content of the `app.asar` file when it is loaded. This feature is designed to have a minimal
performance impact but may marginally slow down file reads from inside the `app.asar` archive.
Most apps can safely enable this fuse.

For more information on how to use ASAR integrity validation, please read the [Asar Integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity) documentation.

### `onlyLoadAppFromAsar` [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#onlyloadappfromasar "Direct link to onlyloadappfromasar")

**Default:** Disabled

**@electron/fuses:**`FuseV1Options.OnlyLoadAppFromAsar`

The `onlyLoadAppFromAsar` fuse changes the search system that Electron uses to locate your app code.
By default, Electron will search for this code in the following order:

1. `app.asar`
2. `app`
3. `default_app.asar`

When this fuse is enabled, Electron will _only_ search for `app.asar`. When combined with the [`embeddedAsarIntegrityValidation`](https://www.electronjs.org/docs/latest/tutorial/fuses#embeddedasarintegrityvalidation) fuse, this fuse ensures that
it is impossible to load non-validated code.

### `loadBrowserProcessSpecificV8Snapshot` [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#loadbrowserprocessspecificv8snapshot "Direct link to loadbrowserprocessspecificv8snapshot")

**Default:** Disabled

**@electron/fuses:**`FuseV1Options.LoadBrowserProcessSpecificV8Snapshot`

V8 snapshots can be useful to improve app startup performance. V8 lets you take snapshots of
initialized heaps and then load them back in to avoid the cost of initializing the heap.

The `loadBrowserProcessSpecificV8Snapshot` fuse changes which V8 snapshot file is used for the browser
process. By default, Electron's processes will all use the same V8 snapshot file. When this fuse is
enabled, the main process uses the file called `browser_v8_context_snapshot.bin` for its V8 snapshot.
Other processes will use the V8 snapshot file that they normally do.

Using separate snapshots for renderer processes and the main process can improve security, especially
to make sure that the renderer doesn't use a snapshot with `nodeIntegration` enabled.
See [electron/electron#35170](https://github.com/electron/electron/issues/35170) for details.

When the main process runs on a custom V8 snapshot -- this fuse, or a `v8_context_snapshot.bin`
replaced with one generated by `electron-mksnapshot` \-\- Electron bootstraps the main process's
Node.js environment from source instead of from its embedded Node.js startup snapshot, so that
the objects in the custom snapshot are available to the main process. This costs part of the
main-process startup time the embedded snapshot otherwise saves.

### `grantFileProtocolExtraPrivileges` [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#grantfileprotocolextraprivileges "Direct link to grantfileprotocolextraprivileges")

**Default:** Enabled

**@electron/fuses:**`FuseV1Options.GrantFileProtocolExtraPrivileges`

The `grantFileProtocolExtraPrivileges` fuse changes whether pages loaded from the `file://` protocol
are given privileges beyond what they would receive in a traditional web browser. This behavior was
core to Electron apps in original versions of Electron, but is no longer required as apps should be
[serving local files from custom protocols](https://www.electronjs.org/docs/latest/tutorial/security#18-avoid-usage-of-the-file-protocol-and-prefer-usage-of-custom-protocols) now instead.

If you aren't serving pages from `file://`, you should disable this fuse.

The extra privileges granted to the `file://` protocol by this fuse are incompletely documented below:

- `file://` protocol pages can use `fetch` to load other assets over `file://`
- `file://` protocol pages can use service workers
- `file://` protocol pages have universal access granted to child frames also running on `file://`
protocols regardless of sandbox settings

### `wasmTrapHandlers` [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#wasmtraphandlers "Direct link to wasmtraphandlers")

**Default:** Enabled

**@electron/fuses:**`FuseV1Options.WasmTrapHandlers`

The `wasmTrapHandlers` fuse controls whether V8 will use signal handlers to trap Out of Bounds memory
access from WebAssembly. The feature works by surrounding the WebAssembly memory with large guard regions
and then installing a signal handler that traps attempt to access memory in the guard region. The feature
is only supported on the following 64-bit systems:

- Linux, macOS, Windows - x86\_64
- Linux, macOS - aarch64

```text
| Guard Pages | WASM heap | Guard Pages |

|-----8GB-----|           |-----8GB-----|
```

When the fuse is disabled V8 will use explicit bound checks in the generated WebAssembly code to ensure
memory safety. However, this method has some downsides

- The compiler generates extra nodes for each memory reference, leading to longer compile times due to the
additional processing time needed for these nodes.
- In turn, these extra nodes lead to lots of extra code being generated, making WebAssembly modules bigger
than they ideally should be.
- This extra code, particularly the compare and branch before every memory reference,
incurs a significant runtime cost.

## How do I flip fuses? [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#how-do-i-flip-fuses "Direct link to How do I flip fuses?")

### The easy way [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#the-easy-way "Direct link to The easy way")

[`@electron/fuses`](https://npmjs.com/package/@electron/fuses) is a JavaScript utility designed to make flipping these fuses easy. Check out the README of that module for more details on usage and potential error cases.

```js
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

flipFuses(

  // Path to electron

  require('electron'),

  // Fuses to flip

  {

    version: FuseVersion.V1,

    [FuseV1Options.RunAsNode]: false

  }

)
```

You can validate the fuses that have been flipped or check the fuse status of an arbitrary Electron
app using the `@electron/fuses` CLI.

```bash
npx @electron/fuses read --app /Applications/Foo.app
```

note

If you are using Electron Forge to distribute your application, you can flip fuses using
[`@electron-forge/plugin-fuses`](https://www.electronforge.io/config/plugins/fuses),
which comes pre-installed with all templates.

### The hard way [​](https://www.electronjs.org/docs/latest/tutorial/fuses\#the-hard-way "Direct link to The hard way")

info

Glossary:

- **Fuse Wire**: A sequence of bytes in the Electron binary used to control the fuses
- **Sentinel**: A static known sequence of bytes you can use to locate the fuse wire
- **Fuse Schema**: The format/allowed values for the fuse wire

Manually flipping fuses requires editing the Electron binary and modifying the fuse wire to be the
sequence of bytes that represent the state of the fuses you want.

Somewhere in the Electron binary, there will be a sequence of bytes that look like this:

```text
| ...binary | sentinel_bytes | fuse_version | fuse_wire_length | fuse_wire | ...binary |
```

- `sentinel_bytes` is always this exact string: `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX`
- `fuse_version` is a single byte whose unsigned integer value represents the version of the fuse schema
- `fuse_wire_length` is a single byte whose unsigned integer value represents the number of fuses in the following fuse wire
- `fuse_wire`is a sequence of N bytes, each byte represents a single fuse and its state.
  - "0" (0x30) indicates the fuse is disabled
  - "1" (0x31) indicates the fuse is enabled
  - "r" (0x72) indicates the fuse has been removed and changing the byte to either 1 or 0 will have no effect.

To flip a fuse, you find its position in the fuse wire and change it to "0" or "1" depending on the state you'd like.

You can view the current schema [here](https://github.com/electron/electron/blob/v44.5.1/build/fuses/fuses.json5).

- [What are fuses?](https://www.electronjs.org/docs/latest/tutorial/fuses#what-are-fuses)
- [Current fuses](https://www.electronjs.org/docs/latest/tutorial/fuses#current-fuses)
  - [`runAsNode`](https://www.electronjs.org/docs/latest/tutorial/fuses#runasnode)
  - [`cookieEncryption`](https://www.electronjs.org/docs/latest/tutorial/fuses#cookieencryption)
  - [`nodeOptions`](https://www.electronjs.org/docs/latest/tutorial/fuses#nodeoptions)
  - [`nodeCliInspect`](https://www.electronjs.org/docs/latest/tutorial/fuses#nodecliinspect)
  - [`embeddedAsarIntegrityValidation`](https://www.electronjs.org/docs/latest/tutorial/fuses#embeddedasarintegrityvalidation)
  - [`onlyLoadAppFromAsar`](https://www.electronjs.org/docs/latest/tutorial/fuses#onlyloadappfromasar)
  - [`loadBrowserProcessSpecificV8Snapshot`](https://www.electronjs.org/docs/latest/tutorial/fuses#loadbrowserprocessspecificv8snapshot)
  - [`grantFileProtocolExtraPrivileges`](https://www.electronjs.org/docs/latest/tutorial/fuses#grantfileprotocolextraprivileges)
  - [`wasmTrapHandlers`](https://www.electronjs.org/docs/latest/tutorial/fuses#wasmtraphandlers)
- [How do I flip fuses?](https://www.electronjs.org/docs/latest/tutorial/fuses#how-do-i-flip-fuses)
  - [The easy way](https://www.electronjs.org/docs/latest/tutorial/fuses#the-easy-way)
  - [The hard way](https://www.electronjs.org/docs/latest/tutorial/fuses#the-hard-way)
