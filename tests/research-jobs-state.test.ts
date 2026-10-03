import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, test } from 'vitest';
import { Store, type StoreResearchActor, type StoreResearchPatch, type StoreResearchStatus } from '../src/engine/store';
import { Application } from '../src/engine/application';
import { ResearchJobs } from '../src/engine/research';
import { ControlSchema, FromEngineSchema } from '../src/engine/control';
import { ResearchSchema, ResearchStatusSchema, type MethodName, type MethodParams, type MethodResult, type Research } from '../src/shared';
import { safeError } from '../src/main/bridge';

const at = '2026-10-02T00:00:00.000Z';
const roots: string[] = []; const stores: Store[] = [];
afterEach(() => { stores.splice(0).forEach(s => s.close()); roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function tempPath(prefix = 'moon-research-') { const root = mkdtempSync(join(tmpdir(), prefix)); roots.push(root); return join(root, 'state.sqlite'); }
function open(path = tempPath()) { const store = new Store(path); stores.push(store); return { store, path }; }
function project(store: Store, research: 'off' | 'public-technical' = 'public-technical', id = 'p') {
  store.putProject({ id, name: id, rootPath: `C:\\work\\${id}`, pathLabel: id, trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research }, missing: false, createdAt: at });
}
const inputs = { queries: [], urls: [], preferDomains: [], depth: 'quick', maxPages: 8 };
const target = { collectorRevision: 1, repository: 'owner/collector', workflow: 'collect.yml', ref: 'main' };
const verification = (jobRevision = 3, projectRevision = 1, workflowRunId = '5', clientRef = 'mz-j1') => ({ artifactSha256: 'a'.repeat(64), artifactBytes: 18127, validatorRevision: 'b'.repeat(40), nodeSha256: 'c'.repeat(64), state: 'REVIEW_IN_PROGRESS' as const,
  jobRevision, projectRevision, repository: 'owner/collector', ref: 'main', workflow: 'collect.yml', commit: 'd'.repeat(40), runAttempt: 1, workflowRunId, clientRef, downloadDigest: 'unverified' as const });
function create(store: Store, id = 'j1', projectId = 'p') {
  return store.createResearch({ id, projectId, topic: 'Ollama context limits', inputs, clientRef: `mz-${id}`, researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
}
function step(store: Store, id: string, to: StoreResearchStatus, actor: StoreResearchActor = 'main', patch?: StoreResearchPatch) {
  const current = store.getResearch(id)!;
  return store.transitionResearch({ researchId: id, expectedRevision: current.revision, to, actor, cause: 'TEST_STEP', patch });
}
// Fixture setup and inspection only: per-statement fsyncs here cost seconds on a busy Windows runner and test nothing.
// The Store under test opens its own connection with its production durability settings.
function raw(path: string) { const db = new Database(path); db.pragma('synchronous = OFF'); return db; }

// Independent restatement of the plan's Task 2 edge table; the test must not import the code's table.
const EXPECTED: Array<[StoreResearchStatus, StoreResearchStatus, StoreResearchActor[]]> = [
  ['queued', 'dispatching', ['main']], ['queued', 'failed', ['main']], ['queued', 'cancelled', ['user']],
  ['dispatching', 'collecting', ['main']], ['dispatching', 'failed', ['main', 'recovery']], ['dispatching', 'cancelling', ['user']],
  ['collecting', 'collected', ['main']], ['collecting', 'failed', ['main']], ['collecting', 'cancelling', ['user']],
  ['reviewing', 'cancelling', ['user']], ['cancelling', 'cancelled', ['main', 'recovery']],
];
const minimalPatch = (to: StoreResearchStatus, n: number): StoreResearchPatch | undefined => to === 'dispatching' ? { target } : to === 'collecting' ? { workflowRunId: String(5000 + n) } : to === 'failed' ? { failure: 'TEST_FAILURE' } : to === 'collected' ? { verification: verification(3, 1, String(1000 + n), `mz-j${n - 1}`) } : undefined;

describe('schema v3 migration', () => {
  test('a v2 database upgrades to v3, keeps every row and quarantines legacy research rows verbatim', () => {
    const path = tempPath('moon-v2-');
    const db = raw(path); db.exec(readFileSync(new URL('./fixtures/schema-v2.sql', import.meta.url), 'utf8'));
    db.exec(`INSERT INTO projects VALUES ('p','Project','C:/project','Project',1,1,'{"revision":1,"inference":"local-only","research":"off"}',0,'${at}');
      INSERT INTO sessions VALUES ('s','p','Old conversation','${at}','${at}','{"revision":0,"inference":"cloud-allowed"}');
      INSERT INTO profile_revisions VALUES ('v','m','Local','ollama','http://localhost:11434','test',8192,512,'local',NULL,1,'${at}','${at}');
      INSERT INTO profiles VALUES ('m','v');
      INSERT INTO runs VALUES ('r','s','p','build','completed','m','v',1,1,'${at}','${at}',2,0);
      INSERT INTO messages (id,session_id,run_id,role,content,created_at) VALUES ('msg','s','r','user','upgrade searchable','${at}');
      INSERT INTO events VALUES ('r',1,1,'epoch','run.completed','{}',1);
      INSERT INTO operations (id,run_id,project_id,kind,input_hash,policy_revision,trust_revision,status,input,created_at,updated_at) VALUES ('op','r','p','write','hash',1,1,'completed','{}','${at}','${at}');
      INSERT INTO approvals VALUES ('approval','op','p','hash',1,1,'allow','${at}');
      INSERT INTO missions VALUES ('mission','p','Build','paused',1,'{"tasks":[]}','${at}','${at}');
      INSERT INTO research VALUES ('legacy-run','p','r','sufficient','{"clientRef":"opaque"}','${at}','${at}');
      INSERT INTO research VALUES ('legacy-free','p',NULL,'collecting','{}','${at}','${at}');`);
    const before = db.prepare('SELECT * FROM research ORDER BY id').all(); db.close();
    const { store } = open(path);
    expect(store.listMessages('s')[0]?.content).toBe('upgrade searchable');
    expect(store.events('r', 0, 100).events).toHaveLength(1);
    expect(store.listApprovals('op')).toHaveLength(1);
    expect(store.searchHistory('p', 'searchable')).toHaveLength(1);
    expect(store.getMission('mission')?.state).toEqual({ tasks: [] });
    expect(store.listResearch('p')).toEqual([]);
    const check = raw(path);
    expect(check.pragma('user_version', { simple: true })).toBe(3);
    expect(check.prepare('SELECT * FROM research_legacy ORDER BY id').all()).toEqual(before);
    expect(check.pragma('foreign_key_check')).toEqual([]);
    const columns = (check.prepare("SELECT name FROM pragma_table_info('research')").all() as { name: string }[]).map(c => c.name);
    expect(columns).toEqual(['id', 'project_id', 'revision', 'status', 'topic', 'inputs', 'client_ref', 'research_level', 'policy_revision', 'trust_revision', 'collector_revision', 'repository', 'workflow', 'ref', 'dispatched_at', 'workflow_run_id', 'failure', 'created_at', 'updated_at']);
    check.close();
    store.putProject({ ...store.getProject('p')!, policy: { revision: 2, inference: 'local-only', research: 'public-technical' } });
    create(store, 'j-after-upgrade');
    store.deleteProject('p');
    const after = raw(path);
    for (const table of ['research', 'research_events', 'research_legacy']) expect(after.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    after.close();
  });

  test('a failed v2 upgrade rolls back to v2 with the old rows and no v3 objects', () => {
    const path = tempPath('moon-v2-bad-');
    const db = raw(path); db.exec(readFileSync(new URL('./fixtures/schema-v2.sql', import.meta.url), 'utf8'));
    db.pragma('foreign_keys = OFF');
    db.exec(`INSERT INTO research VALUES ('dangling','absent',NULL,'queued','{}','${at}','${at}')`); db.close();
    expect(() => new Store(path)).toThrow('MIGRATION_FOREIGN_KEY_FAILURE');
    const check = raw(path);
    expect(check.pragma('user_version', { simple: true })).toBe(2);
    expect(check.prepare('SELECT id FROM research').get()).toEqual({ id: 'dangling' });
    expect(check.prepare("SELECT name FROM pragma_table_info('research') WHERE name='client_ref'").get()).toBeUndefined();
    expect(check.prepare("SELECT name FROM sqlite_master WHERE name IN ('research_legacy','research_events')").all()).toEqual([]);
    check.close();
  });

  test('v1, v2 and fresh databases all reach the same v3 research schema', () => {
    const research = (path: string) => {
      const db = raw(path);
      const rows = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE tbl_name IN ('research','research_events','research_legacy') ORDER BY name").all();
      const version = db.pragma('user_version', { simple: true }); db.close(); return { rows, version };
    };
    const fromVersion = (fixture: string) => {
      const path = tempPath('moon-chain-'); const db = raw(path);
      db.exec(readFileSync(new URL(`./fixtures/${fixture}`, import.meta.url), 'utf8')); db.close();
      open(path).store.close(); return research(path);
    };
    const fresh = open(); fresh.store.close();
    const v1 = fromVersion('schema-v1.sql'); const v2 = fromVersion('schema-v2.sql'); const empty = research(fresh.path);
    expect(v1.version).toBe(3); expect(v2.version).toBe(3); expect(empty.version).toBe(3);
    expect(v1.rows.length).toBeGreaterThan(5);
    expect(v1.rows).toEqual(v2.rows); expect(empty.rows).toEqual(v2.rows);
  });

  test('the frozen status literal in SQL matches the shared status vocabulary', () => {
    const { path, store } = open(); store.close();
    const db = raw(path);
    for (const table of ['research', 'research_events']) {
      const sql = (db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(table) as { sql: string }).sql;
      const list = /status IN \(([^)]*)\)/.exec(sql)![1]!;
      expect(list.split(',').map(s => s.trim().replaceAll("'", ''))).toEqual(ResearchStatusSchema.options);
    }
    db.close();
  });
});

describe('database constraints', () => {
  function setup() { const { store, path } = open(); project(store); project(store, 'public-technical', 'p2'); store.close(); const db = raw(path); db.pragma('foreign_keys = ON'); return db; }
  const insert = (db: Database.Database, values: Partial<Record<string, unknown>> = {}) => {
    const row = { id: 'j', project_id: 'p', revision: 1, status: 'queued', topic: 't', inputs: '{}', client_ref: 'mz-j', research_level: 'public-technical', policy_revision: 1, trust_revision: 1, created_at: at, updated_at: at, ...values };
    db.prepare(`INSERT INTO research (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
    db.prepare("INSERT INTO research_events (research_id,revision,from_status,to_status,actor,cause,detail,engine_epoch,at) VALUES (?,1,NULL,'queued','user','START','{}','e',0)").run(row.id);
  };
  const journal = (db: Database.Database, revision: number, from: string, to: string, id = 'j') => db.prepare("INSERT INTO research_events (research_id,revision,from_status,to_status,actor,cause,detail,engine_epoch,at) VALUES (?,?,?,?,'main','TEST','{}','e',0)").run(id, revision, from, to);

  test('refuses writes that would create, skip or rewrite state outside the journal', () => {
    const db = setup();
    expect(() => insert(db, { status: 'approved' })).toThrow('RESEARCH_WRITE_INVALID');
    expect(() => insert(db, { revision: 2 })).toThrow('RESEARCH_WRITE_INVALID');
    expect(() => insert(db, { client_ref: '-bad' })).toThrow(/CHECK/);
    insert(db);
    expect(() => insert(db, { id: 'j2', project_id: 'p2' })).toThrow(/UNIQUE.*client_ref/);
    expect(() => insert(db, { id: 'j2', client_ref: 'mz-j2' })).toThrow(/UNIQUE.*project_id/);
    expect(() => db.prepare("UPDATE research SET status='cancelled', revision=2 WHERE id='j'").run()).toThrow('RESEARCH_TRANSITION_UNJOURNALED');
    expect(() => journal(db, 3, 'queued', 'cancelled')).toThrow('STALE_REVISION');
    expect(() => journal(db, 2, 'queued', 'queued')).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE research_events SET cause='OTHER' WHERE research_id='j'").run()).toThrow('RESEARCH_JOURNAL_APPEND_ONLY');
    expect(() => db.prepare("DELETE FROM research_events WHERE research_id='j'").run()).toThrow('RESEARCH_JOURNAL_APPEND_ONLY');
    expect(() => db.prepare(`INSERT INTO research (id,project_id,revision,status,topic,inputs,client_ref,research_level,policy_revision,trust_revision,created_at,updated_at) VALUES ('j','p',1,'queued','changed','{}','mz-j','public-technical',1,1,'${at}','${at}') ON CONFLICT(id) DO UPDATE SET topic=excluded.topic`).run()).toThrow(/RESEARCH_IDENTITY_IMMUTABLE|RESEARCH_TRANSITION_UNJOURNALED/);
    db.close();
  });

  test('enforces dispatch identity, write-once fields and the single-dispatch rule in SQL', () => {
    const db = setup(); insert(db);
    journal(db, 2, 'queued', 'dispatching');
    db.prepare(`UPDATE research SET revision=2,status='dispatching',collector_revision=1,repository='o/c',workflow='collect.yml',ref='main',dispatched_at='${at}' WHERE id='j'`).run();
    journal(db, 3, 'dispatching', 'collecting');
    expect(() => db.prepare("UPDATE research SET revision=3,status='collecting' WHERE id='j'").run()).toThrow(/CHECK/);
    for (const bad of ['0123', '12a']) expect(() => db.prepare("UPDATE research SET revision=3,status='collecting',workflow_run_id=? WHERE id='j'").run(bad)).toThrow(/CHECK/);
    db.prepare("UPDATE research SET revision=3,status='collecting',workflow_run_id='77' WHERE id='j'").run();
    journal(db, 4, 'collecting', 'failed');
    expect(() => db.prepare("UPDATE research SET revision=4,status='failed',failure='bad text' WHERE id='j'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE research SET revision=4,status='failed',failure='X_CODE',workflow_run_id='78' WHERE id='j'").run()).toThrow('RESEARCH_IDENTITY_IMMUTABLE');
    expect(() => db.prepare("UPDATE research SET revision=4,status='failed',failure='X_CODE',repository='o/other' WHERE id='j'").run()).toThrow('RESEARCH_IDENTITY_IMMUTABLE');
    db.exec('DROP TRIGGER research_events_step');
    expect(() => journal(db, 9, 'queued', 'dispatching')).toThrow(/UNIQUE.*research_events/);
    db.close();
  });

  test('approved is unreachable in v3 even with a matching journal row', () => {
    const db = setup(); insert(db);
    db.exec('DROP TRIGGER research_events_step');
    journal(db, 2, 'queued', 'approved');
    expect(() => db.prepare("UPDATE research SET revision=2,status='approved' WHERE id='j'").run()).toThrow(/RESEARCH_READINESS_RESERVED|CHECK/);
    db.close();
  });
});

describe('store transitions', () => {
  test('create journals revision 1 and a full collection path stays contiguous', () => {
    const { store } = open(); project(store);
    const created = create(store);
    expect(created.research).toMatchObject({ revision: 1, status: 'queued', clientRef: 'mz-j1' });
    step(store, 'j1', 'dispatching', 'main', { target });
    step(store, 'j1', 'collecting', 'main', { workflowRunId: '101' });
    const done = step(store, 'j1', 'collected', 'main', { verification: verification(3, 1, '101') });
    expect(done.research).toMatchObject({ revision: 4, status: 'collected', workflowRunId: '101', repository: 'owner/collector' });
    const journal = store.researchEvents('j1').events;
    expect(journal.map(e => [e.revision, e.from ?? null, e.to])).toEqual([[1, null, 'queued'], [2, 'queued', 'dispatching'], [3, 'dispatching', 'collecting'], [4, 'collecting', 'collected']]);
    expect(journal[0]).toMatchObject({ actor: 'user', cause: 'START' });
  });

  test('a stale expected revision changes nothing, and only one of two racing dispatches wins', () => {
    const { store } = open(); project(store); create(store);
    const before = { job: store.getResearch('j1'), journal: store.researchEvents('j1') };
    expect(() => store.transitionResearch({ researchId: 'j1', expectedRevision: 5, to: 'dispatching', actor: 'main', cause: 'DISPATCH', patch: { target } })).toThrow('STALE_REVISION');
    expect({ job: store.getResearch('j1'), journal: store.researchEvents('j1') }).toEqual(before);
    store.transitionResearch({ researchId: 'j1', expectedRevision: 1, to: 'dispatching', actor: 'main', cause: 'DISPATCH', patch: { target } });
    expect(() => store.transitionResearch({ researchId: 'j1', expectedRevision: 1, to: 'dispatching', actor: 'main', cause: 'DISPATCH', patch: { target } })).toThrow('STALE_REVISION');
    expect(store.researchEvents('j1').events.filter(e => e.to === 'dispatching')).toHaveLength(1);
  });

  test('a rollback after a transition removes the row change and the journal row together', () => {
    const { store } = open(); project(store); create(store);
    expect(() => store.transaction(() => { step(store, 'j1', 'cancelled', 'user'); throw new Error('rollback'); })).toThrow('rollback');
    expect(store.getResearch('j1')).toMatchObject({ revision: 1, status: 'queued' });
    expect(store.researchEvents('j1').events).toHaveLength(1);
  });

  test('a job, its revision and its journal survive reopening and continue at n+1', () => {
    const path = tempPath(); const first = new Store(path);
    project(first); create(first); step(first, 'j1', 'dispatching', 'main', { target }); first.close();
    const { store } = open(path);
    expect(store.getResearch('j1')).toMatchObject({ revision: 2, status: 'dispatching' });
    step(store, 'j1', 'collecting', 'main', { workflowRunId: '9007199254740991' });
    expect(store.researchEvents('j1').events.map(e => e.revision)).toEqual([1, 2, 3]);
  });

  test('exactly the planned edges succeed, for every from-state, to-state and actor', () => {
    const reachable: StoreResearchStatus[] = ['queued', 'dispatching', 'collecting', 'collected', 'cancelling', 'cancelled', 'failed'];
    const actors: StoreResearchActor[] = ['user', 'main', 'recovery'];
    const { store } = open(); let n = 0;
    // One outer transaction: each refused attempt still rolls back only its own savepoint, and the 210 cases cost one
    // durable commit instead of about 750 fsyncs, which took over 15 s on a Windows CI disk.
    store.transaction(() => { for (const from of reachable) for (const to of ResearchStatusSchema.options) for (const actor of actors) {
      const projectId = `p${n}`; const id = `j${n++}`;
      project(store, 'public-technical', projectId);
      store.transaction(() => {
        store.createResearch({ id, projectId, topic: 't', inputs, clientRef: `mz-${id}`, researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
      });
      const paths: Record<string, Array<[StoreResearchStatus, StoreResearchActor, StoreResearchPatch?]>> = {
        queued: [], dispatching: [['dispatching', 'main', { target }]], collecting: [['dispatching', 'main', { target }], ['collecting', 'main', { workflowRunId: String(1000 + n) }]],
        collected: [['dispatching', 'main', { target }], ['collecting', 'main', { workflowRunId: String(1000 + n) }], ['collected', 'main', { verification: verification(3, 1, String(1000 + n), `mz-${id}`) }]],
        cancelling: [['dispatching', 'main', { target }], ['cancelling', 'user']], cancelled: [['cancelled', 'user']], failed: [['failed', 'main', { failure: 'TEST_FAILURE' }]],
      };
      for (const [next, by, patch] of paths[from]!) step(store, id, next, by, patch);
      const allowed = EXPECTED.some(([f, t, a]) => f === from && t === to && a.includes(actor));
      const before = store.getResearch(id)!;
      const attempt = () => store.transitionResearch({ researchId: id, expectedRevision: before.revision, to, actor, cause: 'MATRIX', patch: minimalPatch(to, n) });
      if (allowed) expect(attempt, `${from}->${to} by ${actor}`).not.toThrow();
      else {
        expect(attempt, `${from}->${to} by ${actor}`).toThrow(/RESEARCH_TRANSITION_INVALID|RESEARCH_READINESS_RESERVED/);
        expect(store.getResearch(id)).toEqual(before);
      }
    } });
  });

  test('patches must carry exactly what the edge needs', () => {
    const { store } = open(); project(store); create(store);
    expect(() => step(store, 'j1', 'dispatching', 'main')).toThrow('RESEARCH_TRANSITION_INVALID');
    expect(() => step(store, 'j1', 'failed', 'main')).toThrow('RESEARCH_TRANSITION_INVALID');
    step(store, 'j1', 'dispatching', 'main', { target });
    expect(() => step(store, 'j1', 'collecting', 'main')).toThrow('RESEARCH_TRANSITION_INVALID');
    expect(() => step(store, 'j1', 'collecting', 'main', { workflowRunId: '5', target })).toThrow('RESEARCH_TRANSITION_INVALID');
    step(store, 'j1', 'collecting', 'main', { workflowRunId: '5' });
    expect(() => step(store, 'j1', 'failed', 'main', { failure: 'X_CODE', workflowRunId: '6' })).toThrow('RESEARCH_TRANSITION_INVALID');
  });

  test('collected needs a verification bound to the job revision it leaves and the admitted policy revision, and journals it', () => {
    const { store } = open(); project(store); create(store);
    step(store, 'j1', 'dispatching', 'main', { target });
    step(store, 'j1', 'collecting', 'main', { workflowRunId: '5' });
    expect(() => step(store, 'j1', 'collected')).toThrow('RESEARCH_TRANSITION_INVALID');
    for (const stale of [verification(2), verification(4), verification(3, 2)]) expect(() => step(store, 'j1', 'collected', 'main', { verification: stale })).toThrow('RESEARCH_TRANSITION_INVALID');
    expect(() => step(store, 'j1', 'failed', 'main', { failure: 'X_CODE', verification: verification() })).toThrow('RESEARCH_TRANSITION_INVALID');
    expect(store.getResearch('j1')).toMatchObject({ revision: 3, status: 'collecting' });
    step(store, 'j1', 'collected', 'main', { verification: verification() });
    expect(store.researchEvents('j1').events.at(-1)).toMatchObject({ revision: 4, to: 'collected', detail: { verification: verification() } });
  });

  test('collected refuses a verification naming another run, client ref, repository or ref than the job\'s', () => {
    const { store } = open(); project(store); create(store);
    step(store, 'j1', 'dispatching', 'main', { target: { ...target, repository: 'Owner/Collector', ref: 'refs/heads/main' } });
    step(store, 'j1', 'collecting', 'main', { workflowRunId: '5' });
    for (const other of [{ workflowRunId: '6' }, { clientRef: 'mz-j2' }, { repository: 'owner/other' }, { repository: 'other/collector' }, { ref: 'refs/heads/main' }, { ref: 'release' }])
      expect(() => step(store, 'j1', 'collected', 'main', { verification: { ...verification(), ...other } }), JSON.stringify(other)).toThrow('RESEARCH_TRANSITION_INVALID');
    expect(store.getResearch('j1')).toMatchObject({ revision: 3, status: 'collecting' });
    // GitHub's repository casing and the short ref name the run reports are the job's own target.
    step(store, 'j1', 'collected', 'main', { verification: verification() });
    expect(store.getResearch('j1')).toMatchObject({ status: 'collected' });
  });

  test('a cancel that races the run-id print can still record the run id', () => {
    const { store } = open(); project(store); create(store);
    step(store, 'j1', 'dispatching', 'main', { target });
    step(store, 'j1', 'cancelling', 'user');
    const done = step(store, 'j1', 'cancelled', 'main', { workflowRunId: '4242' });
    expect(done.research).toMatchObject({ status: 'cancelled', workflowRunId: '4242' });
  });

  test('a new job is allowed once the previous one is terminal', () => {
    const { store } = open(); project(store); create(store);
    expect(() => create(store, 'j2')).toThrow('RUN_ACTIVE');
    step(store, 'j1', 'cancelled', 'user');
    expect(create(store, 'j2').research.status).toBe('queued');
  });
});

describe('restart reconciliation and never dispatching twice', () => {
  test('recover handles every state exactly once and skips owned and unreadable rows', () => {
    const path = tempPath(); const seed = new Store(path);
    const states: StoreResearchStatus[] = ['queued', 'dispatching', 'collecting', 'collected', 'cancelling', 'cancelled', 'failed'];
    for (const state of states) { project(seed, 'public-technical', `p-${state}`); seed.createResearch({ id: state, projectId: `p-${state}`, topic: 't', inputs, clientRef: `mz-${state}`, researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' }); }
    const via: Record<string, Array<[StoreResearchStatus, StoreResearchActor, StoreResearchPatch?]>> = {
      dispatching: [['dispatching', 'main', { target }]], collecting: [['dispatching', 'main', { target }], ['collecting', 'main', { workflowRunId: '11' }]],
      collected: [['dispatching', 'main', { target }], ['collecting', 'main', { workflowRunId: '12' }], ['collected', 'main', { verification: verification(3, 1, '12', 'mz-collected') }]],
      cancelling: [['dispatching', 'main', { target }], ['cancelling', 'user']], cancelled: [['cancelled', 'user']], failed: [['failed', 'main', { failure: 'X_CODE' }]],
    };
    for (const [id, path2] of Object.entries(via)) for (const [next, by, patch] of path2) step(seed, id, next, by, patch);
    project(seed, 'public-technical', 'p-reviewing'); project(seed, 'public-technical', 'p-owned');
    seed.createResearch({ id: 'owned', projectId: 'p-owned', topic: 't', inputs, clientRef: 'mz-owned', researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
    step(seed, 'owned', 'dispatching', 'main', { target });
    seed.close();
    const db = raw(path);
    db.exec(`INSERT INTO research (id,project_id,revision,status,topic,inputs,client_ref,research_level,policy_revision,trust_revision,created_at,updated_at) VALUES ('reviewing','p-reviewing',1,'queued','t','{}','mz-reviewing','public-technical',1,1,'${at}','${at}');
      INSERT INTO research_events VALUES ('reviewing',1,NULL,'queued','user',NULL,'START','{}','e',0)`);
    for (const [rev, from, to] of [[2, 'queued', 'dispatching'], [3, 'dispatching', 'collecting'], [4, 'collecting', 'collected'], [5, 'collected', 'reviewing']] as const) {
      db.prepare("INSERT INTO research_events VALUES ('reviewing',?,?,?,'main',NULL,'SEED','{}','e',0)").run(rev, from, to);
      db.prepare(`UPDATE research SET revision=?,status=?${rev === 2 ? ",collector_revision=1,repository='o/c',workflow='collect.yml',ref='main',dispatched_at='" + at + "'" : ''}${rev === 3 ? ",workflow_run_id='13'" : ''} WHERE id='reviewing'`).run(rev, to);
    }
    db.close();
    const { store } = open(path);
    const published: Research[] = [];
    const jobs = new ResearchJobs(store, r => published.push(r));
    const result = jobs.recover(['owned']);
    expect(result).toEqual({ failed: ['dispatching'], cancelled: ['cancelling'], resume: [{ researchId: 'collecting', revision: 3, workflowRunId: '11' }], dispatchable: [{ researchId: 'queued', revision: 1 }], reviewing: ['reviewing'], unreadable: [], freeze: [], packaging: [], reviewDiscard: [] });
    expect(store.getResearch('dispatching')).toMatchObject({ status: 'failed', failure: 'REMOTE_STATE_UNKNOWN' });
    expect(store.researchEvents('dispatching').events.at(-1)).toMatchObject({ actor: 'recovery', to: 'failed' });
    expect(store.getResearch('owned')).toMatchObject({ status: 'dispatching' });
    expect(published.map(r => r.id).sort()).toEqual(['cancelling', 'dispatching']);
    const again = jobs.recover(['owned']);
    expect(again.failed).toEqual([]); expect(again.cancelled).toEqual([]);
    expect(store.researchEvents('dispatching').events).toHaveLength(3);
    expect(store.recoverInterrupted()).toEqual({ interruptedRunIds: [], unknownOperationIds: [] });
  });

  test('a crash at any point in the dispatch protocol never leads to a second dispatch', () => {
    for (const crashAfter of ['start', 'dispatching', 'collecting'] as const) {
      const path = tempPath(); let dispatches = 0;
      let store = new Store(path); project(store);
      let jobs = new ResearchJobs(store, () => {});
      const created = create(store).research;
      const dispatch = (revision: number) => {
        const reply = jobs.transition({ method: 'research.transition', requestId: `d-${created.id}`, researchId: created.id, expectedRevision: revision, to: 'dispatching', cause: 'DISPATCH', target });
        if (reply.outcome === 'applied') dispatches++;
        return reply;
      };
      if (crashAfter !== 'start') {
        dispatch(1);
        if (crashAfter === 'collecting') jobs.transition({ method: 'research.transition', requestId: 'c-1', researchId: created.id, expectedRevision: 2, to: 'collecting', cause: 'RUN_ID', workflowRunId: '55' });
      }
      store.close(); store = new Store(path); stores.push(store); jobs = new ResearchJobs(store, () => {});
      const recovered = jobs.recover([]);
      for (const item of recovered.dispatchable) dispatch(item.revision);
      expect(dispatches, crashAfter).toBe(1);
      if (crashAfter === 'dispatching') expect(store.getResearch(created.id)).toMatchObject({ status: 'failed', failure: 'REMOTE_STATE_UNKNOWN' });
      if (crashAfter === 'collecting') expect(recovered.resume).toEqual([{ researchId: created.id, revision: 3, workflowRunId: '55' }]);
    }
  });

  test('a replayed transition returns the same outcome and writes no second journal row', () => {
    const { store } = open(); project(store); create(store);
    const published: Research[] = []; const jobs = new ResearchJobs(store, r => published.push(r));
    const command = { method: 'research.transition' as const, requestId: 'same', researchId: 'j1', expectedRevision: 1, to: 'dispatching' as const, cause: 'DISPATCH', target };
    const first = jobs.transition(command); const second = jobs.transition(command);
    expect(second).toEqual(first);
    expect(store.researchEvents('j1').events).toHaveLength(2);
    expect(published).toHaveLength(1);
  });

  test('a dispatch after a policy or trust change is refused, journaled as failed, and never applied', () => {
    for (const change of ['policy', 'trust', 'off'] as const) {
      const { store } = open(); project(store); create(store);
      const current = store.getProject('p')!;
      if (change === 'policy') store.putProject({ ...current, policy: { ...current.policy, revision: 2, research: 'private-connected' } });
      if (change === 'trust') store.putProject({ ...current, trustRevision: 2 });
      if (change === 'off') store.putProject({ ...current, policy: { ...current.policy, research: 'off' } });
      const jobs = new ResearchJobs(store, () => {});
      expect(jobs.context('j1').admission).toBe({ policy: 'POLICY_CHANGED', trust: 'TRUST_CHANGED', off: 'RESEARCH_NOT_ALLOWED' }[change]);
      const reply = jobs.transition({ method: 'research.transition', requestId: `r-${change}`, researchId: 'j1', expectedRevision: 1, to: 'dispatching', cause: 'DISPATCH', target });
      expect(reply.outcome).toBe('refused');
      expect(store.getResearch('j1')).toMatchObject({ status: 'failed', failure: { policy: 'POLICY_CHANGED', trust: 'TRUST_CHANGED', off: 'RESEARCH_NOT_ALLOWED' }[change] });
      expect(store.researchEvents('j1').events.some(e => e.to === 'dispatching')).toBe(false);
    }
  });

  test('collected after a policy or trust change is refused in the same transaction, journaled as failed, and records no verification', () => {
    for (const change of ['policy', 'trust', 'off'] as const) {
      const { store } = open(); project(store); create(store);
      const jobs = new ResearchJobs(store, () => {});
      jobs.transition({ method: 'research.transition', requestId: 'd', researchId: 'j1', expectedRevision: 1, to: 'dispatching', cause: 'DISPATCH', target });
      jobs.transition({ method: 'research.transition', requestId: 'c', researchId: 'j1', expectedRevision: 2, to: 'collecting', cause: 'KIT_DISPATCHED', workflowRunId: '5' });
      const current = store.getProject('p')!;
      if (change === 'policy') store.putProject({ ...current, policy: { ...current.policy, revision: 2, research: 'private-connected' } });
      if (change === 'trust') store.putProject({ ...current, trustRevision: 2 });
      if (change === 'off') store.putProject({ ...current, policy: { ...current.policy, research: 'off' } });
      // The verification itself is valid: it names the job's revision, admitted policy revision, run and client ref.
      const reply = jobs.transition({ method: 'research.transition', requestId: `v-${change}`, researchId: 'j1', expectedRevision: 3, to: 'collected', cause: 'PACKAGE_VERIFIED', verification: verification() });
      const failure = { policy: 'POLICY_CHANGED', trust: 'TRUST_CHANGED', off: 'RESEARCH_NOT_ALLOWED' }[change];
      expect(reply).toMatchObject({ outcome: 'refused', research: { status: 'failed', failure, workflowRunId: '5' } });
      expect(store.researchEvents('j1').events.at(-1)).toMatchObject({ from: 'collecting', to: 'failed', cause: 'ADMISSION_CHANGED' });
      expect(store.researchEvents('j1').events.some(e => e.to === 'collected')).toBe(false);
    }
  });

  test('an inference-only policy edit keeps research admitted: the dispatch and the package are still accepted', () => {
    const { store } = open(); project(store); create(store);
    const jobs = new ResearchJobs(store, () => {});
    const current = store.getProject('p')!;
    store.putProject({ ...current, policy: { ...current.policy, revision: 2, inference: 'cloud-allowed' } });
    expect(jobs.context('j1').admission).toBeNull();
    expect(jobs.transition({ method: 'research.transition', requestId: 'd', researchId: 'j1', expectedRevision: 1, to: 'dispatching', cause: 'DISPATCH', target }).outcome).toBe('applied');
    jobs.transition({ method: 'research.transition', requestId: 'c', researchId: 'j1', expectedRevision: 2, to: 'collecting', cause: 'KIT_DISPATCHED', workflowRunId: '5' });
    store.putProject({ ...store.getProject('p')!, policy: { ...store.getProject('p')!.policy, revision: 3, inference: 'local-only' } });
    // The verification binds the admitted policy revision (1), which an inference edit does not change.
    expect(jobs.transition({ method: 'research.transition', requestId: 'v', researchId: 'j1', expectedRevision: 3, to: 'collected', cause: 'PACKAGE_VERIFIED', verification: verification() }).outcome).toBe('applied');
  });

  test('a fact transition is still recorded after a policy change', () => {
    const { store } = open(); project(store); create(store);
    const jobs = new ResearchJobs(store, () => {});
    jobs.transition({ method: 'research.transition', requestId: 'd', researchId: 'j1', expectedRevision: 1, to: 'dispatching', cause: 'DISPATCH', target });
    const current = store.getProject('p')!; store.putProject({ ...current, policy: { ...current.policy, revision: 2 } });
    const reply = jobs.transition({ method: 'research.transition', requestId: 'c', researchId: 'j1', expectedRevision: 2, to: 'collecting', cause: 'RUN_ID', workflowRunId: '9' });
    expect(reply).toMatchObject({ outcome: 'applied', research: { status: 'collecting', workflowRunId: '9' } });
  });
});

describe('application and boundaries', () => {
  function app(research: 'off' | 'public-technical' = 'public-technical') {
    const { store } = open(); project(store, research);
    const published: Research[] = [];
    const application = new Application(store, { publish() {}, publishResearch: r => published.push(r), async infer() { return { content: '', outcome: 'complete' }; } });
    const call = <M extends MethodName>(method: M, params: MethodParams<M>, clientRequestId: string = randomUUID()) => application.handle({ protocolVersion: 1, clientRequestId, method, params }) as Promise<MethodResult<M>>;
    return { store, application, published, call };
  }
  const startParams = { projectId: 'p', topic: 'Ollama context limits', queries: ['ollama num_ctx default'], acknowledgedPublic: true as const };

  test('research off refuses before any write', async () => {
    const { store, published, call } = app('off');
    await expect(call('research.start', startParams)).rejects.toThrow('RESEARCH_NOT_ALLOWED');
    expect(store.listResearch('p')).toEqual([]); expect(published).toEqual([]);
    expect(store.lookupAcceptedRequest({ method: 'research.start', clientRequestId: 'none', canonicalInputHash: 'x' })).toBeUndefined();
  });

  test('an untrusted project is refused', async () => {
    const { store, call } = app();
    store.putProject({ ...store.getProject('p')!, trusted: false });
    await expect(call('research.start', startParams)).rejects.toThrow('PROJECT_UNTRUSTED');
  });

  test('start returns a strict public DTO with an opaque client ref and publishes once', async () => {
    const { store, published, call } = app();
    const { research } = await call('research.start', startParams, 'start-1');
    expect(ResearchSchema.parse(research)).toEqual(research);
    expect(research).toMatchObject({ status: 'queued', revision: 1, topic: startParams.topic });
    expect(research.clientRef).toMatch(/^mz-[0-9a-f]{32}$/);
    expect(research.clientRef).not.toContain('p');
    expect(Object.keys(research).sort()).toEqual(['clientRef', 'createdAt', 'id', 'projectId', 'revision', 'status', 'topic', 'updatedAt']);
    expect(published).toEqual([research]);
    expect(store.getResearch(research.id)?.inputs).toEqual({ queries: ['ollama num_ctx default'], urls: [], preferDomains: [], depth: 'quick', maxPages: 8 });
    const replay = await call('research.start', startParams, 'start-1');
    expect(replay).toEqual({ research }); expect(published).toHaveLength(1); expect(store.listResearch('p')).toHaveLength(1);
    await expect(call('research.start', startParams)).rejects.toThrow('RUN_ACTIVE');
  });

  test('list, read and cancel work through the public methods; unfinished methods stay unavailable', async () => {
    const { published, call } = app();
    const { research } = await call('research.start', startParams);
    expect((await call('research.list', { projectId: 'p' })).research).toEqual([research]);
    expect((await call('research.read', { researchId: research.id })).research).toEqual(research);
    await expect(call('research.read', { researchId: 'missing' })).rejects.toThrow('NOT_FOUND');
    await expect(call('research.list', { projectId: 'missing' })).rejects.toThrow('PROJECT_NOT_FOUND');
    const cancelled = await call('research.cancel', { researchId: research.id });
    expect(cancelled.research).toMatchObject({ status: 'cancelled', revision: 2 });
    const again = await call('research.cancel', { researchId: research.id });
    expect(again.research).toEqual(cancelled.research);
    expect(published).toHaveLength(2);
    await expect(call('research.review.start', { researchId: research.id, profileId: 'x' })).rejects.toThrow('NOT_IMPLEMENTED');
    await expect(call('research.purge', { researchId: research.id })).rejects.toThrow('NOT_IMPLEMENTED');
  });

  test('a project with an active job cannot be forgotten until the job ends', async () => {
    const { store, call } = app();
    const { research } = await call('research.start', startParams);
    await expect(call('project.forget', { projectId: 'p' })).rejects.toThrow('RUN_ACTIVE');
    await call('research.cancel', { researchId: research.id });
    await call('project.forget', { projectId: 'p' });
    expect(store.getResearch(research.id)).toBeUndefined();
    expect(store.researchEvents(research.id).events).toEqual([]);
  });

  test('the control channel cannot produce readiness or carry secrets', () => {
    const base = { method: 'research.transition', requestId: 'r', researchId: 'j', expectedRevision: 1, cause: 'DISPATCH' };
    expect(ControlSchema.safeParse({ ...base, to: 'collected' }).success).toBe(true);
    for (const to of ['reviewing', 'cancelling', 'queued']) expect(ControlSchema.safeParse({ ...base, to }).success, to).toBe(false);
    // Main may name the review outcomes (Task 5), so readiness is the engine's to refuse: no review edge exists before
    // schema v4, and v4's readiness trigger demands a frozen digest, a packaging step and main's KIT_APPROVED journal row.
    for (const to of ['approved', 'not_ready', 'packaging'] as const) {
      const { store } = open(); project(store); create(store);
      const jobs = new ResearchJobs(store, () => {});
      expect(ControlSchema.safeParse({ ...base, to }).success, to).toBe(true);
      expect(() => jobs.transition({ method: 'research.transition', requestId: `r-${to}`, researchId: 'j1', expectedRevision: 1, to, cause: 'KIT_APPROVED' }), to).toThrow('RESEARCH_TRANSITION_INVALID');
      expect(store.getResearch('j1'), to).toMatchObject({ status: 'queued', revision: 1 }); expect(store.researchEvents('j1').events, to).toHaveLength(1);
    }
    expect(ControlSchema.safeParse({ ...base, to: 'failed', failure: 'X_CODE', token: 'ghp_x' }).success).toBe(false);
    expect(ControlSchema.safeParse({ ...base, to: 'collecting', workflowRunId: '01' }).success).toBe(false);
    expect(ControlSchema.safeParse({ ...base, to: 'collecting', workflowRunId: '9007199254740993' }).success).toBe(false);
    expect(ControlSchema.safeParse({ ...base, to: 'failed', failure: 'free text' }).success).toBe(false);
    expect(ControlSchema.safeParse({ ...base, to: 'collected', verification: verification() }).success).toBe(true);
    for (const bad of [{ token: 'ghp_x' }, { downloadDigest: 'verified' }, { state: 'APPROVED_BRIEF' }, { artifactSha256: 'A'.repeat(64) }, { commit: 'main' }, { jobRevision: 0 }, { workflowRunId: '01' }, { clientRef: 'mz j1' }, { artifactBytes: 32 * 1024 ** 2 + 1 }])
      expect(ControlSchema.safeParse({ ...base, to: 'collected', verification: { ...verification(), ...bad } }).success, JSON.stringify(bad)).toBe(false);
  });

  test('job notices have their own strict engine message', () => {
    const research = { id: 'j', projectId: 'p', revision: 1, status: 'queued', topic: 't', clientRef: 'mz-j', createdAt: at, updatedAt: at };
    expect(FromEngineSchema.safeParse({ epoch: 'e', type: 'research', research }).success).toBe(true);
    for (const extra of [{ state: {} }, { token: 'x' }, { runId: 'r' }]) expect(FromEngineSchema.safeParse({ epoch: 'e', type: 'research', research, ...extra }).success).toBe(false);
    expect(FromEngineSchema.safeParse({ epoch: 'e', type: 'research', research: { ...research, status: 'sufficient' } }).success).toBe(false);
  });

  test('research errors reach the renderer as mapped codes', () => {
    expect(safeError(new Error('RESEARCH_NOT_ALLOWED'))).toMatchObject({ code: 'RESEARCH_NOT_ALLOWED' });
  });

  test('a full lifecycle stores no credential-shaped values or credential-named columns', () => {
    const path = tempPath(); const store = new Store(path); stores.push(store); project(store);
    const jobs = new ResearchJobs(store, () => {});
    create(store);
    jobs.transition({ method: 'research.transition', requestId: 'a', researchId: 'j1', expectedRevision: 1, to: 'dispatching', cause: 'DISPATCH', target });
    jobs.transition({ method: 'research.transition', requestId: 'b', researchId: 'j1', expectedRevision: 2, to: 'collecting', cause: 'RUN_ID', workflowRunId: '77' });
    jobs.transition({ method: 'research.transition', requestId: 'c', researchId: 'j1', expectedRevision: 3, to: 'failed', cause: 'COLLECTOR_EXIT', failure: 'WORKFLOW_FAILED' });
    const db = raw(path);
    for (const table of ['research', 'research_events', 'research_legacy', 'accepted_requests']) {
      const columns = (db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[]).map(c => c.name);
      if (table !== 'accepted_requests') expect(columns.join(' ')).not.toMatch(/token|secret|authorization|env/i);
      for (const row of db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]) for (const value of Object.values(row)) if (typeof value === 'string') expect(value).not.toMatch(/gh[pousr]_|github_pat_|fc-[A-Za-z0-9]/);
    }
    db.close();
  });
});
