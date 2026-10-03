import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';

// Synthetic executables in the documented fuse-wire layout (Electron "Fuses", "The hard way"):
// sentinel, one version byte, one length byte, then one byte per fuse: '0' off, '1' on, 'r' removed.
const SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';
// Wire order of @electron/fuses FuseV1Options: RunAsNode, EnableCookieEncryption,
// EnableNodeOptionsEnvironmentVariable, EnableNodeCliInspectArguments,
// EnableEmbeddedAsarIntegrityValidation, OnlyLoadAppFromAsar, LoadBrowserProcessSpecificV8Snapshot,
// GrantFileProtocolExtraPrivileges, WasmTrapHandlers.
const ELECTRON_DEFAULTS = '101100011';
const HARDENED = '000011011';
const REQUIRED = [
  { name: 'RunAsNode', index: 0 },
  { name: 'EnableNodeOptionsEnvironmentVariable', index: 2 },
  { name: 'EnableNodeCliInspectArguments', index: 3 },
  { name: 'EnableEmbeddedAsarIntegrityValidation', index: 4 },
  { name: 'OnlyLoadAppFromAsar', index: 5 },
];

const directories: string[] = [];
afterEach(async () => { for (const root of directories.splice(0)) { const child = relative(resolve(tmpdir()), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('FIXTURE_PATH'); await rm(root, { recursive: true, force: true }); } });

async function executable(wire: string, options: { version?: number; length?: number; sentinel?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'moonaliza-fuses-')); directories.push(root);
  const path = join(root, 'MoonAliza.exe');
  const body = Buffer.concat([
    Buffer.from('MZ\x90\x00 synthetic image before the wire ', 'latin1'),
    Buffer.from(options.sentinel ?? SENTINEL, 'latin1'),
    Buffer.from([options.version ?? 1, options.length ?? wire.length]),
    Buffer.from(wire, 'latin1'),
    Buffer.from(' synthetic image after the wire', 'latin1'),
  ]);
  await writeFile(path, body);
  return path;
}
const check = (...args: string[]) => promisify(execFile)(process.execPath, [resolve('scripts/check-fuses.mjs'), ...args], { windowsHide: true, timeout: 15000, maxBuffer: 65536 });
const flip = (wire: string, index: number) => wire.slice(0, index) + (wire[index] === '0' ? '1' : '0') + wire.slice(index + 1);

test('a packaged executable with the five code-loading fuses set passes and reports what it read', async () => {
  const path = await executable(HARDENED);
  const { stdout, stderr } = await check(path);
  expect(stderr).toBe('');
  expect(JSON.parse(stdout)).toEqual({
    path,
    fuses: {
      RunAsNode: 'disabled',
      EnableNodeOptionsEnvironmentVariable: 'disabled',
      EnableNodeCliInspectArguments: 'disabled',
      EnableEmbeddedAsarIntegrityValidation: 'enabled',
      OnlyLoadAppFromAsar: 'enabled',
    },
  });
});

test('fuses outside the five do not decide the result', async () => {
  // Cookie encryption, the V8 snapshot, file-protocol privileges and WASM trap handlers flipped both ways.
  for (const others of [[0, 0, 0, 0], [1, 1, 1, 1]]) {
    const wire = HARDENED.split(''); [1, 6, 7, 8].forEach((index, i) => { wire[index] = String(others[i]); });
    await expect(check(await executable(wire.join('')))).resolves.toMatchObject({ stderr: '' });
  }
});

test('an unflipped Electron binary fails and names every one of the five fuses', async () => {
  const failure = await check(await executable(ELECTRON_DEFAULTS)).then(() => undefined, (error: { code: number; stderr: string }) => error);
  expect(failure?.code).toBe(1);
  expect(failure?.stderr).toMatch(/^FUSES_MISMATCH: /);
  expect(failure?.stderr).toContain('RunAsNode expected disabled, found enabled');
  expect(failure?.stderr).toContain('EnableNodeOptionsEnvironmentVariable expected disabled, found enabled');
  expect(failure?.stderr).toContain('EnableNodeCliInspectArguments expected disabled, found enabled');
  expect(failure?.stderr).toContain('EnableEmbeddedAsarIntegrityValidation expected enabled, found disabled');
  expect(failure?.stderr).toContain('OnlyLoadAppFromAsar expected enabled, found disabled');
});

test('each of the five fuses alone, set the wrong way, fails the check and is the only one named', async () => {
  for (const fuse of REQUIRED) {
    const failure = await check(await executable(flip(HARDENED, fuse.index))).then(() => undefined, (error: { code: number; stderr: string }) => error);
    expect(failure?.code, fuse.name).toBe(1);
    const named = REQUIRED.filter(other => failure?.stderr.includes(`${other.name} expected`)).map(other => other.name);
    expect(named).toEqual([fuse.name]);
  }
});

