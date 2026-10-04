import { afterAll, beforeAll, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import provenance from './fixtures/research-kit/provenance.json';
import { ResearchKit } from '../src/adapters/research-kit/adapter';
import type { OwnedRunner } from '../src/tools/commands';
import { Store } from '../src/engine/store';
import { ResearchJobs } from '../src/engine/research';
import type { Control } from '../src/engine/control';
import { ResearchDocumentSchema } from '../src/shared/params';
import { Vault } from '../src/main/vault';
import { materialise } from '../src/main/review-workspace';
import { cutUtf8, MAX_DOCUMENT_BYTES, readResearchDocument, readWorkspace, type DocumentDeps, type DocumentName } from '../src/main/research-document';

// The reader research.document.read (docs/specification/research-review-ui.md, sections 3 and 5, unit B11), against the
// real Store and ResearchJobs, the real ResearchKit adapter with the real pinned kit run by node, the collected and
// approved fixture packages, and a real Vault with a test cryptor. Every path stays inside this file's own mkdtemp root.
let root: string; let nodeSha256: string; let collectedBytes: Buffer; let approvedBytes: Buffer;
const kitRoot = resolve('.build/research-kit-external/research-kit');
const collectedFixture = resolve('tests/fixtures/research-kit/collected.zip');
const approvedFixture = resolve('tests/fixtures/research-kit/approved.zip');
const at = '2026-10-04T00:00:00.000Z';
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const CAP = 262_144;
const bytesOf = (text: string) => Buffer.byteLength(text, 'utf8');

const runner: OwnedRunner = async (request, signal, options = {}) => {
  if (signal?.aborted) throw new Error('RUN_CANCELLED');
  await options.beforeStart?.(); options.onStarted?.({ pid: 4242, createdAt: '1' });
  return new Promise(done => execFile(request.executable, request.args, { cwd: request.cwd, env: request.env, timeout: request.timeoutMs, maxBuffer: request.maxOutputBytes, encoding: 'utf8' },
    (error, stdout) => done({ status: 'exited', code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, output: stdout, truncated: false, cancelled: false, timedOut: false })));
};
function cryptor(broken = false) {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(value: string) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); },
    decryptString(value: Buffer) {
      if (broken) throw new Error('decrypt failed');
      const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}

