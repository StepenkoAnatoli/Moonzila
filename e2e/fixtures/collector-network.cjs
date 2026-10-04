'use strict';
// Test-only. Never bundled or packaged: it lives under e2e/ and reaches the app only when a spec passes it to Electron
// with `-r`, before the app's own main code runs. Moonzila gives a collector child a minimal environment
// (collectorEnvironment), so the real pinned kit cannot be pointed at tests/fixtures/fake-github.ts by any setting.
// This adds exactly two variables, HTTPS_PROXY (a loopback proxy) and NODE_EXTRA_CA_CERTS (the test CA), to the
// environment block of a collect-remote.mjs launch on its way into the native helper. It also refuses every request main itself sends
// with fetch to a host other than loopback, so the test token can never reach the real GitHub. Production code has no hook
// for this; a process that can load this file into main can already run any code there. See
// docs/specification/research-journeys.md.
const ENV = 'MOONALIZA_E2E_COLLECTOR_NETWORK';
const KEYS = ['HTTPS_PROXY', 'NODE_EXTRA_CA_CERTS'];

/** Refuses anything but a loopback proxy and an absolute CA file, so the harness can never route a child elsewhere. */
function checkNetwork(network) {
  if (!network || typeof network !== 'object' || Object.keys(network).sort().join() !== KEYS.join()) throw new Error('E2E_NETWORK_INVALID');
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(network.HTTPS_PROXY)) throw new Error('E2E_NETWORK_INVALID');
  if (typeof network.NODE_EXTRA_CA_CERTS !== 'string' || !require('node:path').isAbsolute(network.NODE_EXTRA_CA_CERTS) || /[\0=]/.test(network.NODE_EXTRA_CA_CERTS)) throw new Error('E2E_NETWORK_INVALID');
  return network;
}

/**
 * Wraps `childProcess.spawn` so the first stdin write to the native helper (spawnOwned's protocol: a u32 timeout, then
 * u32-length UTF-16LE fields executable, command line, cwd, environment, then the guard list) gains the two variables
 * when its command line runs collect-remote.mjs. Every other launch, and the guard list, pass byte for byte.
 * Each collector launch's end is recorded in `outcomes`: the helper's exit code and, from the kit's last stdout line,
 * only `status`, `clientRef` and `state`, so a journey can tell which classification the supervisor received.
 */
function install(childProcess, input, scope = globalThis) {
  const network = checkNetwork(input);
  const state = { collectors: 0, rewritten: 0, outcomes: [], refusedFetches: [] };
  // Main's own requests (the verified import's GitHub run read) never leave the machine either: anything but loopback is
  // refused before it is sent, and only its host name is recorded, never a header. The importer defers on a failed read.
  const originalFetch = scope.fetch;
  if (typeof originalFetch === 'function') {
    scope.fetch = function fetch(resource, ...rest) {
      let host = null;
      try { host = new URL(typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url).hostname; } catch { /* refused below */ }
      if (host === '127.0.0.1' || host === 'localhost' || host === '[::1]') return originalFetch.call(this, resource, ...rest);
      state.refusedFetches.push(host ?? 'unparseable');
      return Promise.reject(new TypeError('E2E_NETWORK_REFUSED'));
    };
  }
  const read = (buffer, offset) => {
    if (offset + 4 > buffer.length) throw new Error('E2E_PROTOCOL');
    const end = offset + 4 + buffer.readUInt32LE(offset);
    if (end > buffer.length) throw new Error('E2E_PROTOCOL');
    return { value: buffer.subarray(offset + 4, end).toString('utf16le'), end };
  };
  const field = value => { const bytes = Buffer.from(value, 'utf16le'); const length = Buffer.alloc(4); length.writeUInt32LE(bytes.length); return Buffer.concat([length, bytes]); };
  const rewrite = protocol => {
    const fields = []; let offset = 4;
    for (let index = 0; index < 4; index++) { const next = read(protocol, offset); fields.push(next.value); offset = next.end; }
    const [executable, commandLine, cwd, environment] = fields;
    if (!commandLine.includes('collect-remote.mjs')) return null;
    state.collectors++;
    const entries = environment.split('\0').filter(Boolean);
    const key = entry => entry.slice(0, entry.indexOf('=')).toLowerCase();
    // The production environment must not already carry either variable: that would be the regression to catch.
    if (entries.some(entry => KEYS.some(name => key(entry) === name.toLowerCase()))) throw new Error('E2E_NETWORK_ALREADY_SET');
    entries.push(...KEYS.map(name => `${name}=${network[name]}`));
    // The same order spawnOwned uses: case-insensitive by name.
    entries.sort((a, b) => key(a).localeCompare(key(b)));
    state.rewritten++;
    return Buffer.concat([protocol.subarray(0, 4), field(executable), field(commandLine), field(cwd), field(entries.join('\0') + '\0'), protocol.subarray(offset)]);
  };
  const lastJson = text => { const line = text.split(/\r?\n/).map(value => value.trim()).filter(Boolean).at(-1); try { return JSON.parse(line); } catch { return null; } };
  const record = child => {
    let stdout = ''; let stderr = '';
    child.stdout?.on('data', chunk => { if (stdout.length < 65536) stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', chunk => { if (stderr.length < 8192) stderr += chunk.toString('utf8'); });
    child.once('close', () => {
      const exit = lastJson(stderr); const kit = lastJson(stdout);
      const report = kit && typeof kit === 'object' && typeof kit.status === 'string' ? kit : null;
      state.outcomes.push({ code: exit?.status === 'exited' && typeof exit.code === 'number' ? exit.code : null, status: report?.status ?? null, clientRef: typeof report?.clientRef === 'string' ? report.clientRef : null, state: typeof report?.state === 'string' ? report.state : null });
    });
  };
  const original = childProcess.spawn;
  childProcess.spawn = function spawn(command, ...rest) {
    const child = original.call(this, command, ...rest);
    if (typeof command !== 'string' || !/MoonAlizaHost\.exe$/i.test(command) || !child.stdin) return child;
    const write = child.stdin.write; let first = true;
    child.stdin.write = function (chunk, ...more) {
      if (first) {
        first = false;
        // A refusal ends the helper's input, so it launches nothing, and fails the launch loudly.
        try {
          if (!Buffer.isBuffer(chunk)) throw new Error('E2E_PROTOCOL');
          const rewritten = rewrite(chunk);
          if (rewritten) { chunk = rewritten; record(child); }
        } catch (error) { child.stdin.end(); throw error; }
      }
      return write.call(this, chunk, ...more);
    };
    return child;
  };
  return state;
}

if (process.env[ENV] !== undefined) {
  const network = JSON.parse(process.env[ENV]);
  delete process.env[ENV];
  globalThis.__moonzilaE2eCollectorNetwork = install(require('node:child_process'), network);
}

module.exports = { ENV, install };