test('a removed fuse or a wire too short to hold the five fails instead of passing by omission', async () => {
  const removed = await check(await executable('r00011011')).then(() => undefined, (error: { code: number; stderr: string }) => error);
  expect(removed?.code).toBe(1);
  expect(removed?.stderr).toContain('RunAsNode expected disabled, found removed');
  const short = await check(await executable('0001')).then(() => undefined, (error: { code: number; stderr: string }) => error);
  expect(short?.code).toBe(1);
  expect(short?.stderr).toContain('EnableEmbeddedAsarIntegrityValidation expected enabled, found missing');
  expect(short?.stderr).toContain('OnlyLoadAppFromAsar expected enabled, found missing');
  expect(short?.stderr).not.toContain('RunAsNode expected');
});

test('a binary without the fuse wire, with an unknown wire version, or no file at all is unreadable, never a pass', async () => {
  const noWire = await check(await executable(HARDENED, { sentinel: 'x'.repeat(SENTINEL.length) })).then(() => undefined, (error: { code: number; stderr: string }) => error);
  expect(noWire?.code).toBe(1);
  expect(noWire?.stderr).toMatch(/^FUSES_UNREADABLE: /);
  const version = await check(await executable(HARDENED, { version: 2 })).then(() => undefined, (error: { code: number; stderr: string }) => error);
  expect(version?.code).toBe(1);
  expect(version?.stderr).toMatch(/^FUSES_UNREADABLE: fuse wire version 2/);
  const root = await mkdtemp(join(tmpdir(), 'moonaliza-fuses-')); directories.push(root);
  const missing = await check(join(root, 'MoonAliza.exe')).then(() => undefined, (error: { code: number; stderr: string }) => error);
  expect(missing?.code).toBe(1);
  expect(missing?.stderr).toMatch(/^FUSES_UNREADABLE: /);
});

test('a fuse name @electron/fuses no longer knows is unreadable, not reported as a mismatch', async () => {
  // The script run beside a stand-in @electron/fuses whose FuseV1Options lacks OnlyLoadAppFromAsar, as after an upstream rename.
  const root = await mkdtemp(join(tmpdir(), 'moonaliza-fuses-')); directories.push(root);
  await mkdir(join(root, 'scripts')); await copyFile(resolve('scripts/check-fuses.mjs'), join(root, 'scripts', 'check-fuses.mjs'));
  const library = join(root, 'node_modules', '@electron', 'fuses'); await mkdir(library, { recursive: true });
  await writeFile(join(library, 'package.json'), JSON.stringify({ name: '@electron/fuses', main: 'index.js' }));
  await writeFile(join(library, 'index.js'), [
    "exports.FuseVersion = { V1: '1' };",
    'exports.FuseV1Options = { RunAsNode: 0, EnableNodeOptionsEnvironmentVariable: 2, EnableNodeCliInspectArguments: 3, EnableEmbeddedAsarIntegrityValidation: 4 };',
    "exports.getCurrentFuseWire = async () => Object.assign([...Buffer.from('" + HARDENED + "', 'latin1')], { version: '1' });",
  ].join('\n'));
  const failure = await promisify(execFile)(process.execPath, [join(root, 'scripts', 'check-fuses.mjs'), join(root, 'MoonAliza.exe')], { windowsHide: true, timeout: 15000, maxBuffer: 65536 })
    .then(() => undefined, (error: { code: number; stderr: string }) => error);
  expect(failure?.code).toBe(1);
  expect(failure?.stderr).toBe('FUSES_UNREADABLE: @electron/fuses does not know the fuse OnlyLoadAppFromAsar\n');
});

const CONFIGURED_FUSES = {
  runAsNode: 'false',
  enableNodeOptionsEnvironmentVariable: 'false',
  enableNodeCliInspectArguments: 'false',
  onlyLoadAppFromAsar: 'true',
  enableEmbeddedAsarIntegrityValidation: 'true',
};
function fuseEntries(config: string) {
  // Line endings normalised first: a Windows checkout with core.autocrlf=true has CRLF.
  const block = /^electronFuses:\n((?: {2}.*\n?)*)/m.exec(config.replace(/\r\n/g, '\n'))?.[1] ?? '';
  return Object.fromEntries(block.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const [key, value] = line.replace(/#.*$/, '').trim().split(/:\s*/); return [key, value];
  }));
}

test('the packaging configuration flips exactly the fuses the check requires', async () => {
  const config = await readFile(resolve('electron-builder.yml'), 'utf8');
  expect(fuseEntries(config)).toEqual(CONFIGURED_FUSES);
});

test('the configuration check reads the same fuses from a CRLF checkout (core.autocrlf=true on Windows)', async () => {
  const config = (await readFile(resolve('electron-builder.yml'), 'utf8')).replace(/\r?\n/g, '\r\n');
  expect(config).toContain('\r\n');
  expect(fuseEntries(config)).toEqual(CONFIGURED_FUSES);
});
