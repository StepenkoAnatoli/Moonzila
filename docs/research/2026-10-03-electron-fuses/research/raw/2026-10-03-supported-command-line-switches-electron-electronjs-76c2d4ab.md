---
url: https://www.electronjs.org/docs/latest/api/command-line-switches
retrieved: 2026-10-03
command: firecrawl scrape https://www.electronjs.org/docs/latest/api/command-line-switches --only-main-content --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Supported Command Line Switches | Electron
---
[Skip to main content](https://www.electronjs.org/docs/latest/api/command-line-switches#__docusaurus_skipToContent_fallback)

On this page

> Command line switches supported by Electron.

You can use [app.commandLine.appendSwitch](https://www.electronjs.org/docs/latest/api/command-line#commandlineappendswitchswitch-value) to append them in
your app's main script before the [ready](https://www.electronjs.org/docs/latest/api/app#event-ready) event of the [app](https://www.electronjs.org/docs/latest/api/app) module
is emitted:

```js
const { app } = require('electron')

app.commandLine.appendSwitch('remote-debugging-port', '8315')

app.commandLine.appendSwitch('host-rules', 'MAP * 127.0.0.1')

app.whenReady().then(() => {

  // Your code here

})
```

## Electron CLI Flags [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#electron-cli-flags "Direct link to Electron CLI Flags")

### --auth-server-whitelist=`url` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--auth-server-whitelisturl "Direct link to --auth-server-whitelisturl")

A comma-separated list of servers for which integrated authentication is enabled.

For example:

```sh
--auth-server-whitelist='*example.com, *foobar.com, *baz'
```

then any `url` ending with `example.com`, `foobar.com`, `baz` will be considered
for integrated authentication. Without `*` prefix the URL has to match exactly.

### --auth-negotiate-delegate-whitelist=`url` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--auth-negotiate-delegate-whitelisturl "Direct link to --auth-negotiate-delegate-whitelisturl")

A comma-separated list of servers for which delegation of user credentials is required.
Without `*` prefix the URL has to match exactly.

### --disable-ntlm-v2 [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--disable-ntlm-v2 "Direct link to --disable-ntlm-v2")

Disables NTLM v2 for POSIX platforms, no effect elsewhere.

### --disable-http-cache [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--disable-http-cache "Direct link to --disable-http-cache")

Disables the disk cache for HTTP requests.

### --disable-http2 [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--disable-http2 "Direct link to --disable-http2")

Disable HTTP/2 and SPDY/3.1 protocols.

### --disable-geolocation _macOS_ [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--disable-geolocation-macos "Direct link to --disable-geolocation-macos")

Disables the Geolocation API. Permission requests for geolocation will be denied internally regardless of the decision made by a handler set via `session.setPermissionRequestHandler`. This functionality is currently implemented only for macOS. Has no effect on other platforms.

### --disable-renderer-backgrounding [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--disable-renderer-backgrounding "Direct link to --disable-renderer-backgrounding")

Prevents Chromium from lowering the priority of invisible pages' renderer
processes.

This flag is global to all renderer processes, if you only want to disable
throttling in one window, you can take the hack of
[playing silent audio](https://github.com/atom/atom/pull/9485/files).

### --disk-cache-size=`size` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--disk-cache-sizesize "Direct link to --disk-cache-sizesize")

Forces the maximum disk space to be used by the disk cache, in bytes.

### --enable-logging\[=file\] [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--enable-loggingfile "Direct link to --enable-logging[=file]")

Prints Chromium's logging to stderr (or a log file).

The `ELECTRON_ENABLE_LOGGING` environment variable has the same effect as
passing `--enable-logging`.

Passing `--enable-logging` will result in logs being printed on stderr.
Passing `--enable-logging=file` will result in logs being saved to the file
specified by `--log-file=...`, or to `electron_debug.log` in the user-data
directory if `--log-file` is not specified.

note

On Windows, logs from child processes cannot be sent to stderr.
Logging to a file is the most reliable way to collect logs on Windows.

See also `--log-file`, `--log-level`, `--v`, and `--vmodule`.

### --force-fieldtrials=`trials` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--force-fieldtrialstrials "Direct link to --force-fieldtrialstrials")

Field trials to be forcefully enabled or disabled.

For example: `WebRTC-Audio-Red-For-Opus/Enabled/`

### --host-rules=`rules` _Deprecated_ [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--host-rulesrules-deprecated "Direct link to --host-rulesrules-deprecated")

A comma-separated list of `rules` that control how hostnames are mapped.

For example:

- `MAP * 127.0.0.1` Forces all hostnames to be mapped to 127.0.0.1
- `MAP *.google.com proxy` Forces all google.com subdomains to be resolved to
"proxy".
- `MAP test.com [::1]:77` Forces "test.com" to resolve to IPv6 loopback. Will
also force the port of the resulting socket address to be 77.
- `MAP * baz, EXCLUDE www.google.com` Remaps everything to "baz", except for
" [www.google.com](http://www.google.com/)".

These mappings apply to the endpoint host in a net request (the TCP connect
and host resolver in a direct connection, and the `CONNECT` in an HTTP proxy
connection, and the endpoint host in a `SOCKS` proxy connection).

**Deprecated:** Use the `--host-resolver-rules` switch instead.

### --host-resolver-rules=`rules` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--host-resolver-rulesrules "Direct link to --host-resolver-rulesrules")

A comma-separated list of `rules` that control how hostnames are mapped.

For example:

- `MAP * 127.0.0.1` Forces all hostnames to be mapped to 127.0.0.1
- `MAP *.google.com proxy` Forces all google.com subdomains to be resolved to
"proxy".
- `MAP test.com [::1]:77` Forces "test.com" to resolve to IPv6 loopback. Will
also force the port of the resulting socket address to be 77.
- `MAP * baz, EXCLUDE www.google.com` Remaps everything to "baz", except for
" [www.google.com](http://www.google.com/)".

These `rules` only apply to the host resolver.

### --ignore-certificate-errors [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--ignore-certificate-errors "Direct link to --ignore-certificate-errors")

Ignores certificate related errors.

### --ignore-connections-limit=`domains` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--ignore-connections-limitdomains "Direct link to --ignore-connections-limitdomains")

Ignore the connections limit for `domains` list separated by `,`.

### --js-flags=`flags` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--js-flagsflags "Direct link to --js-flagsflags")

Specifies the flags passed to the [V8 engine](https://v8.dev/). In order to enable the `flags` in the main process,
this switch must be passed on startup.

```sh
$ electron --js-flags="--harmony_proxies --harmony_collections" your-app
```

Run `node --v8-options` or `electron --js-flags="--help"` in your terminal for the list of available flags. These can be used to enable early-stage JavaScript features, or log and manipulate garbage collection, among other things.

For example, to trace V8 optimization and deoptimization:

```sh
$ electron --js-flags="--trace-opt --trace-deopt" your-app
```

### --lang [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--lang "Direct link to --lang")

Set a custom locale.

### --log-file=`path` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--log-filepath "Direct link to --log-filepath")

If `--enable-logging` is specified, logs will be written to the given path. The
parent directory must exist.

Setting the `ELECTRON_LOG_FILE` environment variable is equivalent to passing
this flag. If both are present, the command-line switch takes precedence.

### --log-net-log=`path` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--log-net-logpath "Direct link to --log-net-logpath")

Enables net log events to be saved and writes them to `path`.

### --log-level=`N` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--log-leveln "Direct link to --log-leveln")

Sets the verbosity of logging when used together with `--enable-logging`.
`N` should be one of [Chrome's LogSeverities](https://source.chromium.org/chromium/chromium/src/+/main:base/logging.h?q=logging::LogSeverity&ss=chromium).

Note that two complementary logging mechanisms in Chromium -- `LOG()`
and `VLOG()` \-\- are controlled by different switches. `--log-level`
controls `LOG()` messages, while `--v` and `--vmodule` control `VLOG()`
messages. So you may want to use a combination of these three switches
depending on the granularity you want and what logging calls are made
by the code you're trying to watch.

See [Chromium Logging source](https://source.chromium.org/chromium/chromium/src/+/main:base/logging.h) for more information on how
`LOG()` and `VLOG()` interact. Loosely speaking, `VLOG()` can be thought
of as sub-levels / per-module levels inside `LOG(INFO)` to control the
firehose of `LOG(INFO)` data.

See also `--enable-logging`, `--log-level`, `--v`, and `--vmodule`.

### --no-proxy-server [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--no-proxy-server "Direct link to --no-proxy-server")

Don't use a proxy server and always make direct connections. Overrides any other
proxy server flags that are passed.

### --no-sandbox [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--no-sandbox "Direct link to --no-sandbox")

Disables the Chromium [sandbox](https://www.chromium.org/developers/design-documents/sandbox).
Forces renderer process and Chromium helper processes to run un-sandboxed.
Should only be used for testing.

### --no-stdio-init [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--no-stdio-init "Direct link to --no-stdio-init")

Disable stdio initialization during node initialization.
Used to avoid node initialization crash when the nul device is disabled on Windows platform.

### --proxy-bypass-list=`hosts` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--proxy-bypass-listhosts "Direct link to --proxy-bypass-listhosts")

Instructs Electron to bypass the proxy server for the given semi-colon-separated
list of hosts. This flag has an effect only if used in tandem with
`--proxy-server`.

For example:

```js
const { app } = require('electron')

app.commandLine.appendSwitch('proxy-bypass-list', '<local>;*.google.com;*foo.com;1.2.3.4:5678')
```

Will use the proxy server for all hosts except for local addresses (`localhost`,
`127.0.0.1` etc.), `google.com` subdomains, hosts that contain the suffix
`foo.com` and anything at `1.2.3.4:5678`.

### --proxy-pac-url=`url` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--proxy-pac-urlurl "Direct link to --proxy-pac-urlurl")

Uses the PAC script at the specified `url`.

### --proxy-server=`address:port` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--proxy-serveraddressport "Direct link to --proxy-serveraddressport")

Use a specified proxy server, which overrides the system setting. This switch
only affects requests with HTTP protocol, including HTTPS and WebSocket
requests. It is also noteworthy that not all proxy servers support HTTPS and
WebSocket requests. The proxy URL does not support username and password
authentication [per Chromium issue](https://bugs.chromium.org/p/chromium/issues/detail?id=615947).

### --remote-debugging-port=`port` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--remote-debugging-portport "Direct link to --remote-debugging-portport")

Enables remote debugging over HTTP on the specified `port`.

### --v=`log_level` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--vlog_level "Direct link to --vlog_level")

Gives the default maximal active V-logging level; 0 is the default. Normally
positive values are used for V-logging levels.

This switch only works when `--enable-logging` is also passed.

See also `--enable-logging`, `--log-level`, and `--vmodule`.

### --vmodule=`pattern` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--vmodulepattern "Direct link to --vmodulepattern")

Gives the per-module maximal V-logging levels to override the value given by
`--v`. E.g. `my_module=2,foo*=3` would change the logging level for all code in
source files `my_module.*` and `foo*.*`.

Any pattern containing a forward or backward slash will be tested against the
whole pathname and not only the module. E.g. `*/foo/bar/*=2` would change the
logging level for all code in the source files under a `foo/bar` directory.

This switch only works when `--enable-logging` is also passed.

See also `--enable-logging`, `--log-level`, and `--v`.

### --force\_high\_performance\_gpu [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--force_high_performance_gpu "Direct link to --force_high_performance_gpu")

Force using discrete GPU when there are multiple GPUs available.

### --force\_low\_power\_gpu [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--force_low_power_gpu "Direct link to --force_low_power_gpu")

Force using integrated GPU when there are multiple GPUs available.

### --xdg-portal-required-version=`version` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--xdg-portal-required-versionversion "Direct link to --xdg-portal-required-versionversion")

Sets the minimum required version of XDG portal implementation to `version`
in order to use the portal backend for file dialogs on linux. File dialogs
will fallback to using gtk or kde depending on the desktop environment when
the required version is unavailable. Current default is set to `3`.

## Node.js Flags [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#nodejs-flags "Direct link to Node.js Flags")

Electron supports some of the [CLI flags](https://nodejs.org/api/cli.html) supported by Node.js.

note

Passing unsupported command line switches to Electron when it is not running in `ELECTRON_RUN_AS_NODE` will have no effect.

### `--inspect-brk[=[host:]port]` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--inspect-brkhostport "Direct link to --inspect-brkhostport")

Activate inspector on host:port and break at start of user script. Default host:port is 127.0.0.1:9229.

Aliased to `--debug-brk=[host:]port`.

#### `--inspect-brk-node[=[host:]port]` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--inspect-brk-nodehostport "Direct link to --inspect-brk-nodehostport")

Activate inspector on `host:port` and break at start of the first internal
JavaScript script executed when the inspector is available.
Default `host:port` is `127.0.0.1:9229`.

### `--inspect-port=[host:]port` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--inspect-porthostport "Direct link to --inspect-porthostport")

Set the `host:port` to be used when the inspector is activated. Useful when activating the inspector by sending the SIGUSR1 signal. Default host is `127.0.0.1`.

Aliased to `--debug-port=[host:]port`.

### `--inspect[=[host:]port]` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--inspecthostport "Direct link to --inspecthostport")

Activate inspector on `host:port`. Default is `127.0.0.1:9229`.

V8 inspector integration allows tools such as Chrome DevTools and IDEs to debug and profile Electron instances. The tools attach to Electron instances via a TCP port and communicate using the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/).

See the [Debugging the Main Process](https://www.electronjs.org/docs/latest/tutorial/debugging-main-process) guide for more details.

Aliased to `--debug[=[host:]port`.\
\
### `--inspect-publish-uid=stderr,http` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--inspect-publish-uidstderrhttp "Direct link to --inspect-publish-uidstderrhttp")\
\
Specify ways of the inspector web socket url exposure.\
\
By default inspector websocket url is available in stderr and under /json/list endpoint on `http://host:port/json/list`.\
\
### `--experimental-network-inspection` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--experimental-network-inspection "Direct link to --experimental-network-inspection")\
\
Enable support for DevTools network inspector events, for visibility into requests made by the nodejs `http` and `https` modules.\
\
### `--experimental-inspector-network-resource` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--experimental-inspector-network-resource "Direct link to --experimental-inspector-network-resource")\
\
Enable support for resolving source maps over the network when using the Node.js inspector.\
\
When enabled, DevTools can retrieve remote source maps for main and utility\
process scripts via the Node.js inspector.\
\
**Note:** When enabled, the Node.js inspector will make network requests to\
URLs specified in source maps. Be mindful of this in environments where the\
process has access to internal networks.\
\
### `--no-deprecation` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--no-deprecation "Direct link to --no-deprecation")\
\
Silence deprecation warnings.\
\
### `--throw-deprecation` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--throw-deprecation "Direct link to --throw-deprecation")\
\
Throw errors for deprecations.\
\
### `--trace-deprecation` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--trace-deprecation "Direct link to --trace-deprecation")\
\
Print stack traces for deprecations.\
\
### `--trace-warnings` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--trace-warnings "Direct link to --trace-warnings")\
\
Print stack traces for process warnings (including deprecations).\
\
### `--dns-result-order=order` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--dns-result-orderorder "Direct link to --dns-result-orderorder")\
\
Set the default value of the `verbatim` parameter in the Node.js [`dns.lookup()`](https://nodejs.org/api/dns.html#dnslookuphostname-options-callback) and [`dnsPromises.lookup()`](https://nodejs.org/api/dns.html#dnspromiseslookuphostname-options) functions. The value could be:\
\
- `ipv4first`: sets default `verbatim``false`.\
- `verbatim`: sets default `verbatim``true`.\
\
The default is `verbatim` and `dns.setDefaultResultOrder()` have higher priority than `--dns-result-order`.\
\
### `--diagnostic-dir=directory` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--diagnostic-dirdirectory "Direct link to --diagnostic-dirdirectory")\
\
Set the directory to which all Node.js diagnostic output files are written. Defaults to current working directory.\
\
Affects the default output directory of [v8.setHeapSnapshotNearHeapLimit](https://nodejs.org/docs/latest/api/v8.html#v8setheapsnapshotnearheaplimitlimit).\
\
### `--no-experimental-global-navigator` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--no-experimental-global-navigator "Direct link to --no-experimental-global-navigator")\
\
Disable exposition of [Navigator API](https://github.com/nodejs/node/blob/main/doc/api/globals.md#navigator) on the global scope from Node.js.\
\
### `--experimental-transform-types` [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#--experimental-transform-types "Direct link to --experimental-transform-types")\
\
Enables the [transformation](https://nodejs.org/api/typescript.html#type-stripping)\
of TypeScript-only syntax into JavaScript code.\
\
## Chromium Flags [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#chromium-flags "Direct link to Chromium Flags")\
\
There isn't a documented list of all Chromium switches, but there are a few ways to find them.\
\
The easiest way is through Chromium's flags page, which you can access at `about://flags`. These flags don't directly match switch names, but they show up in the process's command-line arguments.\
\
To see these arguments, enable a flag in `about://flags`, then go to `about://version` in Chromium. You'll find a list of command-line arguments, including `--flag-switches-begin --your --list --flag-switches-end`, which contains the list of your flag enabled switches.\
\
Most flags are included as part of `--enable-features=`, but some are standalone switches, like `--enable-experimental-web-platform-features`.\
\
A complete list of flags exists in [Chromium's flag metadata page](https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/flag-metadata.json), but this list includes platform, environment and GPU specific, expired and potentially non-functional flags, so many of them might not always work in every situation.\
\
Keep in mind that standalone switches can sometimes be split into individual features, so there's no fully complete list of switches.\
\
Finally, you'll need to ensure that the version of Chromium in Electron matches the version of the browser you're using to cross-reference the switches.\
\
### Chromium features relevant to Electron apps [​](https://www.electronjs.org/docs/latest/api/command-line-switches\#chromium-features-relevant-to-electron-apps "Direct link to Chromium features relevant to Electron apps")\
\
- `AlwaysLogLOAFURL`: enables script attribution for\
[`long-animation-frame`](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing)`PerformanceObserver` events for non-http(s), non-data, non-blob URLs (such as `file:` or custom\
protocol URLs).\
- `SpareRendererForSitePerProcess`: keeps a spare renderer process running at all times so\
that a new window, or a navigation that needs a new process, does not wait for a process to\
launch. Electron starts one such process when the default session is created, for the first\
sandboxed window that uses it; enable this if the app opens windows regularly and the memory of an\
idle renderer is acceptable. Only windows whose `webPreferences` are sandboxed and set none of `additionalArguments`,\
`enableBlinkFeatures`, `disableBlinkFeatures`, `experimentalFeatures`, `offscreen` or (macOS)\
`scrollBounce` can use it.\
\
- [Electron CLI Flags](https://www.electronjs.org/docs/latest/api/command-line-switches#electron-cli-flags)\
  - [--auth-server-whitelist=`url`](https://www.electronjs.org/docs/latest/api/command-line-switches#--auth-server-whitelisturl)\
  - [--auth-negotiate-delegate-whitelist=`url`](https://www.electronjs.org/docs/latest/api/command-line-switches#--auth-negotiate-delegate-whitelisturl)\
  - [--disable-ntlm-v2](https://www.electronjs.org/docs/latest/api/command-line-switches#--disable-ntlm-v2)\
  - [--disable-http-cache](https://www.electronjs.org/docs/latest/api/command-line-switches#--disable-http-cache)\
  - [--disable-http2](https://www.electronjs.org/docs/latest/api/command-line-switches#--disable-http2)\
  - [--disable-geolocation _macOS_](https://www.electronjs.org/docs/latest/api/command-line-switches#--disable-geolocation-macos)\
  - [--disable-renderer-backgrounding](https://www.electronjs.org/docs/latest/api/command-line-switches#--disable-renderer-backgrounding)\
  - [--disk-cache-size=`size`](https://www.electronjs.org/docs/latest/api/command-line-switches#--disk-cache-sizesize)\
  - [--enable-logging\[=file\]](https://www.electronjs.org/docs/latest/api/command-line-switches#--enable-loggingfile)\
  - [--force-fieldtrials=`trials`](https://www.electronjs.org/docs/latest/api/command-line-switches#--force-fieldtrialstrials)\
  - [--host-rules=`rules` _Deprecated_](https://www.electronjs.org/docs/latest/api/command-line-switches#--host-rulesrules-deprecated)\
  - [--host-resolver-rules=`rules`](https://www.electronjs.org/docs/latest/api/command-line-switches#--host-resolver-rulesrules)\
  - [--ignore-certificate-errors](https://www.electronjs.org/docs/latest/api/command-line-switches#--ignore-certificate-errors)\
  - [--ignore-connections-limit=`domains`](https://www.electronjs.org/docs/latest/api/command-line-switches#--ignore-connections-limitdomains)\
  - [--js-flags=`flags`](https://www.electronjs.org/docs/latest/api/command-line-switches#--js-flagsflags)\
  - [--lang](https://www.electronjs.org/docs/latest/api/command-line-switches#--lang)\
  - [--log-file=`path`](https://www.electronjs.org/docs/latest/api/command-line-switches#--log-filepath)\
  - [--log-net-log=`path`](https://www.electronjs.org/docs/latest/api/command-line-switches#--log-net-logpath)\
  - [--log-level=`N`](https://www.electronjs.org/docs/latest/api/command-line-switches#--log-leveln)\
  - [--no-proxy-server](https://www.electronjs.org/docs/latest/api/command-line-switches#--no-proxy-server)\
  - [--no-sandbox](https://www.electronjs.org/docs/latest/api/command-line-switches#--no-sandbox)\
  - [--no-stdio-init](https://www.electronjs.org/docs/latest/api/command-line-switches#--no-stdio-init)\
  - [--proxy-bypass-list=`hosts`](https://www.electronjs.org/docs/latest/api/command-line-switches#--proxy-bypass-listhosts)\
  - [--proxy-pac-url=`url`](https://www.electronjs.org/docs/latest/api/command-line-switches#--proxy-pac-urlurl)\
  - [--proxy-server=`address:port`](https://www.electronjs.org/docs/latest/api/command-line-switches#--proxy-serveraddressport)\
  - [--remote-debugging-port=`port`](https://www.electronjs.org/docs/latest/api/command-line-switches#--remote-debugging-portport)\
  - [--v=`log_level`](https://www.electronjs.org/docs/latest/api/command-line-switches#--vlog_level)\
  - [--vmodule=`pattern`](https://www.electronjs.org/docs/latest/api/command-line-switches#--vmodulepattern)\
  - [--force\_high\_performance\_gpu](https://www.electronjs.org/docs/latest/api/command-line-switches#--force_high_performance_gpu)\
  - [--force\_low\_power\_gpu](https://www.electronjs.org/docs/latest/api/command-line-switches#--force_low_power_gpu)\
  - [--xdg-portal-required-version=`version`](https://www.electronjs.org/docs/latest/api/command-line-switches#--xdg-portal-required-versionversion)\
- [Node.js Flags](https://www.electronjs.org/docs/latest/api/command-line-switches#nodejs-flags)\
  - [`--inspect-brk[=[host:]port]`](https://www.electronjs.org/docs/latest/api/command-line-switches#--inspect-brkhostport)\
    - [`--inspect-brk-node[=[host:]port]`](https://www.electronjs.org/docs/latest/api/command-line-switches#--inspect-brk-nodehostport)\
  - [`--inspect-port=[host:]port`](https://www.electronjs.org/docs/latest/api/command-line-switches#--inspect-porthostport)\
  - [`--inspect[=[host:]port]`](https://www.electronjs.org/docs/latest/api/command-line-switches#--inspecthostport)\
  - [`--inspect-publish-uid=stderr,http`](https://www.electronjs.org/docs/latest/api/command-line-switches#--inspect-publish-uidstderrhttp)\
  - [`--experimental-network-inspection`](https://www.electronjs.org/docs/latest/api/command-line-switches#--experimental-network-inspection)\
  - [`--experimental-inspector-network-resource`](https://www.electronjs.org/docs/latest/api/command-line-switches#--experimental-inspector-network-resource)\
  - [`--no-deprecation`](https://www.electronjs.org/docs/latest/api/command-line-switches#--no-deprecation)\
  - [`--throw-deprecation`](https://www.electronjs.org/docs/latest/api/command-line-switches#--throw-deprecation)\
  - [`--trace-deprecation`](https://www.electronjs.org/docs/latest/api/command-line-switches#--trace-deprecation)\
  - [`--trace-warnings`](https://www.electronjs.org/docs/latest/api/command-line-switches#--trace-warnings)\
  - [`--dns-result-order=order`](https://www.electronjs.org/docs/latest/api/command-line-switches#--dns-result-orderorder)\
  - [`--diagnostic-dir=directory`](https://www.electronjs.org/docs/latest/api/command-line-switches#--diagnostic-dirdirectory)\
  - [`--no-experimental-global-navigator`](https://www.electronjs.org/docs/latest/api/command-line-switches#--no-experimental-global-navigator)\
  - [`--experimental-transform-types`](https://www.electronjs.org/docs/latest/api/command-line-switches#--experimental-transform-types)\
- [Chromium Flags](https://www.electronjs.org/docs/latest/api/command-line-switches#chromium-flags)\
  - [Chromium features relevant to Electron apps](https://www.electronjs.org/docs/latest/api/command-line-switches#chromium-features-relevant-to-electron-apps)
