import fuses from '@electron/fuses';

// Reads the fuse wire of a packaged Moonzila executable and exits 1 unless the five
// code-loading fuses are as electron-builder.yml `electronFuses` sets them. Read-only.
// Usage: node scripts/check-fuses.mjs [--test-package] [path-to-exe]  (default release/win-unpacked/Moonzila.exe)
// --test-package checks the test-only package (`npm run package:win-e2e`): identical except that
// EnableNodeCliInspectArguments is on, because Playwright's launcher needs --inspect (decision 13;
// docs/research/2026-10-04-playwright-fused-electron, U-1). Any other difference fails it.
// Evidence: docs/research/2026-10-03-electron-fuses/research/BRIEF.md ("Decision").
const { getCurrentFuseWire, FuseV1Options, FuseVersion } = fuses;
// Fuse byte values from Electron's documented wire format ('0', '1', 'r'); @electron/fuses does not export them.
const FuseState = { DISABLE: 0x30, ENABLE: 0x31, REMOVED: 0x72 };
const REQUIRED = [
  ['RunAsNode', FuseState.DISABLE],
  ['EnableNodeOptionsEnvironmentVariable', FuseState.DISABLE],
  ['EnableNodeCliInspectArguments', FuseState.DISABLE],
  ['EnableEmbeddedAsarIntegrityValidation', FuseState.ENABLE],
  ['OnlyLoadAppFromAsar', FuseState.ENABLE],
];
const label = state => state === FuseState.DISABLE ? 'disabled' : state === FuseState.ENABLE ? 'enabled' : state === FuseState.REMOVED ? 'removed' : state === undefined ? 'missing' : `unknown byte ${state}`;

const args = process.argv.slice(2);
const testPackage = args[0] === '--test-package';
if (testPackage) args.shift();
if (args.length > 1 || args[0]?.startsWith('--')) {
  process.stderr.write('USAGE: node scripts/check-fuses.mjs [--test-package] [path-to-exe]\n');
  process.exit(2);
}
if (testPackage) REQUIRED.find(([name]) => name === 'EnableNodeCliInspectArguments')[1] = FuseState.ENABLE;
const path = args[0] ?? 'release/win-unpacked/Moonzila.exe';
let wire;
try {
  wire = await getCurrentFuseWire(path);
} catch (error) {
  process.stderr.write(`FUSES_UNREADABLE: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
if (wire.version !== FuseVersion.V1) {
  process.stderr.write(`FUSES_UNREADABLE: fuse wire version ${wire.version} is not ${FuseVersion.V1}; update @electron/fuses and this check\n`);
  process.exit(1);
}
const found = {}; const mismatches = [];
for (const [name, expected] of REQUIRED) {
  const index = FuseV1Options[name];
  if (typeof index !== 'number') {
    process.stderr.write(`FUSES_UNREADABLE: @electron/fuses does not know the fuse ${name}\n`);
    process.exit(1);
  }
  const state = wire[index]; found[name] = label(state);
  if (state !== expected) mismatches.push(`${name} expected ${label(expected)}, found ${label(state)}`);
}
if (mismatches.length) {
  process.stderr.write(`FUSES_MISMATCH: ${path}: ${mismatches.join('; ')}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({ path, fuses: found })}\n`);
