import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, test } from 'vitest';
import { Store, type StoreResearchActor, type StoreResearchPatch, type StoreResearchStatus, type StoreRunStatus } from '../src/engine/store';
import { migrate } from '../src/engine/migrations';
import { Application } from '../src/engine/application';
import { ResearchContextSchema, ResearchJobs, ResearchRecoverySchema, researchDto } from '../src/engine/research';
import { ResearchReviewContextSchema } from '../src/engine/review-contract';
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
  // Schema v4 review edges (docs/specification/research-review.md, "Job states and edges").
  ['collected', 'reviewing', ['user']], ['not_ready', 'reviewing', ['user']],
  ['reviewing', 'packaging', ['main']], ['reviewing', 'not_ready', ['engine', 'main', 'recovery']], ['reviewing', 'cancelling', ['user']],
  ['packaging', 'approved', ['main']], ['packaging', 'not_ready', ['engine', 'main', 'recovery']], ['packaging', 'cancelling', ['user']],
  ['cancelling', 'cancelled', ['main', 'recovery', 'engine']],
];
const digestOf = (c: string) => c.repeat(64);
const reviewedPackage = (boundRevision: number, sha256 = digestOf('e')) => ({ sha256, validatorRevision: 'f'.repeat(40), boundRevision });
const minimalPatch = (to: StoreResearchStatus, n: number, revision: number): StoreResearchPatch | undefined => to === 'dispatching' ? { target } : to === 'collecting' ? { workflowRunId: String(5000 + n) } : to === 'failed' ? { failure: 'TEST_FAILURE' } : to === 'collected' ? { verification: verification(3, 1, String(1000 + n), `mz-j${n - 1}`) }
  : to === 'reviewing' ? { reviewRunId: `r-${n}`, reviewSessionId: `s-${n}`, workspace: 'fresh' } : to === 'packaging' ? { reviewDigest: digestOf('d') } : to === 'approved' ? { reviewedPackage: reviewedPackage(revision) }
  : to === 'not_ready' ? { failure: 'REVIEW_STOPPED' } : undefined;