interface World { folder: string; store: Store; jobs: ResearchJobs; kit: ResearchKit; storage: string; reviewRoot: string; vault: Vault; id: string; job: string; project: string; runId?: string; verifications: number }
let count = 0;
/** A job collected from collected.zip (retained under the collecting revision's binding), as Task 4's import leaves it. */
async function world(options: { secrets?: string[]; brokenVault?: boolean; nodeSha256?: string; collect?: boolean } = {}): Promise<World> {
  const folder = join(root, `w${++count}`); await mkdir(folder);
  const store = new Store(join(folder, 'state.sqlite')); const jobs = new ResearchJobs(store, () => {});
  store.putProject({ id: 'p', name: 'p', rootPath: join(folder, 'project-root'), pathLabel: 'p', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'public-technical' }, missing: false, createdAt: at });
  store.putProfile({ id: 'm', name: 'Local', kind: 'ollama', endpoint: 'http://localhost:11434', model: 'test', contextTokens: 8192, outputTokens: 512, locality: 'local', revision: 1, revisionId: 'pv', createdAt: at, updatedAt: at });
  const id = 'j1';
  store.createResearch({ id, projectId: 'p', topic: 'Fixture topic', inputs: { queries: [], urls: [], preferDomains: [], depth: 'quick', maxPages: 8 }, clientRef: provenance.identity.clientRef, researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
  const storage = join(folder, 'storage');
  const kit = new ResearchKit({ kitRoot, nodePath: process.execPath, nodeSha256: options.nodeSha256 ?? nodeSha256, storageRoot: storage, helperPath: resolve('.build/native/MoonAlizaHost.exe') }, runner);
  const vault = new Vault(join(folder, 'vault'), cryptor(options.brokenVault));
  await vault.initialize('epoch-1');
  for (const secret of options.secrets ?? []) { const ref = await vault.saveStaged(secret); await vault.commit(ref); }
  const w: World = { folder, store, jobs, kit, storage, reviewRoot: join(storage, 'review'), vault, id, job: join(storage, 'review', id), project: join(storage, 'review', id, 'project'), verifications: 0 };
  if (options.collect === false) return w;
  step(w, 'dispatching', 'main', { target: { collectorRevision: 1, repository: provenance.identity.repository, workflow: 'collect.yml', ref: provenance.identity.ref } });
  step(w, 'collecting', 'main', { workflowRunId: '1' });
  // Retained with a kit whose node hash is right, whatever the world's own kit is given.
  const importer = new ResearchKit({ kitRoot, nodePath: process.execPath, nodeSha256, storageRoot: storage, helperPath: resolve('.build/native/MoonAlizaHost.exe') }, runner);
  try {
    const imported = await importer.validate(collectedFixture, { projectId: 'p', projectRevision: 1, jobId: id, jobRevision: 3, ...provenance.identity });
    expect(imported).toMatchObject({ status: 'PASS' });
    step(w, 'collected', 'main', { verification: { artifactSha256: digest(collectedBytes), artifactBytes: collectedBytes.length, validatorRevision: imported.receipt!.validatorRevision, nodeSha256, state: imported.state, jobRevision: 3, projectRevision: 1,
      repository: provenance.identity.repository, ref: provenance.identity.ref, workflow: provenance.identity.workflow, commit: provenance.identity.commit, runAttempt: 1, workflowRunId: '1', clientRef: provenance.identity.clientRef, downloadDigest: 'unverified' } });
  } finally { await importer.close(); }
  return w;
}
function step(w: World, to: string, actor: 'main' | 'user', patch: object, cause = 'TEST_STEP') {
  return w.store.transitionResearch({ researchId: w.id, expectedRevision: w.store.getResearch(w.id)!.revision, to, actor, cause, patch } as Parameters<Store['transitionResearch']>[0]);
}
async function reviewing(w: World, materialised = true) {
  const runId = randomUUID(); const sessionId = randomUUID();
  w.store.putSession({ id: sessionId, projectId: 'p', title: 'Review', createdAt: at, updatedAt: at });
  w.store.putRun({ id: runId, sessionId, projectId: 'p', mode: 'research', status: 'running', profileId: 'm', profileRevisionId: 'pv', policyRevision: 1, trustRevision: 1, createdAt: at });
  w.runId = runId;
  step(w, 'reviewing', 'user', { reviewRunId: runId, reviewSessionId: sessionId, workspace: 'fresh' }, 'REVIEW_STARTED');
  if (materialised) await materialise(collectedBytes, w.job);
}
function endRun(w: World) { w.store.appendEvent(w.runId!, 'run.completed', {}, { status: 'completed', finishedAt: at }); }
async function notReady(w: World, materialised = true) {
  await reviewing(w, materialised); endRun(w);
  step(w, 'not_ready', 'main', { failure: 'REVIEW_RUN_FAILED' });
}
/** reviewing -> packaging -> approved, with approved.zip retained under the packaging revision's binding. */
async function approved(w: World) {
  await reviewing(w); step(w, 'packaging', 'main', { reviewDigest: 'c'.repeat(64) }, 'WORKSPACE_FROZEN'); endRun(w);
  const bound = w.store.getResearch(w.id)!.revision;
  const result = await w.kit.validate(approvedFixture, { projectId: 'p', projectRevision: 1, jobId: w.id, jobRevision: bound, ...provenance.identity });
  expect(result).toMatchObject({ status: 'PASS', state: 'APPROVED_BRIEF', researchReady: true });
  step(w, 'approved', 'main', { reviewedPackage: { sha256: digest(approvedBytes), validatorRevision: result.receipt!.validatorRevision, boundRevision: bound } }, 'KIT_APPROVED');
}
function deps(w: World, overrides: Partial<DocumentDeps> = {}): DocumentDeps {
  const kit: DocumentDeps['kit'] = { verifyRetained: (...args) => { w.verifications++; return w.kit.verifyRetained(...args); } };
  return {
    control: async (control: Control) => {
      if (control.method === 'research.context') return w.jobs.context(control.researchId);
      if (control.method === 'research.review.context') return w.jobs.reviewContext(control.researchId);
      throw new Error('NOT_IMPLEMENTED');
    },
    kit, reviewRoot: w.reviewRoot, redact: text => w.vault.redact(text), ...overrides,
  };
}
const read = async (w: World, document: DocumentName = 'brief', overrides: Partial<DocumentDeps> = {}) => ResearchDocumentSchema.parse(await readResearchDocument(deps(w, overrides), w.id, document));
/** The refusal, which must be the bare code: no document text, no path, no cause that could carry either. */
async function refusal(w: World, document: DocumentName = 'brief', overrides: Partial<DocumentDeps> = {}): Promise<Error> {
  const error = await readResearchDocument(deps(w, overrides), w.id, document).then(() => { throw new Error('expected a refusal'); }, (failure: unknown) => failure as Error);
  expect(error.message).toMatch(/^[A-Z_]+$/);
  return error;
}
const workspaceFile = (w: World, name = 'BRIEF.md') => join(w.project, 'research', name);
let collectedBrief: string; let collectedEvidence: string; let approvedBrief: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'moonzila-document-'));
  nodeSha256 = digest(await readFile(process.execPath));
  collectedBytes = await readFile(collectedFixture); approvedBytes = await readFile(approvedFixture);
  // The fixtures' documents, through the workspace's own materialisation (hash-checked against each manifest).
  await materialise(collectedBytes, join(root, 'expected-collected')); await materialise(approvedBytes, join(root, 'expected-approved'));
  collectedBrief = await readFile(join(root, 'expected-collected', 'project', 'research', 'BRIEF.md'), 'utf8');
  collectedEvidence = await readFile(join(root, 'expected-collected', 'project', 'research', 'EVIDENCE.md'), 'utf8');
  approvedBrief = await readFile(join(root, 'expected-approved', 'project', 'research', 'BRIEF.md'), 'utf8');
  expect(approvedBrief).not.toBe(collectedBrief);
});
afterAll(async () => { if (root) { const rel = relative(resolve(tmpdir()), root); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(root, { recursive: true, force: true }); } });

