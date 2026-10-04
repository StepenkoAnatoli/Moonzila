// Maintainer-only operation. Never invoked by tests or CI; changes require review.
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { revision, legacyRevision, exportSource, inventory, sha256, json } from './research-kit-source.mjs';
// Paths below are repository-relative: run from the repository root whatever the caller's cwd.
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
// Parsed before anything is exported or written, so a mistyped option changes no file.
const options = process.argv.slice(2);
if (options.length > 1 || (options.length === 1 && !['--mutations-only', '--inventory-only'].includes(options[0]))) throw new Error('Use no option, --mutations-only or --inventory-only');
const mode = options[0] ?? 'full';
const repo = resolve('.build/research-kit-pin');
const output = resolve('tests/fixtures/research-kit'); mkdirSync(output, { recursive: true });
const previous = mode === 'full' ? null : JSON.parse(readFileSync(join(output, 'provenance.json'), 'utf8'));
const work = mkdtempSync(resolve('.build/rk-generation-'));
// The exported kits and synthetic inputs are scratch: removed on every exit (success, --inventory-only's exit, or a throw).
process.on('exit', () => rmSync(work, { recursive: true, force: true }));
const kit = exportSource(repo, revision, join(work, 'current'));
// The dispatch identity the producer ZIPs carry. Only a full regeneration may change it; after a
// re-pin, a new commit here would no longer match the bytes (IDENTITY_MISMATCH).
const identity = previous?.identity ?? { clientRef: 'moonaliza-fixture', repository: 'moonaliza-fixtures/synthetic', ref: 'fixture', commit: revision, workflow: 'fixture-generation', workflowRunId: 1, runAttempt: 1 };
function validate(file) {
  const run = spawnSync(process.execPath, [join(kit, 'bin/artifact.mjs'), 'validate', '--file', file, '--expect-client-ref', identity.clientRef, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (run.error) throw run.error;
  return { exitCode: run.status, report: JSON.parse(run.stdout) };
}
if (mode === '--inventory-only') {
  // Re-pin the validator without touching a golden ZIP: every recorded fixture must keep its exact
  // bytes and draw the identical exit code and report from the new pin, or nothing is written.
  const changed = previous.fixtures.filter(f => {
    const bytes = readFileSync(join(output, f.name + '.zip'));
    return bytes.length !== f.byteLength || sha256(bytes) !== f.sha256 || !isDeepStrictEqual(validate(join(output, f.name + '.zip')), f.expected);
  }).map(f => f.name);
  if (changed.length) throw new Error(`Validator ${revision} changes the recorded result for: ${changed.join(', ')}. Nothing was written.`);
  json('src/adapters/research-kit/runtime-inventory.json', inventory(kit));
  json(join(output, 'provenance.json'), { ...previous, validatorRevision: revision });
  console.log(`Validator re-pinned to ${revision}; ${previous.fixtures.length} recorded reports reproduced.`);
  process.exit(0);
}
const oldKit = exportSource(repo, legacyRevision, join(work, 'legacy'));
const current = await import(pathToFileURL(join(kit, 'test/artifact-fixtures.mjs')).href);
const legacy = await import(pathToFileURL(join(oldKit, 'test/artifact-fixtures.mjs')).href);
const { openZip } = await import(pathToFileURL(join(kit, 'lib/artifact-zip.mjs')).href);
json('src/adapters/research-kit/runtime-inventory.json', inventory(kit));
const mutationsOnly = mode === '--mutations-only';
const records = previous ? previous.fixtures.filter(f => f.producerRevision !== null) : [];
function record(name, producerRevision, recipe, commands = []) {
  const file = join(output, name + '.zip'); const bytes = readFileSync(file);
  records.push({ name, producerRevision, recipe, commands, byteLength: bytes.length, sha256: sha256(bytes), expected: validate(file) });
}
for (const name of mutationsOnly ? [] : ['approved', 'collected', 'failed', 'legacy-review']) {
  const old = name === 'legacy-review'; const source = old ? oldKit : kit; const helpers = old ? legacy : current;
  const root = name === 'failed' ? mkdtempSync(join(work, 'empty-')) : name === 'approved' ? helpers.approvedProject('2026-09-30') : helpers.collectedProject('2026-09-30');
  if (name === 'approved') { const file = join(root, 'research/BRIEF.md'); writeFileSync(file, readFileSync(file, 'utf8') + '\nReviewed by: agent\n'); }
  if (old) { const file = join(root, 'research/MAP.md'); writeFileSync(file, readFileSync(file, 'utf8').replaceAll('COVERED', 'UNREVIEWED')); }
  const args = ['create', '--root', root, '--output', join(output, name + '.zip'), '--client-ref', identity.clientRef, '--repository', identity.repository, '--ref', identity.ref, '--commit', identity.commit, '--workflow', identity.workflow, '--run-id', '1', '--run-attempt', '1'];
  const result = spawnSync(process.execPath, [join(source, 'bin/artifact.mjs'), ...args], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (result.error || result.status !== 0) throw new Error(`Producer ${name} failed: ${result.stderr} ${result.stdout}`);
  record(name, old ? legacyRevision : revision, name === 'approved' ? 'Upstream approvedProject: rewrite synthetic Finding; render real brief and answer TODOs; append agent reviewer declaration; real producer derives approval.' : old ? 'Legacy collectedProject with MAP COVERED changed to UNREVIEWED before actual legacy producer derives state.' : name === 'failed' ? 'Empty synthetic input directory; producer derives collection failure.' : 'Upstream collectedProject, untouched synthetic collector-style Finding and unreviewed brief.', [['node', '<producer>/bin/artifact.mjs', ...args.map(v => v === root ? '<synthetic-input>' : v === join(output, name + '.zip') ? name + '.zip' : v)]]);
}
const original = openZip(readFileSync(join(output, 'approved.zip')));
const entries = original.entries.map(entry => ({ name: entry.name, data: original.read(entry.name) }));
const manifest = JSON.parse(original.read('manifest.json').toString('utf8'));
for (const name of ['unsupported', 'mixed-era', 'contradictory', 'tampered', 'missing-capture', 'broken-chain', 'broken-citation', 'traversal', 'duplicate', 'symlink', 'bomb']) {
  const changed = entries.map(entry => ({ ...entry })); const m = structuredClone(manifest);
  if (name === 'unsupported') m.formatVersion = '99.0.0';
  if (name === 'mixed-era') m.review.by = 'human';
  if (name === 'contradictory') m.gate.buildAuthorized = false;
  if (['unsupported', 'mixed-era', 'contradictory'].includes(name)) {
    const bytes = Buffer.from(JSON.stringify(m)); changed.find(e => e.name === 'manifest.json').data = bytes;
    changed.find(e => e.name === 'manifest.sha256').data = Buffer.from(sha256(bytes) + '  manifest.json\n');
  }
  const capture = changed.findIndex(e => e.name.startsWith('project/research/raw/') && e.name.endsWith('.md'));
  if (name === 'tampered') changed[capture].data = Buffer.from('Changed capture bytes');
  if (name === 'missing-capture') changed.splice(capture, 1);
  if (name === 'traversal') changed.push({ name: '../escape', data: 'escape' });
  if (name === 'duplicate') changed.push(changed[0]);
  if (name === 'symlink') changed.push({ name: 'project/link', data: '../escape', unixMode: 0o120777 });
  if (name === 'bomb') changed.push({ name: 'project/bomb', data: Buffer.alloc(2 * 1024 ** 2), deflate: true });
  if (name === 'broken-chain' || name === 'broken-citation') {
    const entry = changed.find(e => e.name === (name === 'broken-chain' ? 'project/research/raw/.fetches.jsonl' : 'project/research/EVIDENCE.md'));
    if (name === 'broken-chain') { const line = JSON.parse(entry.data.toString('utf8').trim()); line.entrySha256 = '0'.repeat(64); entry.data = Buffer.from(JSON.stringify(line) + '\n'); }
    else entry.data = Buffer.from(entry.data.toString('utf8').replaceAll(changed[capture].name.slice('project/'.length), 'research/raw/missing-citation.md'));
    const declared = m.files.find(f => f.path === entry.name); declared.byteLength = entry.data.length; declared.sha256 = sha256(entry.data);
    const bytes = Buffer.from(JSON.stringify(m)); changed.find(e => e.name === 'manifest.json').data = bytes;
    changed.find(e => e.name === 'manifest.sha256').data = Buffer.from(sha256(bytes) + '  manifest.json\n');
  }
  writeFileSync(join(output, name + '.zip'), current.rawZip(changed));
  record(name, null, `Negative mutation of approved.zip: ${name}; see this generator for exact byte/field mutation. All other entry bytes preserved; ZIP rebuilt by upstream test-only rawZip. No producer approval is claimed.`);
}
json(join(output, 'provenance.json'), { validatorRevision: revision, legacyRevision, runtime: previous?.runtime ?? process.version, platform: previous?.platform ?? process.platform, mutationRuntime: process.version, identity, fixtures: records });
console.log(records.map(f => `${f.name}: ${f.expected.report.status} ${f.expected.report.state}`).join('\n'));