describe('schema migrations', () => {
  test('a v2 database upgrades through v3 to v4, keeps every row and quarantines legacy research rows verbatim', () => {
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
    expect(check.pragma('user_version', { simple: true })).toBe(4);
    expect(check.prepare('SELECT * FROM research_legacy ORDER BY id').all()).toEqual(before);
    expect(check.pragma('foreign_key_check')).toEqual([]);
    const columns = (check.prepare("SELECT name FROM pragma_table_info('research')").all() as { name: string }[]).map(c => c.name);
    expect(columns).toEqual(['id', 'project_id', 'revision', 'status', 'topic', 'inputs', 'client_ref', 'research_level', 'policy_revision', 'trust_revision', 'collector_revision', 'repository', 'workflow', 'ref', 'dispatched_at', 'workflow_run_id', 'failure', 'created_at', 'updated_at',
      'review_session_id', 'review_run_id', 'review_digest', 'reviewed_package_sha256', 'reviewed_validator_revision', 'reviewed_bound_revision']);
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

  test('v1, v2, v3 and fresh databases all reach the same v4 research schema', () => {
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
    const v1 = fromVersion('schema-v1.sql'); const v2 = fromVersion('schema-v2.sql'); const v3 = fromVersion('schema-v3.sql'); const empty = research(fresh.path);
    expect([v1.version, v2.version, v3.version, empty.version]).toEqual([4, 4, 4, 4]);
    expect(v1.rows.length).toBeGreaterThan(5);
    expect(v1.rows).toEqual(v2.rows); expect(v3.rows).toEqual(v2.rows); expect(empty.rows).toEqual(v2.rows);
    // Every path ends at the v4 objects: the digest-gated readiness rule, never v3's reservation.
    const names = (v3.rows as Array<{ name: string }>).map(row => row.name);
    expect(names).toEqual(expect.arrayContaining(['research_readiness_digest', 'research_reviewed_immutable', 'research_events_retained']));
    expect(names).not.toContain('research_readiness_reserved');
    expect((v3.rows as Array<{ name: string; sql: string | null }>).find(row => row.name === 'research_active')?.sql).toContain("'packaging'");
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

  test('approved is unreachable from queued even with a matching journal row', () => {
    const db = setup(); insert(db);
    db.exec('DROP TRIGGER research_events_step');
    journal(db, 2, 'queued', 'approved');
    expect(() => db.prepare("UPDATE research SET revision=2,status='approved' WHERE id='j'").run()).toThrow('RESEARCH_READINESS_UNVERIFIED');
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
    const reachable: StoreResearchStatus[] = ['queued', 'dispatching', 'collecting', 'collected', 'reviewing', 'packaging', 'approved', 'not_ready', 'cancelling', 'cancelled', 'failed'];
    const actors: StoreResearchActor[] = ['user', 'main', 'recovery', 'engine'];
    const { store } = open(); let n = 0;
    // One outer transaction: each refused attempt still rolls back only its own savepoint, and the 484 cases cost one
    // durable commit instead of about 750 fsyncs, which took over 15 s on a Windows CI disk.
    store.transaction(() => { for (const from of reachable) for (const to of ResearchStatusSchema.options) for (const actor of actors) {
      const projectId = `p${n}`; const id = `j${n++}`;
      project(store, 'public-technical', projectId);
      store.transaction(() => {
        store.createResearch({ id, projectId, topic: 't', inputs, clientRef: `mz-${id}`, researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
      });
      const collected: Array<[StoreResearchStatus, StoreResearchActor, StoreResearchPatch?]> = [['dispatching', 'main', { target }], ['collecting', 'main', { workflowRunId: String(1000 + n) }], ['collected', 'main', { verification: verification(3, 1, String(1000 + n), `mz-${id}`) }]];
      const reviewing: typeof collected = [...collected, ['reviewing', 'user', { reviewRunId: `r-${id}`, reviewSessionId: `s-${id}`, workspace: 'fresh' }]];
      const packaging: typeof collected = [...reviewing, ['packaging', 'main', { reviewDigest: digestOf('d') }]];
      const paths: Record<string, Array<[StoreResearchStatus, StoreResearchActor, StoreResearchPatch?]>> = {
        queued: [], dispatching: [['dispatching', 'main', { target }]], collecting: collected.slice(0, 2), collected, reviewing, packaging,
        approved: [...packaging, ['approved', 'main', { reviewedPackage: reviewedPackage(6) }]], not_ready: [...reviewing, ['not_ready', 'engine', { failure: 'REVIEW_RUN_FAILED' }]],
        cancelling: [['dispatching', 'main', { target }], ['cancelling', 'user']], cancelled: [['cancelled', 'user']], failed: [['failed', 'main', { failure: 'TEST_FAILURE' }]],
      };
      for (const [next, by, patch] of paths[from]!) {
        const current = store.getResearch(id)!;
        store.transitionResearch({ researchId: id, expectedRevision: current.revision, to: next, actor: by, cause: next === 'approved' ? 'KIT_APPROVED' : 'TEST_STEP', patch });
      }
      const allowed = EXPECTED.some(([f, t, a]) => f === from && t === to && a.includes(actor));
      const before = store.getResearch(id)!;
      expect(before.status).toBe(from);
      const attempt = () => store.transitionResearch({ researchId: id, expectedRevision: before.revision, to, actor, cause: to === 'approved' ? 'KIT_APPROVED' : 'MATRIX', patch: minimalPatch(to, n, before.revision) });
      if (allowed) expect(attempt, `${from}->${to} by ${actor}`).not.toThrow();
      else {
        expect(attempt, `${from}->${to} by ${actor}`).toThrow('RESEARCH_TRANSITION_INVALID');
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
      db.prepare(`UPDATE research SET revision=?,status=?${rev === 2 ? ",collector_revision=1,repository='o/c',workflow='collect.yml',ref='main',dispatched_at='" + at + "'" : ''}${rev === 3 ? ",workflow_run_id='13'" : ''}${rev === 5 ? ",review_run_id='gone-run',review_session_id='gone-session'" : ''} WHERE id='reviewing'`).run(rev, to);
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
    // A review whose run no longer exists cannot continue: it ends as not_ready, and a retry starts a new run.
    expect(store.getResearch('reviewing')).toMatchObject({ status: 'not_ready', failure: 'REVIEW_INTERRUPTED' });
    expect(store.researchEvents('reviewing').events.at(-1)).toMatchObject({ actor: 'recovery', from: 'reviewing', to: 'not_ready', cause: 'RECOVERED' });
    expect(published.map(r => r.id).sort()).toEqual(['cancelling', 'dispatching', 'reviewing']);
    const again = jobs.recover(['owned']);
    expect(again.failed).toEqual([]); expect(again.cancelled).toEqual([]); expect(again.reviewing).toEqual([]);
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

// ---- Schema v4: the research review (docs/specification/research-review.md, "Job states and edges", "Schema v4") ----

// Independent restatement of the v4 objects on research and research_events (autoindexes aside), in name order.
const V4_OBJECTS = [
  ['table', 'research'], ['index', 'research_active'], ['table', 'research_events'], ['trigger', 'research_events_append_only'],
  ['trigger', 'research_events_retained'], ['trigger', 'research_events_step'], ['trigger', 'research_identity_immutable'], ['trigger', 'research_insert_guard'],
  ['index', 'research_project'], ['trigger', 'research_readiness_digest'], ['trigger', 'research_reviewed_immutable'], ['index', 'research_single_dispatch'],
  ['trigger', 'research_update_journaled'],
];
const V3_RESEARCH_COLUMNS = 'id,project_id,revision,status,topic,inputs,client_ref,research_level,policy_revision,trust_revision,collector_revision,repository,workflow,ref,dispatched_at,workflow_run_id,failure,created_at,updated_at';
const objects = (db: Database.Database) => (db.prepare("SELECT type,name FROM sqlite_master WHERE tbl_name IN ('research','research_events') AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name").all() as Array<{ type: string; name: string }>).map(o => [o.type, o.name]);

/** A database written by the v3 schema (the fixture dumped from unmodified v3 code) holding real jobs and their journals. */
function v3Database(prefix = 'moon-v3-') {
  const path = tempPath(prefix); const db = raw(path);
  db.exec(readFileSync(new URL('./fixtures/schema-v3.sql', import.meta.url), 'utf8'));
  db.pragma('foreign_keys = ON');
  const policy = '{"revision":1,"inference":"local-only","research":"public-technical"}';
  db.exec(`INSERT INTO projects VALUES ('p','Project','C:/project','Project',1,1,'${policy}',0,'${at}'), ('p2','Second','C:/second','Second',1,1,'${policy}',0,'${at}');
    INSERT INTO sessions VALUES ('s','p','Conversation','${at}','${at}','{"revision":0,"inference":"cloud-allowed"}');
    INSERT INTO profile_revisions VALUES ('v','m','Local','ollama','http://localhost:11434','test',8192,512,'local',NULL,1,'${at}','${at}');
    INSERT INTO profiles VALUES ('m','v');
    INSERT INTO runs VALUES ('r','s','p','build','completed','m','v',1,1,'${at}','${at}',2,0);`);
  const job = (id: string, projectId: string) => {
    db.prepare(`INSERT INTO research (id,project_id,revision,status,topic,inputs,client_ref,research_level,policy_revision,trust_revision,created_at,updated_at) VALUES (?,?,1,'queued','Ollama limits',?,?,'public-technical',1,1,'${at}','${at}')`)
      .run(id, projectId, JSON.stringify(inputs), `mz-${id}`);
    db.prepare("INSERT INTO research_events VALUES (?,1,NULL,'queued','user','req-1','START','{}','e',1)").run(id);
  };
  const move = (id: string, revision: number, from: string, to: string, set: string, detail: object = {}, actor = 'main') => {
    db.prepare('INSERT INTO research_events VALUES (?,?,?,?,?,NULL,?,?,?,?)').run(id, revision, from, to, actor, 'V3_STEP', JSON.stringify(detail), 'e', revision);
    db.prepare(`UPDATE research SET revision=?,status=?${set},updated_at=? WHERE id=?`).run(revision, to, `2026-10-02T00:00:0${revision}.000Z`, id);
  };
  const dispatch = `,collector_revision=1,repository='owner/collector',workflow='collect.yml',ref='main',dispatched_at='${at}'`;
  job('queued', 'p');
  job('collected', 'p2'); move('collected', 2, 'queued', 'dispatching', dispatch, { target }); move('collected', 3, 'dispatching', 'collecting', ",workflow_run_id='41'", { workflowRunId: '41' });
  move('collected', 4, 'collecting', 'collected', '', { verification: verification(3, 1, '41', 'mz-collected') });
  job('failed', 'p2'); move('failed', 2, 'queued', 'failed', ",failure='COLLECTOR_NOT_FOUND'", { failure: 'COLLECTOR_NOT_FOUND' });
  job('cancelled', 'p2'); move('cancelled', 2, 'queued', 'dispatching', dispatch, { target }); move('cancelled', 3, 'dispatching', 'cancelling', '', {}, 'user');
  move('cancelled', 4, 'cancelling', 'cancelled', ",workflow_run_id='42',failure='REMOTE_STATE_UNKNOWN'", { workflowRunId: '42', failure: 'REMOTE_STATE_UNKNOWN' });
  return { path, db, move };
}
const snapshot = (db: Database.Database) => ({
  research: db.prepare(`SELECT ${V3_RESEARCH_COLUMNS} FROM research ORDER BY id`).all(),
  events: db.prepare('SELECT * FROM research_events ORDER BY research_id,revision').all(),
});

describe('schema v4 migration', () => {
  test('a v3 database with real jobs migrates to v4 with identical rows, every index and trigger, and no foreign key violation', () => {
    const { path, db } = v3Database();
    const before = snapshot(db);
    expect(before.research).toHaveLength(4); expect(before.events).toHaveLength(11);
    db.close();
    const check = new Database(path); check.pragma('synchronous = OFF');
    migrate(check);
    expect(check.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(check.pragma('user_version', { simple: true })).toBe(4);
    expect(snapshot(check)).toEqual(before);
    expect(check.prepare('SELECT count(*) AS n FROM research WHERE review_session_id IS NOT NULL OR review_run_id IS NOT NULL OR review_digest IS NOT NULL OR reviewed_package_sha256 IS NOT NULL OR reviewed_validator_revision IS NOT NULL OR reviewed_bound_revision IS NOT NULL').get()).toEqual({ n: 0 });
    expect(objects(check)).toEqual(V4_OBJECTS);
    expect(check.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'new_research%'").all()).toEqual([]);
    expect(check.pragma('foreign_key_check')).toEqual([]);
    check.close();
    // The migrated rows live under the v4 rules: the collected job can start a review, and the journal still refuses a stale step.
    const { store } = open(path);
    expect(store.listResearch('p2').map(job => job.id).sort()).toEqual(['cancelled', 'collected', 'failed']);
    step(store, 'collected', 'reviewing', 'user', { reviewRunId: 'r1', reviewSessionId: 's1', workspace: 'fresh' });
    expect(store.getResearch('collected')).toMatchObject({ revision: 5, status: 'reviewing', workflowRunId: '41', reviewRunId: 'r1' });
    expect(() => store.transitionResearch({ researchId: 'queued', expectedRevision: 3, to: 'cancelled', actor: 'user', cause: 'CANCEL_REQUESTED' })).toThrow('STALE_REVISION');
  });

  test('a failure after the old tables are dropped rolls everything back to v3, rows and objects included', () => {
    const { path, db } = v3Database('moon-v3-bad-');
    // A foreign object owns a name v4 creates after the drop and the rename, so the rebuild fails at step 5.
    db.exec("CREATE TRIGGER research_readiness_digest AFTER INSERT ON missions BEGIN SELECT 1; END;");
    const before = snapshot(db);
    const v3Objects = objects(db);
    db.close();
    expect(() => new Store(path)).toThrow(/research_readiness_digest already exists/);
    const check = new Database(path); check.pragma('synchronous = OFF');
    expect(check.pragma('user_version', { simple: true })).toBe(3);
    expect(snapshot(check)).toEqual(before);
    expect(objects(check)).toEqual(v3Objects);
    expect(v3Objects).toContainEqual(['trigger', 'research_readiness_reserved']);
    expect(check.prepare("SELECT name FROM pragma_table_info('research') WHERE name='review_digest'").get()).toBeUndefined();
    expect(check.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'new_research%'").all()).toEqual([]);
    // The connection that ran the failed migration has foreign keys back on.
    expect(() => migrate(check)).toThrow(/research_readiness_digest already exists/);
    expect(check.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(check.pragma('user_version', { simple: true })).toBe(3);
    check.close();
  });

  test('a v3 row in reviewing or approved is refused rather than mapped', () => {
    for (const state of ['reviewing', 'approved'] as const) {
      const { path, db, move } = v3Database(`moon-v3-${state}-`);
      if (state === 'approved') db.exec('DROP TRIGGER research_readiness_reserved');
      move('collected', 5, 'collected', state, '');
      const before = snapshot(db); db.close();
      expect(() => new Store(path), state).toThrow('MIGRATION_RESEARCH_STATE');
      const check = raw(path);
      expect(check.pragma('user_version', { simple: true })).toBe(3);
      expect(snapshot(check)).toEqual(before);
      check.close();
    }
  });
});

const D1 = digestOf('1'); const D2 = digestOf('2');
/** A run of mode research in its own conversation, as the review run will be (Task 5, B2). */
function reviewRun(store: Store, runId: string, status: StoreRunStatus = 'awaiting_review', projectId = 'p', sessionId = `s-${runId}`) {
  if (!store.getProfileRevision('pv')) store.putProfile({ id: 'm', name: 'Local', kind: 'ollama', endpoint: 'http://localhost:11434', model: 'test', contextTokens: 8192, outputTokens: 512, locality: 'local', revision: 1, revisionId: 'pv', createdAt: at, updatedAt: at });
  if (!store.getSession(sessionId)) store.putSession({ id: sessionId, projectId, title: 'Review', createdAt: at, updatedAt: at });
  store.putRun({ id: runId, sessionId, projectId, mode: 'research', status, profileId: 'm', profileRevisionId: 'pv', policyRevision: 1, trustRevision: 1, createdAt: at });
}
/** A job collected under its own project, with run id `wf` and the collected package digest 'a' x 64. */
function collectedJob(store: Store, id = 'j1', projectId = 'p', wf = '5') {
  if (!store.getProject(projectId)) project(store, 'public-technical', projectId);
  create(store, id, projectId);
  step(store, id, 'dispatching', 'main', { target });
  step(store, id, 'collecting', 'main', { workflowRunId: wf });
  step(store, id, 'collected', 'main', { verification: verification(3, 1, wf, `mz-${id}`) });
}
const startReview = (store: Store, id: string, runId: string, workspace: 'fresh' | 'continued' = 'fresh', sessionId = 's-review') => step(store, id, 'reviewing', 'user', { reviewRunId: runId, reviewSessionId: sessionId, workspace });
const approve = (store: Store, id: string, sha256 = digestOf('e'), cause = 'KIT_APPROVED') => {
  const current = store.getResearch(id)!;
  return store.transitionResearch({ researchId: id, expectedRevision: current.revision, to: 'approved', actor: 'main', cause, patch: { reviewedPackage: reviewedPackage(current.revision, sha256) } });
};

describe('schema v4 constraints', () => {
  /** Jobs taken to `packaging` (revision 6) through the store, then a raw connection to write past it. */
  function packagingDb(ids: string[]) {
    const { store, path } = open();
    ids.forEach((id, n) => { collectedJob(store, id, `p-${id}`, String(100 + n)); startReview(store, id, `r-${id}`, 'fresh', `s-${id}`); step(store, id, 'packaging', 'main', { reviewDigest: D1 }); });
    store.close(); const db = raw(path); db.pragma('foreign_keys = ON'); return db;
  }
  const approveRaw = (db: Database.Database, id: string, o: { from?: string; cause?: string; actor?: string; eventSha?: string; sha?: string | null; digest?: string } = {}) => db.transaction(() => {
    const revision = (db.prepare('SELECT revision FROM research WHERE id=?').get(id) as { revision: number }).revision + 1;
    const sha = o.sha === undefined ? digestOf('e') : o.sha;
    db.prepare('INSERT INTO research_events VALUES (?,?,?,?,?,NULL,?,?,?,0)').run(id, revision, o.from ?? 'packaging', 'approved', o.actor ?? 'main', o.cause ?? 'KIT_APPROVED',
      JSON.stringify({ reviewedPackage: { sha256: o.eventSha ?? sha ?? digestOf('e'), validatorRevision: 'f'.repeat(40), boundRevision: revision - 1 } }), 'e');
    db.prepare(`UPDATE research SET revision=?,status='approved',failure=NULL,review_digest=?,reviewed_package_sha256=?,reviewed_validator_revision=?,reviewed_bound_revision=? WHERE id=?`)
      .run(revision, o.digest ?? D1, sha, sha === null ? null : 'f'.repeat(40), sha === null ? null : revision - 1, id);
  })();

  test('the readiness rule refuses approved without packaging, the frozen digest, a new package and main\'s KIT_APPROVED journal row', () => {
    const cases = ['ok', 'from-reviewing', 'from-not-ready', 'digest-change', 'null-package', 'collected-digest', 'cause', 'actor', 'event-sha'];
    const db = packagingDb(cases);
    const refusals: Array<[string, Parameters<typeof approveRaw>[2]]> = [
      ['digest-change', { digest: D2 }], ['null-package', { sha: null }], ['collected-digest', { sha: digestOf('a') }],
      ['cause', { cause: 'KIT_NOT_APPROVED' }], ['actor', { actor: 'engine' }], ['event-sha', { eventSha: digestOf('9') }],
    ];
    for (const [id, options] of refusals) {
      const before = db.prepare('SELECT * FROM research WHERE id=?').get(id);
      expect(() => approveRaw(db, id, options), id).toThrow('RESEARCH_READINESS_UNVERIFIED');
      expect(db.prepare('SELECT * FROM research WHERE id=?').get(id), id).toEqual(before);
    }
    // Wrong source status: a job still reviewing, with a frozen digest written in the same statement.
    db.exec('DROP TRIGGER research_events_step');
    db.prepare("INSERT INTO research_events VALUES ('from-reviewing',7,'packaging','reviewing','user',NULL,'FORGED','{}','e',0)").run();
    db.prepare("UPDATE research SET revision=7,status='reviewing',review_digest=NULL WHERE id='from-reviewing'").run();
    expect(() => approveRaw(db, 'from-reviewing', { from: 'reviewing' })).toThrow('RESEARCH_READINESS_UNVERIFIED');
    // The source status alone: with the journal rules set aside, a KIT_APPROVED row still cannot approve a not_ready job.
    db.prepare("INSERT INTO research_events VALUES ('from-not-ready',7,'packaging','not_ready','main',NULL,'X_STEP','{\"failure\":\"REVIEW_GATE_FAILED\"}','e',0)").run();
    db.prepare("UPDATE research SET revision=7,status='not_ready',failure='REVIEW_GATE_FAILED' WHERE id='from-not-ready'").run();
    db.exec('DROP TRIGGER research_update_journaled');
    expect(() => approveRaw(db, 'from-not-ready', { from: 'packaging' })).toThrow('RESEARCH_READINESS_UNVERIFIED');
    // The positive control: the same write with every condition met is accepted.
    approveRaw(db, 'ok');
    expect(db.prepare("SELECT status,reviewed_package_sha256 FROM research WHERE id='ok'").get()).toEqual({ status: 'approved', reviewed_package_sha256: digestOf('e') });
    db.close();
  });

  test('the readiness rule refuses a job whose collected step journaled no package digest', () => {
    const { store, path } = open(); project(store); store.close();
    const db = raw(path); db.pragma('foreign_keys = ON');
    db.prepare(`INSERT INTO research (id,project_id,revision,status,topic,inputs,client_ref,research_level,policy_revision,trust_revision,created_at,updated_at) VALUES ('j','p',1,'queued','t','{}','mz-j','public-technical',1,1,'${at}','${at}')`).run();
    db.prepare("INSERT INTO research_events VALUES ('j',1,NULL,'queued','user',NULL,'START','{}','e',0)").run();
    const move = (revision: number, from: string, to: string, set: string, detail = '{}') => {
      db.prepare("INSERT INTO research_events VALUES ('j',?,?,?,'main',NULL,'SEED',?,'e',0)").run(revision, from, to, detail);
      db.prepare(`UPDATE research SET revision=?,status=?${set} WHERE id='j'`).run(revision, to);
    };
    move(2, 'queued', 'dispatching', `,collector_revision=1,repository='o/c',workflow='collect.yml',ref='main',dispatched_at='${at}'`);
    move(3, 'dispatching', 'collecting', ",workflow_run_id='7'");
    move(4, 'collecting', 'collected', '');
    move(5, 'collected', 'reviewing', ",review_run_id='r',review_session_id='s'");
    move(6, 'reviewing', 'packaging', `,review_digest='${D1}'`);
    expect(() => approveRaw(db, 'j')).toThrow('RESEARCH_READINESS_UNVERIFIED');
    db.close();
  });

  test('an approved job\'s status and review columns cannot be rewritten', () => {
    const db = packagingDb(['j']);
    approveRaw(db, 'j');
    // Even a journaled step out of approved is refused.
    db.prepare("INSERT INTO research_events VALUES ('j',8,'approved','not_ready','main',NULL,'FORGED','{}','e',0)").run();
    expect(() => db.prepare("UPDATE research SET revision=8,status='not_ready',failure='X_CODE' WHERE id='j'").run()).toThrow('RESEARCH_REVIEW_IMMUTABLE');
    // Each reviewed column on its own, with the journal rule set aside so this trigger alone answers.
    db.exec('DROP TRIGGER research_update_journaled');
    for (const [column, value] of [['review_digest', D2], ['reviewed_package_sha256', D2], ['reviewed_validator_revision', '0'.repeat(40)], ['reviewed_bound_revision', 9], ['review_run_id', 'other'], ['review_session_id', 'other']] as const)
      expect(() => db.prepare(`UPDATE research SET ${column}=? WHERE id='j'`).run(value), column).toThrow('RESEARCH_REVIEW_IMMUTABLE');
    expect(db.prepare("SELECT status,review_digest,reviewed_package_sha256 FROM research WHERE id='j'").get()).toEqual({ status: 'approved', review_digest: D1, reviewed_package_sha256: digestOf('e') });
    db.close();
  });

  test('the table checks bind the review columns to the status', () => {
    const { store, path } = open(); collectedJob(store); store.close();
    const db = raw(path); db.pragma('foreign_keys = ON');
    // Only the CHECK constraints answer here: the journal, readiness and immutability triggers are set aside.
    for (const trigger of ['research_update_journaled', 'research_readiness_digest']) db.exec(`DROP TRIGGER ${trigger}`);
    const update = (set: string) => () => db.prepare(`UPDATE research SET ${set} WHERE id='j1'`).run();
    const ok = `review_run_id='r',review_session_id='s'`;
    expect(update("status='reviewing'")).toThrow(/CHECK constraint failed: status NOT IN \('reviewing','packaging'\) OR \(review_run_id/);
    expect(update("status='reviewing',review_run_id='r'")).toThrow(/CHECK constraint failed: \(review_run_id IS NULL\) = \(review_session_id IS NULL\)/);
    expect(update(`status='reviewing',${ok},failure='X_CODE'`)).toThrow(/CHECK constraint failed: (status <> 'reviewing' OR|failure IS NULL OR status IN)/);
    expect(update(`status='reviewing',${ok},review_digest='${D1}'`)).toThrow(/CHECK constraint failed: status <> 'reviewing' OR/);
    expect(update(`status='reviewing',${ok},reviewed_package_sha256='${D1}',reviewed_validator_revision='${'f'.repeat(40)}',reviewed_bound_revision=5`)).toThrow(/CHECK constraint failed: status <> 'reviewing' OR/);
    expect(update(`status='packaging',${ok}`)).toThrow(/CHECK constraint failed: status <> 'packaging' OR review_digest IS NOT NULL/);
    expect(update(`status='approved',${ok},review_digest='${D1}'`)).toThrow(/CHECK constraint failed: status <> 'approved' OR/);
    expect(update(`status='packaging',${ok},review_digest='${'A'.repeat(64)}'`)).toThrow(/CHECK constraint failed: length\(review_digest\)/);
    expect(update(`status='not_ready',failure='X_CODE',reviewed_package_sha256='${D1}'`)).toThrow(/CHECK constraint failed: \(reviewed_package_sha256 IS NULL\) = \(reviewed_validator_revision IS NULL\)/);
    expect(update(`status='not_ready',failure='X_CODE',reviewed_package_sha256='${D1}',reviewed_validator_revision='${'F'.repeat(40)}',reviewed_bound_revision=5`)).toThrow(/CHECK constraint failed: length\(reviewed_validator_revision\)/);
    expect(update(`status='not_ready',failure='X_CODE',reviewed_package_sha256='${D1}',reviewed_validator_revision='${'f'.repeat(40)}',reviewed_bound_revision=0`)).toThrow(/CHECK constraint failed: reviewed_bound_revision > 0/);
    // The positive controls for the same states.
    update(`status='packaging',${ok},review_digest='${D1}'`)();
    update(`status='approved',review_digest='${D1}',reviewed_package_sha256='${D2}',reviewed_validator_revision='${'f'.repeat(40)}',reviewed_bound_revision=6`)();
    expect(db.prepare("SELECT status FROM research WHERE id='j1'").get()).toEqual({ status: 'approved' });
    // The journal accepts the engine actor and the packaging status, and nothing else new.
    expect(() => db.prepare("INSERT INTO research_events VALUES ('j1',5,'approved','packaging','engine',NULL,'X_STEP','{}','e',0)").run()).not.toThrow();
    db.exec('DROP TRIGGER research_events_step');
    expect(() => db.prepare("INSERT INTO research_events VALUES ('j1',6,'approved','sufficient','main',NULL,'X_STEP','{}','e',0)").run()).toThrow(/CHECK constraint failed: to_status IN/);
    expect(() => db.prepare("INSERT INTO research_events VALUES ('j1',6,'approved','not_ready','kit',NULL,'X_STEP','{}','e',0)").run()).toThrow(/CHECK constraint failed: actor IN/);
    db.close();
  });

  test('packaging holds the project\'s single research slot', () => {
    const { store } = open(); collectedJob(store); startReview(store, 'j1', 'r1');
    step(store, 'j1', 'packaging', 'main', { reviewDigest: D1 });
    expect(store.hasActiveResearch('p')).toBe(true);
    expect(() => create(store, 'j2')).toThrow('RUN_ACTIVE');
    step(store, 'j1', 'not_ready', 'main', { failure: 'REVIEW_GATE_FAILED' });
    expect(create(store, 'j2').research.status).toBe('queued');
    // A second active job in the project is refused by the index too, so a retry of j1 cannot run beside it.
    expect(() => startReview(store, 'j1', 'r2', 'continued')).toThrow(/UNIQUE.*project_id/);
  });
});

describe('schema v4 store transitions', () => {
  test('each review edge writes exactly its columns, and a retry clears the previous outcome', () => {
    const { store } = open(); collectedJob(store);
    let job = startReview(store, 'j1', 'r1').research;
    expect(job).toMatchObject({ status: 'reviewing', reviewRunId: 'r1', reviewSessionId: 's-review' });
    expect(job.reviewDigest).toBeUndefined(); expect(job.failure).toBeUndefined();
    job = step(store, 'j1', 'packaging', 'main', { reviewDigest: D1 }).research;
    expect(job).toMatchObject({ status: 'packaging', reviewRunId: 'r1', reviewDigest: D1 });
    job = step(store, 'j1', 'not_ready', 'main', { failure: 'REVIEW_GATE_FAILED', reviewedPackage: reviewedPackage(6, D2) }).research;
    expect(job).toMatchObject({ status: 'not_ready', failure: 'REVIEW_GATE_FAILED', reviewDigest: D1, reviewedPackageSha256: D2, reviewedValidatorRevision: 'f'.repeat(40), reviewedBoundRevision: 6 });
    // The retry starts a new run in the same conversation and clears the failure, the digest and the reviewed package.
    job = startReview(store, 'j1', 'r2', 'continued').research;
    expect(job).toMatchObject({ status: 'reviewing', reviewRunId: 'r2', reviewSessionId: 's-review', workflowRunId: '5' });
    for (const key of ['failure', 'reviewDigest', 'reviewedPackageSha256', 'reviewedValidatorRevision', 'reviewedBoundRevision'] as const) expect(job[key], key).toBeUndefined();
    step(store, 'j1', 'packaging', 'main', { reviewDigest: D2 });
    job = approve(store, 'j1', digestOf('e')).research;
    expect(job).toMatchObject({ status: 'approved', reviewDigest: D2, reviewedPackageSha256: digestOf('e'), reviewedBoundRevision: 9, reviewRunId: 'r2' });
    expect(job.failure).toBeUndefined();
    expect(store.researchEvents('j1').events.slice(4).map(e => [e.from, e.to, e.actor, e.detail])).toEqual([
      ['collected', 'reviewing', 'user', { reviewRunId: 'r1', reviewSessionId: 's-review', workspace: 'fresh' }],
      ['reviewing', 'packaging', 'main', { reviewDigest: D1 }],
      ['packaging', 'not_ready', 'main', { failure: 'REVIEW_GATE_FAILED', reviewedPackage: reviewedPackage(6, D2) }],
      ['not_ready', 'reviewing', 'user', { reviewRunId: 'r2', reviewSessionId: 's-review', workspace: 'continued' }],
      ['reviewing', 'packaging', 'main', { reviewDigest: D2 }],
      ['packaging', 'approved', 'main', { reviewedPackage: reviewedPackage(9, digestOf('e')) }],
    ]);
  });

  test('review patches must carry exactly what the edge needs', () => {
    const { store } = open(); collectedJob(store);
    expect(() => step(store, 'j1', 'reviewing', 'user', { reviewRunId: 'r1', reviewSessionId: 's' })).toThrow('RESEARCH_TRANSITION_INVALID');
    // A first review has no earlier edits to keep.
    expect(() => startReview(store, 'j1', 'r1', 'continued')).toThrow('RESEARCH_TRANSITION_INVALID');
    startReview(store, 'j1', 'r1');
    expect(() => step(store, 'j1', 'packaging', 'main')).toThrow('RESEARCH_TRANSITION_INVALID');
    expect(() => step(store, 'j1', 'packaging', 'main', { reviewDigest: D1, reviewedPackage: reviewedPackage(5) })).toThrow('RESEARCH_TRANSITION_INVALID');
    expect(() => step(store, 'j1', 'not_ready', 'engine', { failure: 'REVIEW_RUN_FAILED', reviewedPackage: reviewedPackage(5) })).toThrow('RESEARCH_TRANSITION_INVALID');
    step(store, 'j1', 'packaging', 'main', { reviewDigest: D1 });
    // A receipt bound to another revision than the packaging one is stale.
    for (const bound of [5, 7]) expect(() => store.transitionResearch({ researchId: 'j1', expectedRevision: 6, to: 'approved', actor: 'main', cause: 'KIT_APPROVED', patch: { reviewedPackage: reviewedPackage(bound) } }), String(bound)).toThrow('RESEARCH_TRANSITION_INVALID');
    expect(() => step(store, 'j1', 'not_ready', 'main', { failure: 'REVIEW_GATE_FAILED', reviewedPackage: reviewedPackage(5) })).toThrow('RESEARCH_TRANSITION_INVALID');
    // The engine ends packaging only for a Stop of the review run.
    expect(() => step(store, 'j1', 'not_ready', 'engine', { failure: 'REVIEW_RUN_FAILED' })).toThrow('RESEARCH_TRANSITION_INVALID');
    expect(store.getResearch('j1')).toMatchObject({ revision: 6, status: 'packaging' });
    expect(step(store, 'j1', 'not_ready', 'engine', { failure: 'REVIEW_STOPPED' }).research).toMatchObject({ status: 'not_ready', failure: 'REVIEW_STOPPED' });
  });

  test('approved through the store needs main\'s KIT_APPROVED step and a package that is not the collected one', () => {
    const { store } = open(); collectedJob(store); startReview(store, 'j1', 'r1'); step(store, 'j1', 'packaging', 'main', { reviewDigest: D1 });
    const before = { job: store.getResearch('j1'), journal: store.researchEvents('j1') };
    expect(() => approve(store, 'j1', digestOf('e'), 'KIT_NOT_APPROVED')).toThrow('RESEARCH_READINESS_UNVERIFIED');
    expect(() => approve(store, 'j1', digestOf('a'))).toThrow('RESEARCH_READINESS_UNVERIFIED');
    expect({ job: store.getResearch('j1'), journal: store.researchEvents('j1') }).toEqual(before);
    expect(approve(store, 'j1').research.status).toBe('approved');
    // approved has no outgoing edge.
    for (const to of ResearchStatusSchema.options) for (const actor of ['user', 'main', 'recovery', 'engine'] as const)
      expect(() => store.transitionResearch({ researchId: 'j1', expectedRevision: 7, to, actor, cause: 'MATRIX', patch: minimalPatch(to, 0, 7) }), `${to} by ${actor}`).toThrow(/RESEARCH_TRANSITION_INVALID/);
  });

  test('restart keeps an awaiting_review run that a reviewing or packaging job names, and interrupts every other active run', () => {
    const path = tempPath(); const seed = new Store(path);
    collectedJob(seed, 'reviewing', 'p1', '11'); reviewRun(seed, 'r-reviewing', 'awaiting_review', 'p1'); startReview(seed, 'reviewing', 'r-reviewing');
    collectedJob(seed, 'packaging', 'p2', '12'); reviewRun(seed, 'r-packaging', 'awaiting_review', 'p2'); startReview(seed, 'packaging', 'r-packaging');
    step(seed, 'packaging', 'packaging', 'main', { reviewDigest: D1 });
    collectedJob(seed, 'not_ready', 'p3', '13'); reviewRun(seed, 'r-not-ready', 'awaiting_review', 'p3'); startReview(seed, 'not_ready', 'r-not-ready');
    step(seed, 'not_ready', 'not_ready', 'main', { failure: 'REVIEW_WORKSPACE_CHANGED' });
    collectedJob(seed, 'running', 'p4', '14'); reviewRun(seed, 'r-running', 'running', 'p4'); startReview(seed, 'running', 'r-running');
    reviewRun(seed, 'r-unnamed', 'awaiting_review', 'p1', 's-unnamed');
    seed.close();
    const { store } = open(path);
    expect(store.recoverInterrupted().interruptedRunIds).toEqual(['r-not-ready', 'r-running', 'r-unnamed']);
    expect(store.getRun('r-reviewing')?.status).toBe('awaiting_review');
    expect(store.getRun('r-packaging')?.status).toBe('awaiting_review');
    for (const id of ['r-not-ready', 'r-running', 'r-unnamed']) expect(store.getRun(id)?.status, id).toBe('interrupted');
    expect(store.events('r-reviewing').events).toEqual([]);
    expect(store.recoverInterrupted().interruptedRunIds).toEqual([]);
  });
});

describe('schema v4 engine review controls', () => {
  function jobs(store: Store) { const published: Research[] = []; return { published, jobs: new ResearchJobs(store, r => published.push(r)) }; }
  const command = (to: 'packaging' | 'approved' | 'not_ready', expectedRevision: number, extra: object = {}) => ({ method: 'research.transition' as const, requestId: `${to}-${expectedRevision}-${JSON.stringify(extra).length}`, researchId: 'j1', expectedRevision, to, cause: 'TEST', ...extra });

  test('research.transition records packaging, approved and not_ready from main, and refuses a freeze of a live run', () => {
    const { store } = open(); collectedJob(store); reviewRun(store, 'r1', 'running'); startReview(store, 'j1', 'r1');
    const { jobs: research, published } = jobs(store);
    expect(() => research.transition(command('packaging', 5, { cause: 'WORKSPACE_FROZEN', reviewDigest: D1 }))).toThrow('RESEARCH_TRANSITION_INVALID');
    expect(store.researchEvents('j1').events).toHaveLength(5);
    store.appendEvent('r1', 'run.status', { status: 'awaiting_review' }, { status: 'awaiting_review' });
    expect(research.transition(command('packaging', 5, { cause: 'WORKSPACE_FROZEN', reviewDigest: D1 }))).toMatchObject({ outcome: 'applied', research: { status: 'packaging', reviewRunId: 'r1' } });
    const reply = research.transition(command('approved', 6, { cause: 'KIT_APPROVED', reviewedPackage: reviewedPackage(6) }));
    expect(reply).toMatchObject({ outcome: 'applied', research: { status: 'approved', reviewSessionId: 's-review', reviewRunId: 'r1', reviewedPackageDigest: digestOf('e') } });
    expect(ResearchSchema.parse(reply.research)).toEqual(reply.research);
    expect(published.map(r => r.status)).toEqual(['packaging', 'approved']);
    expect(store.researchEvents('j1').events.at(-1)).toMatchObject({ actor: 'main', cause: 'KIT_APPROVED', detail: { reviewedPackage: reviewedPackage(6) } });
  });

  test('research.transition re-checks admission for packaging and approved, and ends the review as not_ready with the admission code', () => {
    for (const [to, change] of [['packaging', 'trust'], ['approved', 'off'], ['approved', 'policy']] as const) {
      const { store } = open(); collectedJob(store); reviewRun(store, 'r1'); startReview(store, 'j1', 'r1');
      if (to === 'approved') step(store, 'j1', 'packaging', 'main', { reviewDigest: D1 });
      const current = store.getProject('p')!;
      if (change === 'trust') store.putProject({ ...current, trustRevision: 2 });
      if (change === 'off') store.putProject({ ...current, policy: { ...current.policy, revision: 2, research: 'off' } });
      if (change === 'policy') store.putProject({ ...current, policy: { ...current.policy, revision: 2, research: 'private-connected' } });
      const failure = { trust: 'TRUST_CHANGED', off: 'RESEARCH_NOT_ALLOWED', policy: 'POLICY_CHANGED' }[change];
      const extra = to === 'packaging' ? { cause: 'WORKSPACE_FROZEN', reviewDigest: D1 } : { cause: 'KIT_APPROVED', reviewedPackage: reviewedPackage(6) };
      const reply = jobs(store).jobs.transition(command(to, to === 'packaging' ? 5 : 6, extra));
      expect(reply, to).toMatchObject({ outcome: 'refused', research: { status: 'not_ready', failure } });
      expect(store.researchEvents('j1').events.at(-1), to).toMatchObject({ actor: 'main', to: 'not_ready', cause: 'ADMISSION_CHANGED' });
      // A refused readiness still records which package was refused.
      if (to === 'approved') expect(store.getResearch('j1')).toMatchObject({ reviewedPackageSha256: digestOf('e'), reviewDigest: D1 });
      expect(store.researchEvents('j1').events.some(e => e.to === 'approved' || (to === 'packaging' && e.to === 'packaging'))).toBe(false);
    }
  });

  test('an inference-only policy edit does not refuse readiness, and main may record not_ready itself', () => {
    const { store } = open(); collectedJob(store); reviewRun(store, 'r1'); startReview(store, 'j1', 'r1');
    const research = jobs(store).jobs;
    store.putProject({ ...store.getProject('p')!, policy: { revision: 2, inference: 'cloud-allowed', research: 'public-technical' } });
    research.transition(command('packaging', 5, { cause: 'WORKSPACE_FROZEN', reviewDigest: D1 }));
    expect(research.transition(command('not_ready', 6, { cause: 'KIT_NOT_APPROVED', failure: 'REVIEW_GATE_FAILED', reviewedPackage: reviewedPackage(6) }))).toMatchObject({ outcome: 'applied', research: { status: 'not_ready', failure: 'REVIEW_GATE_FAILED', reviewedPackageDigest: digestOf('e') } });
    reviewRun(store, 'r2'); startReview(store, 'j1', 'r2', 'continued');
    research.transition(command('packaging', 8, { cause: 'WORKSPACE_FROZEN', reviewDigest: D2 }));
    expect(research.transition(command('approved', 9, { cause: 'KIT_APPROVED', reviewedPackage: reviewedPackage(9) })).outcome).toBe('applied');
  });

  test('research.cancel stops a packaging job', () => {
    const { store } = open(); collectedJob(store); reviewRun(store, 'r1'); startReview(store, 'j1', 'r1'); step(store, 'j1', 'packaging', 'main', { reviewDigest: D1 });
    const { jobs: research } = jobs(store);
    expect(research.cancel('j1', 'c-1', []).research).toMatchObject({ status: 'cancelling' });
    expect(store.researchEvents('j1').events.at(-1)).toMatchObject({ actor: 'user', from: 'packaging', to: 'cancelling', cause: 'CANCEL_REQUESTED' });
  });

  test('research.context replies with the review columns and still parses strictly', () => {
    const { store } = open(); collectedJob(store); reviewRun(store, 'r1'); startReview(store, 'j1', 'r1'); step(store, 'j1', 'packaging', 'main', { reviewDigest: D1 });
    const context = ResearchContextSchema.parse(structuredClone(jobs(store).jobs.context('j1')));
    expect(context.research).toMatchObject({ status: 'packaging', reviewRunId: 'r1', reviewSessionId: 's-review', reviewDigest: D1 });
  });

  test('the public DTO exposes the review conversation and the reviewed package digest only', () => {
    const { store } = open(); collectedJob(store); startReview(store, 'j1', 'r1'); step(store, 'j1', 'packaging', 'main', { reviewDigest: D1 });
    const dto = researchDto(approve(store, 'j1').research);
    expect(Object.keys(dto).sort()).toEqual(['clientRef', 'createdAt', 'id', 'projectId', 'reviewRunId', 'reviewSessionId', 'reviewedPackageDigest', 'revision', 'status', 'topic', 'updatedAt', 'workflowRunId']);
    expect(dto).toMatchObject({ reviewRunId: 'r1', reviewSessionId: 's-review', reviewedPackageDigest: digestOf('e') });
  });

  test('research.review.context lists the completed writes of the review runs since the latest fresh edge, in creation order', () => {
    const { store } = open(); collectedJob(store);
    const research = jobs(store).jobs;
    let clock = 0; let ops = 0;
    const write = (runId: string, path: string, status: 'completed' | 'failed' | 'unknown' = 'completed', createdAt = `2026-10-03T00:00:${String(10 + clock++).padStart(2, '0')}.000Z`, kind: 'write' | 'read' = 'write') => {
      const id = `op-${++ops}`;
      const input = { path, content: 'x', beforeHash: digestOf('b'), afterHash: digestOf(String(clock % 10)) };
      store.putOperation({ id, runId, projectId: 'p', kind, inputHash: digestOf('c'), policyRevision: 1, trustRevision: 1, status, input, createdAt, updatedAt: createdAt });
      return { operationId: id, runId, path, beforeHash: input.beforeHash, afterHash: input.afterHash };
    };
    expect(research.reviewContext('j1')).toEqual({ researchId: 'j1', revision: 4, status: 'collected', admission: null, reviewSessionId: null, reviewRunId: null, reviewRunStatus: null, reviewDigest: null, reviewedPackage: null, changes: [] });
    reviewRun(store, 'r1', 'running', 'p', 's-review'); startReview(store, 'j1', 'r1');
    const late = write('r1', 'research/MAP.md', 'completed', '2026-10-03T00:00:59.000Z');
    const early = write('r1', 'research/EVIDENCE.md', 'completed', '2026-10-03T00:00:01.000Z');
    write('r1', 'research/BRIEF.md', 'failed'); write('r1', 'research/BRIEF.md', 'unknown'); write('r1', 'research/DISCOVERY.md', 'completed', undefined, 'read');
    reviewRun(store, 'build', 'completed', 'p', 's-build'); write('build', 'research/MAP.md');
    store.appendEvent('r1', 'run.failed', {}, { status: 'failed' });
    step(store, 'j1', 'not_ready', 'engine', { failure: 'REVIEW_RUN_FAILED' });
    reviewRun(store, 'r2', 'running', 'p', 's-review'); startReview(store, 'j1', 'r2', 'continued');
    const kept = write('r2', 'research/BRIEF.md', 'completed', '2026-10-03T00:01:00.000Z');
    let context = ResearchReviewContextSchema.parse(structuredClone(research.reviewContext('j1')));
    expect(context).toMatchObject({ status: 'reviewing', revision: 7, reviewRunId: 'r2', reviewSessionId: 's-review', reviewRunStatus: 'running', reviewDigest: null, reviewedPackage: null });
    expect(context.changes).toEqual([early, late, kept]);
    // A fresh restart drops every earlier run's writes from the expected tree.
    store.appendEvent('r2', 'run.failed', {}, { status: 'failed' });
    step(store, 'j1', 'not_ready', 'engine', { failure: 'REVIEW_RUN_FAILED' });
    reviewRun(store, 'r3', 'running', 'p', 's-review'); startReview(store, 'j1', 'r3', 'fresh');
    expect(research.reviewContext('j1').changes).toEqual([]);
    const fresh = write('r3', 'research/DISCOVERY.md');
    store.appendEvent('r3', 'run.status', {}, { status: 'awaiting_review' });
    step(store, 'j1', 'packaging', 'main', { reviewDigest: D1 });
    context = ResearchReviewContextSchema.parse(structuredClone(research.reviewContext('j1')));
    expect(context).toMatchObject({ status: 'packaging', reviewRunId: 'r3', reviewRunStatus: 'awaiting_review', reviewDigest: D1, changes: [fresh] });
    // A completed review write outside the allowlist means the journal cannot be trusted.
    write('r3', 'research/raw/E-01.md');
    expect(() => research.reviewContext('j1')).toThrow('RESEARCH_STATE_INVALID');
    expect(() => research.reviewContext('missing')).toThrow('NOT_FOUND');
  });

  test('research.recover sorts review jobs into freeze, packaging and interrupted, and names discardable review folders', () => {
    const { store } = open();
    collectedJob(store, 'freeze', 'p1', '21'); reviewRun(store, 'r-freeze', 'awaiting_review', 'p1'); startReview(store, 'freeze', 'r-freeze');
    collectedJob(store, 'interrupted', 'p2', '22'); reviewRun(store, 'r-interrupted', 'interrupted', 'p2'); startReview(store, 'interrupted', 'r-interrupted');
    collectedJob(store, 'packaging', 'p3', '23'); reviewRun(store, 'r-packaging', 'awaiting_review', 'p3'); startReview(store, 'packaging', 'r-packaging'); step(store, 'packaging', 'packaging', 'main', { reviewDigest: D1 });
    collectedJob(store, 'owned', 'p4', '24'); reviewRun(store, 'r-owned', 'cancelled', 'p4'); startReview(store, 'owned', 'r-owned');
    collectedJob(store, 'approved', 'p5', '25'); startReview(store, 'approved', 'r-approved'); step(store, 'approved', 'packaging', 'main', { reviewDigest: D1 }); approve(store, 'approved');
    collectedJob(store, 'collected', 'p6', '26');
    collectedJob(store, 'not-ready', 'p7', '27'); startReview(store, 'not-ready', 'r-not-ready'); step(store, 'not-ready', 'not_ready', 'main', { failure: 'REVIEW_GATE_FAILED' });
    project(store, 'public-technical', 'p8'); create(store, 'failed', 'p8'); step(store, 'failed', 'failed', 'main', { failure: 'X_CODE' });
    project(store, 'public-technical', 'p9'); create(store, 'cancelled', 'p9'); step(store, 'cancelled', 'cancelled', 'user');
    const { jobs: research, published } = jobs(store);
    const folders = ['absent', 'freeze', 'interrupted', 'packaging', 'owned', 'approved', 'collected', 'not-ready', 'failed', 'cancelled', 'absent'];
    const result = ResearchRecoverySchema.parse(structuredClone(research.recover(['owned'], folders)));
    expect(result).toEqual({ failed: [], cancelled: [], resume: [], dispatchable: [], unreadable: [], reviewing: ['interrupted'], freeze: ['freeze'], packaging: ['packaging'], reviewDiscard: ['absent', 'approved', 'failed', 'cancelled'] });
    expect(store.getResearch('interrupted')).toMatchObject({ status: 'not_ready', failure: 'REVIEW_INTERRUPTED' });
    expect(store.researchEvents('interrupted').events.at(-1)).toMatchObject({ actor: 'recovery', cause: 'RECOVERED' });
    expect(store.getResearch('freeze')).toMatchObject({ status: 'reviewing' }); expect(store.getResearch('owned')).toMatchObject({ status: 'reviewing' });
    expect(published.map(r => [r.id, r.status])).toEqual([['interrupted', 'not_ready']]);
    // Idempotent: nothing more to interrupt; the lists that need main's work are offered again.
    expect(research.recover(['owned'])).toMatchObject({ reviewing: [], freeze: ['freeze'], packaging: ['packaging'], reviewDiscard: [] });
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
    // Main may name the review outcomes (Task 5), so readiness is the engine's to refuse: no review edge leaves queued,
    // and v4's readiness trigger demands a frozen digest, a packaging step and main's KIT_APPROVED journal row.
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