// ------------------------------------------------------------------ sources by status

test('collected: the retained collected package, validated in this call, both documents; every call validates again', async () => {
  // Guard: no receipt cache (mutation: remember the first call's bytes and skip verifyRetained).
  const w = await world();
  try {
    expect(await read(w)).toEqual({ text: collectedBrief, truncated: false, source: 'collected', verified: true });
    expect(await read(w, 'evidence')).toEqual({ text: collectedEvidence, truncated: false, source: 'collected', verified: true });
    expect(w.verifications).toBe(2);
  } finally { await w.kit.close(); }
}, 60000);

test('approved: the reviewed package under its bound revision, verified in this call', async () => {
  const w = await world();
  try {
    await approved(w);
    expect(await read(w)).toEqual({ text: approvedBrief, truncated: false, source: 'reviewed', verified: true });
    expect(w.verifications).toBe(1);
  } finally { await w.kit.close(); }
}, 60000);

test('approved: the retained file replaced right after validation still yields the text of the verified buffer', async () => {
  // Guard: text only from the buffer verifyRetained returned (mutation: read storage/artifacts/<sha>.zip again after it).
  const w = await world();
  try {
    await approved(w);
    const retained = join(w.storage, 'artifacts', `${digest(approvedBytes)}.zip`);
    const kit: DocumentDeps['kit'] = { verifyRetained: async (...args) => { const out = await w.kit.verifyRetained(...args); await writeFile(retained, collectedBytes); return out; } };
    expect(await read(w, 'brief', { kit })).toEqual({ text: approvedBrief, truncated: false, source: 'reviewed', verified: true });
    expect(await readFile(retained)).toEqual(collectedBytes);
  } finally { await w.kit.close(); }
}, 60000);

test('approved: a deleted or a tampered reviewed package is a result, verified false with empty text, never an error', async () => {
  // Guard: STALE_VERIFICATION maps to the Unverified result for approved (mutation: map it to DOCUMENT_UNVERIFIED).
  const w = await world();
  try {
    await approved(w);
    const retained = join(w.storage, 'artifacts', `${digest(approvedBytes)}.zip`);
    const tampered = Buffer.from(approvedBytes); tampered[tampered.length - 30]! ^= 0xff;
    await writeFile(retained, tampered);
    expect(await read(w)).toEqual({ text: '', truncated: false, source: 'reviewed', verified: false });
    await unlink(retained);
    expect(await read(w)).toEqual({ text: '', truncated: false, source: 'reviewed', verified: false });
  } finally { await w.kit.close(); }
}, 60000);

