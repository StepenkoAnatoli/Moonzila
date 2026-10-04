import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { CommandBroker, type CommandContext } from '../src/main/commands';
import { canonicalHash } from '../src/engine/policy';
import { safeCommandEnvironment, spawnOwned } from '../src/tools/commands';

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'moonzila-broker-')); directories.push(root);
  const project = join(root, 'project'); await mkdir(project);
  const context: CommandContext = {
    run: { id: 'r', projectId: 'p', mode: 'build', status: 'running', trustRevision: 1, policyRevision: 1 },
    project: { id: 'p', rootPath: project, trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'off' } },
  };
  let dispatched = 0;
  let admitted!: () => void; const started = new Promise<void>(resolve => { admitted = resolve; });
  const broker = new CommandBroker({ context: async () => context, environment: { ...safeCommandEnvironment(), PATH: dirname(process.execPath), OPENAI_API_KEY: 'must-not-leak' }, protectedRoots: [], execute: async (request, signal) => { dispatched++; admitted(); return spawnOwned(request, signal); }, redact: async text => text });
  return { root, project, context, broker, started, dispatched: () => dispatched };
}
function approve(f: Awaited<ReturnType<typeof fixture>>, input: unknown) {
  const inputHash = canonicalHash(input);
  f.context.operation = { id: 'op', runId: 'r', projectId: 'p', kind: 'command', status: 'started', inputHash, trustRevision: 1, policyRevision: 1, input };
  f.context.approval = { operationId: 'op', projectId: 'p', inputHash, trustRevision: 1, policyRevision: 1, decision: 'allow' };
}
test('preparation has no effects; exact approval runs a real command once and preserves failure evidence', async () => {
  const f = await fixture();
  const plan = await f.broker.prepare('r', { program: 'node', args: ['-e', 'require("fs").writeFileSync("result.txt","done");console.log(process.env.OPENAI_API_KEY??"no secret");process.exitCode=7'] }, new AbortController().signal);
  expect(f.dispatched()).toBe(0); await expect(readFile(join(f.project, 'result.txt'))).rejects.toThrow();
  expect(plan.env.OPENAI_API_KEY).toBeUndefined();
  approve(f, plan);
  const result = await f.broker.execute('r', 'op', new AbortController().signal);
  expect(result.code).toBe(7); expect(result.output).toContain('no secret');
  expect(await readFile(join(f.project, 'result.txt'), 'utf8')).toBe('done');
  await expect(f.broker.execute('r', 'op', new AbortController().signal)).rejects.toThrow('COMMAND_ALREADY_STARTED');
  expect(f.dispatched()).toBe(1);
});
test('missing, denied, stale or changed approvals cannot dispatch', async () => {
  const f = await fixture(); const signal = new AbortController().signal;
  const plan = await f.broker.prepare('r', { program: 'node', args: ['--version'] }, signal);
  await expect(f.broker.execute('r', 'op', signal)).rejects.toThrow('APPROVAL_STALE');
  approve(f, plan); f.context.approval!.decision = 'deny';
  await expect(f.broker.execute('r', 'op', signal)).rejects.toThrow('APPROVAL_STALE');
  approve(f, { ...plan, args: ['-e', 'process.exit(3)'] }); f.context.operation!.inputHash = canonicalHash(plan);
  await expect(f.broker.execute('r', 'op', signal)).rejects.toThrow('APPROVAL_STALE');
  approve(f, plan); f.context.project.trustRevision++;
  await expect(f.broker.execute('r', 'op', signal)).rejects.toThrow('RUN_CANCELLED');
  expect(f.dispatched()).toBe(0);
});
test('modes, revoked trust, escaping cwd and project PATH executable shadowing fail closed', async () => {
  const f = await fixture(); const signal = new AbortController().signal;
  await expect(f.broker.prepare('r', { program: 'node', args: [], cwd: '../outside' }, signal)).rejects.toThrow();
  f.context.run.mode = 'ask';
  await expect(f.broker.prepare('r', { program: 'node', args: [] }, signal)).rejects.toThrow('MODE_RESTRICTED');
  f.context.run.mode = 'build'; f.context.project.trusted = false;
  await expect(f.broker.prepare('r', { program: 'node', args: [] }, signal)).rejects.toThrow('PROJECT_UNTRUSTED');
  f.context.project.trusted = true;
  await writeFile(join(f.project, 'node.exe'), 'fake');
  const broker = new CommandBroker({ context: async () => f.context, environment: { PATH: f.project }, protectedRoots: [], execute: spawnOwned, redact: async text => text });
  await expect(broker.prepare('r', { program: 'node', args: [] }, signal)).rejects.toThrow('COMMAND_UNAVAILABLE');
});
test('Stop waits for native command termination and timeouts remain explicit', async () => {
  const f = await fixture(); const stop = new AbortController();
  const plan = await f.broker.prepare('r', { program: 'node', args: ['-e', 'setInterval(()=>{},1000)'], timeoutSeconds: 1 }, stop.signal);
  approve(f, plan);
  const pending = f.broker.execute('r', 'op', stop.signal);
  await Promise.race([f.started, pending.then(() => { throw new Error('Command ended before dispatch was observed'); })]); stop.abort();
  expect((await pending).cancelled).toBe(true);
});
test('an executable modified after review is rejected before dispatch', async () => {
  const f = await fixture(); const installed = join(f.root, 'installed'); await mkdir(installed);
  const executable = join(installed, 'node.exe'); await writeFile(executable, 'original executable fixture');
  let dispatched = false;
  const broker = new CommandBroker({ context: async () => f.context, environment: { PATH: installed }, protectedRoots: [], execute: async () => { dispatched = true; throw new Error('Must not execute'); }, redact: async text => text });
  const signal = new AbortController().signal;
  const plan = await broker.prepare('r', { program: 'node', args: [] }, signal); approve(f, plan);
  await writeFile(executable, 'changed');
  await expect(broker.execute('r', 'op', signal)).rejects.toThrow('COMMAND_CHANGED'); expect(dispatched).toBe(false);
});
test('npm uses the installed Node and npm CLI with literal arguments and no implicit cmd shell', async () => {
  const f = await fixture(); const signal = new AbortController().signal;
  const plan = await f.broker.prepare('r', { program: 'npm', args: ['--version'] }, signal);
  expect(plan.executable.toLowerCase()).toMatch(/node\.exe$/); expect(plan.args[0]).toMatch(/npm-cli\.js$/); expect(plan.files).toHaveLength(2);
  approve(f, plan); const result = await f.broker.execute('r', 'op', signal);
  expect(result.code).toBe(0); expect(result.output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
});

test('a trusted root alias uses the same canonical working directory at approval and execution', async () => {
  const f = await fixture(); const alias = join(f.root, 'project-alias'); await symlink(f.project, alias, 'junction');
  f.context.project.rootPath = alias;
  await mkdir(join(f.project, 'subfolder'));
  const signal = new AbortController().signal;
  const plan = await f.broker.prepare('r', { program: 'node', args: ['-e', 'require("fs").writeFileSync("result.txt","aliased root")'], cwd: 'subfolder' }, signal);
  expect(plan.cwd).toBe(await realpath(join(f.project, 'subfolder'))); approve(f, plan);
  expect((await f.broker.execute('r', 'op', signal)).code).toBe(0);
  expect(await readFile(join(f.project, 'subfolder', 'result.txt'), 'utf8')).toBe('aliased root');
});

test('canonical executable resolution cannot bypass project and protected-root exclusions through aliases', async () => {
  const f = await fixture(); const alias = join(f.root, 'project-alias'); await symlink(f.project, alias, 'junction');
  await writeFile(join(f.project, 'node.exe'), 'project executable'); f.context.project.rootPath = alias;
  const signal = new AbortController().signal;
  const broker = new CommandBroker({ context: async () => f.context, environment: { PATH: alias }, protectedRoots: [], execute: spawnOwned, redact: async text => text });
  await expect(broker.prepare('r', { program: 'node', args: [] }, signal)).rejects.toThrow('COMMAND_UNAVAILABLE');
  const outside = join(f.root, 'protected'); await mkdir(outside); await writeFile(join(outside, 'node.exe'), 'protected executable');
  const protectedAlias = join(f.root, 'protected-alias'); await symlink(outside, protectedAlias, 'junction');
  const protectedBroker = new CommandBroker({ context: async () => f.context, environment: { PATH: outside }, protectedRoots: [protectedAlias], execute: spawnOwned, redact: async text => text });
  await expect(protectedBroker.prepare('r', { program: 'node', args: [] }, signal)).rejects.toThrow('COMMAND_UNAVAILABLE');
});

test('working-directory protection compares canonical ancestors of protected aliases', async () => {
  const f = await fixture(); const alias = join(f.root, 'protected-alias'); await symlink(f.project, alias, 'junction');
  const broker = new CommandBroker({ context: async () => f.context, environment: { PATH: dirname(process.execPath) }, protectedRoots: [alias], execute: spawnOwned, redact: async text => text });
  await expect(broker.prepare('r', { program: 'node', args: [] }, new AbortController().signal)).rejects.toThrow('PATH_OUTSIDE_PROJECT');
});
test('redaction expansion and control characters cannot exceed private reply or event bounds', async () => {
  const f = await fixture(); const signal = new AbortController().signal;
  const broker = new CommandBroker({ context: async () => f.context, environment: { PATH: dirname(process.execPath) }, protectedRoots: [], execute: async () => ({ status: 'exited', code: 0, output: '\u0001'.repeat(60000), truncated: false, cancelled: false, timedOut: false }), redact: async text => text.repeat(3) });
  const plan = await broker.prepare('r', { program: 'node', args: [] }, signal); approve(f, plan);
  const result = await broker.execute('r', 'op', signal);
  expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(60000);
  expect(JSON.stringify(result).length).toBeLessThan(262144); expect(result.truncated).toBe(true);
});
