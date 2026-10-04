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

/** The steps of the Windows job as { key: value } maps of their top-level scalar keys (name, if, run, uses). */
function workflowSteps(workflow: string) {
  const lines = workflow.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(line => /^ {4}steps:\s*$/.test(line));
  const steps: Array<Record<string, string>> = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !line.startsWith('      ')) break;
    const item = /^ {6}- (\w[\w-]*):\s*(.*)$/.exec(line); const key = /^ {8}(\w[\w-]*):\s*(.*)$/.exec(line);
    if (item) steps.push({ [item[1] ?? '']: item[2] ?? '' });
    else if (key && steps.length) steps.at(-1)![key[1] ?? ''] = key[2] ?? '';
  }
  return steps;
}

test('the Windows workflow runs the fuse check on the packaged exe, under the same condition and right after packaging', async () => {
  const steps = workflowSteps(await readFile(resolve('.github/workflows/windows.yml'), 'utf8'));
  const config = await readFile(resolve('electron-builder.yml'), 'utf8');
  const productName = /^productName:\s*(\S+)\s*$/m.exec(config)?.[1];
  const output = /^directories:\s*\r?\n(?: {2}.*\r?\n)*? {2}output:\s*(\S+)\s*$/m.exec(config)?.[1];
  expect([productName, output]).toEqual(['Moonzila', 'release']);
  const packaging = steps.findIndex(step => step.run === 'npm run package:win');
  const fuseCheck = steps.findIndex(step => step.run?.startsWith('node scripts/check-fuses.mjs'));
  expect(packaging).toBeGreaterThanOrEqual(0);
  expect(fuseCheck).toBe(packaging + 1);
  expect(steps[fuseCheck]?.if).toBe(steps[packaging]?.if);
  expect(steps[fuseCheck]?.run).toBe(`node scripts/check-fuses.mjs ${output}/win-unpacked/${productName}.exe`);
});

// Decision 13 (docs/specification/decisions.md): the packaged e2e runs on a test-only package that differs from the
// shipped one only in EnableNodeCliInspectArguments, because Playwright's launcher needs --inspect
// (docs/research/2026-10-04-playwright-fused-electron, U-1).
test('--test-package accepts only a package whose inspect fuse alone is on', async () => {
  const inspectOn = flip(HARDENED, 3);
  const { stdout, stderr } = await check('--test-package', await executable(inspectOn));
  expect(stderr).toBe('');
  expect(JSON.parse(stdout).fuses).toMatchObject({ EnableNodeCliInspectArguments: 'enabled', RunAsNode: 'disabled', OnlyLoadAppFromAsar: 'enabled' });
  // The shipped package is not a test package, and a test package that loosens any other fuse is refused.
  const shipped = await check('--test-package', await executable(HARDENED)).then(() => undefined, (error: { code: number; stderr: string }) => error);
  expect(shipped).toMatchObject({ code: 1 }); expect(shipped?.stderr).toContain('EnableNodeCliInspectArguments expected enabled, found disabled');
  for (const { name, index } of REQUIRED.filter(fuse => fuse.index !== 3)) {
    const failure = await check('--test-package', await executable(flip(inspectOn, index))).then(() => undefined, (error: { code: number; stderr: string }) => error);
    expect(failure, name).toMatchObject({ code: 1 }); expect(failure?.stderr, name).toContain(`FUSES_MISMATCH`); expect(failure?.stderr, name).toContain(name);
  }
  // Without the flag the same test package fails as a shipped one.
  await expect(check(await executable(inspectOn))).rejects.toMatchObject({ code: 1 });
});

test('an unknown option is refused rather than read as the executable path', async () => {
  // A lone misspelled option would otherwise be read as the path and fail as an unreadable file, hiding the typo.
  const failure = await check('--test-pakage').then(() => undefined, (error: { code: number; stderr: string }) => error);
  expect(failure).toMatchObject({ code: 2 }); expect(failure?.stderr).toContain('USAGE');
  const extra = await check(await executable(HARDENED), 'second').then(() => undefined, (error: { code: number; stderr: string }) => error);
  expect(extra).toMatchObject({ code: 2 }); expect(extra?.stderr).toContain('USAGE');
});

test('the test-only package overrides the inspect fuse and nothing else, in its own output folder', async () => {
  const scripts = JSON.parse(await readFile(resolve('package.json'), 'utf8')).scripts as Record<string, string>;
  const script = scripts['package:win-e2e'] ?? '';
  expect(script).toMatch(/^electron-builder --win --dir /);
  expect(script.match(/-c\.electronFuses\.[\w.]+=\S+/g)).toEqual(['-c.electronFuses.enableNodeCliInspectArguments=true']);
  expect(script).toContain('-c.directories.output=release-e2e');
  expect(await readFile(resolve('.gitignore'), 'utf8')).toMatch(/^release-e2e\/$/m);
});

test('the Windows workflow checks the test-only package and runs the packaged e2e on it, never on the shipped exe', async () => {
  const text = await readFile(resolve('.github/workflows/windows.yml'), 'utf8');
  const steps = workflowSteps(text);
  const productName = /^productName:\s*(\S+)\s*$/m.exec(await readFile(resolve('electron-builder.yml'), 'utf8'))?.[1];
  const shippedCheck = steps.findIndex(step => step.run === `node scripts/check-fuses.mjs release/win-unpacked/${productName}.exe`);
  const build = steps.findIndex(step => step.run === 'npm run package:win-e2e');
  const testCheck = steps.findIndex(step => step.run === `node scripts/check-fuses.mjs --test-package release-e2e/win-unpacked/${productName}.exe`);
  const e2e = steps.findIndex((step, index) => index > testCheck && step.run === 'npm run test:e2e');
  expect([shippedCheck >= 0, build, testCheck, e2e]).toEqual([true, shippedCheck + 1, shippedCheck + 2, shippedCheck + 3]);
  for (const index of [build, testCheck, e2e]) expect(steps[index]?.if).toBe(steps[shippedCheck]?.if);
  const executables = [...text.matchAll(/MOONALIZA_TEST_EXECUTABLE:\s*'([^']*)'/g)].map(match => match[1]);
  expect(executables).toEqual([`\${{ github.workspace }}/release-e2e/win-unpacked/${productName}.exe`]);
});