test('reviewing, packaging and not_ready read the workspace file, never verified', async () => {
  const w = await world();
  try {
    await reviewing(w);
    await writeFile(workspaceFile(w), 'edited brief\n');
    expect(await read(w)).toEqual({ text: 'edited brief\n', truncated: false, source: 'workspace', verified: false });
    step(w, 'packaging', 'main', { reviewDigest: 'c'.repeat(64) }, 'WORKSPACE_FROZEN');
    expect(await read(w, 'evidence')).toEqual({ text: collectedEvidence, truncated: false, source: 'workspace', verified: false });
    endRun(w); step(w, 'not_ready', 'main', { failure: 'REVIEW_GATE_FAILED' });
    expect(await read(w)).toMatchObject({ text: 'edited brief\n', source: 'workspace' });
    expect(w.verifications).toBe(0);
  } finally { await w.kit.close(); }
}, 60000);

test('an absent workspace folder falls back to the collected package, validated in this call', async () => {
  // Guard: the fallback happens only for an absent job folder (mutation: never fall back -> DOCUMENT_NOT_AVAILABLE).
  const w = await world();
  try {
    await notReady(w, false);
    expect(await read(w)).toEqual({ text: collectedBrief, truncated: false, source: 'collected', verified: true });
    expect(w.verifications).toBe(1);
  } finally { await w.kit.close(); }
}, 60000);

test('a workspace that exists without the document is DOCUMENT_NOT_AVAILABLE, not a fallback', async () => {
  const w = await world();
  try {
    await notReady(w);
    await unlink(workspaceFile(w));
    expect((await refusal(w)).message).toBe('DOCUMENT_NOT_AVAILABLE');
    await rm(w.project, { recursive: true });
    expect((await refusal(w)).message).toBe('DOCUMENT_NOT_AVAILABLE');
    expect(w.verifications).toBe(0);
  } finally { await w.kit.close(); }
}, 60000);

test('statuses with nothing to read are DOCUMENT_NOT_AVAILABLE', async () => {
  const w = await world({ collect: false });
  try {
    expect((await refusal(w)).message).toBe('DOCUMENT_NOT_AVAILABLE');
    step(w, 'dispatching', 'main', { target: { collectorRevision: 1, repository: provenance.identity.repository, workflow: 'collect.yml', ref: provenance.identity.ref } });
    expect((await refusal(w, 'evidence')).message).toBe('DOCUMENT_NOT_AVAILABLE');
  } finally { await w.kit.close(); }
});

// ------------------------------------------------------------------ the workspace read's containment and identity

test('a hard-linked workspace document is DOCUMENT_UNSAFE, and never falls back to the collected package', async () => {
  // Guard: nlink 1 on the lstat and the fstat (mutation: drop both nlink checks).
  const w = await world();
  try {
    await notReady(w);
    await link(workspaceFile(w), join(w.folder, 'second-name.md'));
    expect((await refusal(w)).message).toBe('DOCUMENT_UNSAFE');
    expect(w.verifications).toBe(0);
  } finally { await w.kit.close(); }
}, 60000);

test('a junction at research/, at the job folder or at storage/review is DOCUMENT_UNSAFE, never a fallback', async () => {
  // Guards: each component below the root lstat-checked, and every folder down to the job a real directory (mutation:
  // skip the lstat of research/; skip the walk above the job folder). Junctions on Windows, directory links on Linux.
  const w = await world();
  try {
    await notReady(w);
    const elsewhere = join(w.folder, 'elsewhere'); await mkdir(elsewhere);
    // research/ moved out and linked back: the same bytes, reached through a link.
    await rename(join(w.project, 'research'), join(elsewhere, 'research'));
    await symlink(join(elsewhere, 'research'), join(w.project, 'research'), 'junction');
    expect((await refusal(w)).message).toBe('DOCUMENT_UNSAFE');
    await unlink(join(w.project, 'research')); await rename(join(elsewhere, 'research'), join(w.project, 'research'));
    expect(await read(w)).toMatchObject({ source: 'workspace' });
    // The whole job folder a link to a real workspace elsewhere.
    await rename(w.job, join(elsewhere, w.id));
    await symlink(join(elsewhere, w.id), w.job, 'junction');
    expect((await refusal(w)).message).toBe('DOCUMENT_UNSAFE');
    await unlink(w.job);
    // storage/review itself a link.
    await rename(w.reviewRoot, join(elsewhere, 'review')); await rename(join(elsewhere, w.id), join(elsewhere, 'review', w.id));
    await symlink(join(elsewhere, 'review'), w.reviewRoot, 'junction');
    expect((await refusal(w)).message).toBe('DOCUMENT_UNSAFE');
    expect(w.verifications).toBe(0);
  } finally { await w.kit.close(); }
}, 60000);

test('a workspace document replaced between its lstat and its open is DOCUMENT_UNSAFE', async () => {
  // Guard: the fstat identity must equal the lstat's (mutation: drop the dev/ino comparison).
  const w = await world();
  try {
    await notReady(w);
    const file = workspaceFile(w);
    expect((await readWorkspace(w.reviewRoot, w.id, ['research', 'BRIEF.md']))!.toString('utf8')).toBe(collectedBrief);
    // A new regular file (one link, same name) renamed over the document after its lstat, before its open.
    const replace = async () => { await writeFile(join(w.folder, 'planted.md'), 'planted'); await rename(join(w.folder, 'planted.md'), file); };
    await expect(readWorkspace(w.reviewRoot, w.id, ['research', 'BRIEF.md'], { beforeOpen: replace })).rejects.toThrow('DOCUMENT_UNSAFE');
  } finally { await w.kit.close(); }
}, 60000);

test('a workspace document over 4 MiB is DOCUMENT_TOO_LARGE; exactly 4 MiB is read', async () => {
  // Guard: the 4 MiB bound on the read (mutation: raise MAX_DOCUMENT_BYTES' check to never fire).
  const w = await world();
  try {
    await notReady(w);
    await writeFile(workspaceFile(w), Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x61));
    expect((await refusal(w)).message).toBe('DOCUMENT_TOO_LARGE');
    await writeFile(workspaceFile(w), Buffer.alloc(MAX_DOCUMENT_BYTES, 0x61));
    expect(await read(w)).toMatchObject({ truncated: true, source: 'workspace' });
  } finally { await w.kit.close(); }
}, 60000);

// ------------------------------------------------------------------ redaction, then the cut

const SECRET = 'QZXJ-synthetic-vault-secret-7f3a9c41b2';

test('a synthetic vault secret in BRIEF.md is redacted in the result and absent from every refusal', async () => {
  const w = await world({ secrets: [SECRET] });
  try {
    await notReady(w);
    await writeFile(workspaceFile(w), `before ${SECRET} after\n`);
    expect(await read(w)).toEqual({ text: 'before [redacted] after\n', truncated: false, source: 'workspace', verified: false });
    // The same document behind a refusal: the error is the code alone.
    await link(workspaceFile(w), join(w.folder, 'second-name.md'));
    const error = await refusal(w);
    expect(`${error.message} ${String(error.cause ?? '')} ${error.stack ?? ''}`).not.toContain(SECRET);
    expect(error.cause).toBeUndefined();
  } finally { await w.kit.close(); }
}, 60000);

test('a secret straddling byte 262,144 leaves no prefix of itself in the result', async () => {
  // Guard: redaction before the cut (mutation: cut the decoded text first, then redact the cut text).
  const w = await world({ secrets: [SECRET] });
  try {
    await notReady(w);
    const lead = 'a'.repeat(CAP - 12);
    await writeFile(workspaceFile(w), `${lead}${SECRET}${'b'.repeat(100)}`);
    const result = await read(w);
    expect(result.truncated).toBe(true);
    expect(bytesOf(result.text)).toBeLessThanOrEqual(CAP);
    expect(result.text.startsWith(lead)).toBe(true);
    // The secret spans bytes CAP-12 to CAP+26 of the document; redacted first, its marker and two filler bytes fit.
    expect(result.text.slice(lead.length)).toBe('[redacted]bb');
    for (let k = 2; k <= SECRET.length; k++) expect(result.text).not.toContain(SECRET.slice(0, k));
  } finally { await w.kit.close(); }
}, 60000);

test('a document under the cap that redaction expands past it is cut to the cap and truncated', async () => {
  // Guard: the cap is checked on the redacted text (mutation: decide truncated and cut from the raw size).
  const short = 'k7#';
  const w = await world({ secrets: [short] });
  try {
    await notReady(w);
    const raw = `${short} `.repeat(50_000);
    expect(bytesOf(raw)).toBeLessThan(CAP);
    await writeFile(workspaceFile(w), raw);
    const result = await read(w);
    expect(result.truncated).toBe(true);
    expect(bytesOf(result.text)).toBeLessThanOrEqual(CAP);
    expect(result.text).not.toContain(short);
  } finally { await w.kit.close(); }
}, 60000);

test('redaction unavailable is DOCUMENT_REDACTION_UNAVAILABLE with no text, for the workspace and a verified package', async () => {
  // Guard: a redactor failure refuses (mutation: return the unredacted text when redact throws).
  const w = await world({ secrets: [SECRET], brokenVault: true });
  try {
    await expect(w.vault.redact('x')).rejects.toThrow('REDACTION_UNAVAILABLE');
    let error = await refusal(w);
    expect(error.message).toBe('DOCUMENT_REDACTION_UNAVAILABLE'); expect(error.cause).toBeUndefined();
    await notReady(w);
    await writeFile(workspaceFile(w), `secret ${SECRET}`);
    error = await refusal(w);
    expect(error.message).toBe('DOCUMENT_REDACTION_UNAVAILABLE'); expect(error.cause).toBeUndefined();
  } finally { await w.kit.close(); }
}, 60000);

test('multibyte text at the 262,144-byte boundary is cut before the character, valid UTF-8, truncated', async () => {
  // Guard: the cut backs off continuation bytes (mutation: cut at exactly 262,144 bytes).
  const w = await world();
  try {
    await notReady(w);
    const lead = 'a'.repeat(CAP - 1);
    await writeFile(workspaceFile(w), `${lead}€${'z'.repeat(10)}`);
    const result = await read(w);
    expect(result).toEqual({ text: lead, truncated: true, source: 'workspace', verified: false });
    expect(Buffer.from(result.text, 'utf8').toString('utf8')).toBe(result.text);
    expect(result.text).not.toContain('�');
  } finally { await w.kit.close(); }
}, 60000);

test('cutUtf8 never splits a character and keeps text at or under the cap whole', () => {
  expect(cutUtf8('abc', 3)).toEqual({ text: 'abc', truncated: false });
  expect(cutUtf8('ab€', 4)).toEqual({ text: 'ab', truncated: true });
  expect(cutUtf8('ab😀c', 5)).toEqual({ text: 'ab', truncated: true });
  expect(cutUtf8('ab😀c', 6)).toEqual({ text: 'ab😀', truncated: true });
});

// ------------------------------------------------------------------ the validator

test('a deleted collected package is DOCUMENT_UNVERIFIED, for a collected job and for the fallback; no document text', async () => {
  // Guard: STALE_VERIFICATION maps to DOCUMENT_UNVERIFIED for the collected source (mutation: let STALE_VERIFICATION through).
  const w = await world();
  try {
    await unlink(join(w.storage, 'artifacts', `${digest(collectedBytes)}.zip`));
    const error = await refusal(w);
    expect(error.message).toBe('DOCUMENT_UNVERIFIED'); expect(error.cause).toBeUndefined();
    await notReady(w, false);
    expect((await refusal(w, 'evidence')).message).toBe('DOCUMENT_UNVERIFIED');
  } finally { await w.kit.close(); }
}, 60000);

test('a validator that cannot run is RESEARCH_KIT_UNAVAILABLE, for collected and approved alike, never Unverified', async () => {
  // Guard: INSTALLATION_INVALID maps to RESEARCH_KIT_UNAVAILABLE (mutation: map every verifyRetained failure as stale).
  const broken = await world({ nodeSha256: 'f'.repeat(64) });
  try {
    const error = await refusal(broken);
    expect(error.message).toBe('RESEARCH_KIT_UNAVAILABLE'); expect(error.cause).toBeUndefined();
    expect((await refusal(broken, 'brief', { kit: null })).message).toBe('RESEARCH_KIT_UNAVAILABLE');
  } finally { await broken.kit.close(); }
  const w = await world();
  try {
    await approved(w);
    const kit: DocumentDeps['kit'] = { verifyRetained: () => Promise.reject(new Error('INSTALLATION_INVALID')) };
    expect((await refusal(w, 'brief', { kit })).message).toBe('RESEARCH_KIT_UNAVAILABLE');
    expect((await refusal(w, 'brief', { kit: null })).message).toBe('RESEARCH_KIT_UNAVAILABLE');
  } finally { await w.kit.close(); }
}, 60000);
