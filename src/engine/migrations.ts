import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 4;

const initialSchema = `
CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, root_path TEXT NOT NULL,
  path_label TEXT NOT NULL, trusted INTEGER NOT NULL CHECK(trusted IN (0,1)),
  trust_revision INTEGER NOT NULL CHECK(trust_revision >= 0),
  policy TEXT NOT NULL CHECK(json_valid(policy)), missing INTEGER NOT NULL CHECK(missing IN (0,1)), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(id, project_id)
) STRICT;
CREATE INDEX sessions_project ON sessions(project_id, updated_at DESC);
CREATE TABLE profile_revisions (
  revision_id TEXT PRIMARY KEY NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
  kind TEXT NOT NULL, endpoint TEXT NOT NULL, model TEXT NOT NULL,
  context_tokens INTEGER NOT NULL CHECK(context_tokens > 0), output_tokens INTEGER NOT NULL CHECK(output_tokens > 0),
  locality TEXT NOT NULL CHECK(locality IN ('local','external')), secret_ref TEXT,
  revision INTEGER NOT NULL CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(id,revision), UNIQUE(id,revision_id)
) STRICT;
CREATE TABLE profiles (
  id TEXT PRIMARY KEY NOT NULL, revision_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY(id,revision_id) REFERENCES profile_revisions(id,revision_id)
) STRICT;
CREATE TABLE runs (
  id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, project_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('ask','plan','research','build','mission')),
  status TEXT NOT NULL CHECK(status IN ('queued','running','awaiting_approval','awaiting_review','cancelling','completed','failed','cancelled','interrupted')),
  profile_id TEXT NOT NULL, profile_revision_id TEXT NOT NULL,
  policy_revision INTEGER NOT NULL, trust_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL, finished_at TEXT, next_seq INTEGER NOT NULL DEFAULT 1 CHECK(next_seq > 0),
  FOREIGN KEY(session_id,project_id) REFERENCES sessions(id,project_id) ON DELETE CASCADE,
  FOREIGN KEY(profile_id,profile_revision_id) REFERENCES profile_revisions(id,revision_id),
  UNIQUE(id,session_id), UNIQUE(id,project_id)
) STRICT;
CREATE INDEX runs_session ON runs(session_id, created_at);
CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  run_id TEXT, role TEXT NOT NULL CHECK(role IN ('system','user','assistant','tool')),
  content TEXT NOT NULL, tool_call_id TEXT, tool_name TEXT, tool_calls TEXT CHECK(tool_calls IS NULL OR json_valid(tool_calls)),
  partial INTEGER CHECK(partial IS NULL OR partial IN (0,1)), created_at TEXT NOT NULL,
  FOREIGN KEY(run_id,session_id) REFERENCES runs(id,session_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX messages_session ON messages(session_id,created_at);
CREATE TABLE provider_wire_state (
  message_id TEXT PRIMARY KEY NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  profile_revision_id TEXT NOT NULL REFERENCES profile_revisions(revision_id),
  state TEXT NOT NULL CHECK(json_valid(state))
) STRICT;
CREATE TABLE events (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, seq INTEGER NOT NULL CHECK(seq > 0),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1), engine_epoch TEXT NOT NULL,
  type TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), at INTEGER NOT NULL,
  PRIMARY KEY(run_id,seq)
) STRICT;
CREATE TABLE operations (
  id TEXT PRIMARY KEY NOT NULL, run_id TEXT NOT NULL, project_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('read','write','command','research')),
  input_hash TEXT NOT NULL, policy_revision INTEGER NOT NULL, trust_revision INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('prepared','started','completed','failed','unknown')),
  input TEXT NOT NULL CHECK(json_valid(input)), result TEXT CHECK(result IS NULL OR json_valid(result)),
  before_ref TEXT, after_ref TEXT, snapshot_ref TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(run_id,project_id) REFERENCES runs(id,project_id) ON DELETE CASCADE, UNIQUE(id,project_id)
) STRICT;
CREATE INDEX operations_run ON operations(run_id,created_at);
CREATE TABLE approvals (
  id TEXT PRIMARY KEY NOT NULL, operation_id TEXT NOT NULL, project_id TEXT NOT NULL,
  input_hash TEXT NOT NULL, policy_revision INTEGER NOT NULL, trust_revision INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('allow','deny')), created_at TEXT NOT NULL,
  FOREIGN KEY(operation_id,project_id) REFERENCES operations(id,project_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX approvals_operation ON approvals(operation_id);
CREATE TABLE missions (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0),
  state TEXT NOT NULL CHECK(json_valid(state)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX missions_project ON missions(project_id,updated_at DESC);
CREATE TABLE research (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id TEXT, status TEXT NOT NULL, state TEXT NOT NULL CHECK(json_valid(state)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(run_id,project_id) REFERENCES runs(id,project_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX research_project ON research(project_id,updated_at DESC);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
CREATE TABLE accepted_requests (
  client_request_id TEXT PRIMARY KEY NOT NULL, method TEXT NOT NULL, canonical_input_hash TEXT NOT NULL,
  entity_id TEXT NOT NULL, response TEXT NOT NULL CHECK(json_valid(response)), accepted_at TEXT NOT NULL
) STRICT;
CREATE VIRTUAL TABLE history_fts USING fts5(content, content='messages', content_rowid='rowid', tokenize='unicode61');
CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO history_fts(rowid,content) VALUES(new.rowid,new.content);
END;
CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO history_fts(history_fts,rowid,content) VALUES('delete',old.rowid,old.content);
END;
CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages BEGIN
  INSERT INTO history_fts(history_fts,rowid,content) VALUES('delete',old.rowid,old.content);
  INSERT INTO history_fts(rowid,content) VALUES(new.rowid,new.content);
END;
`;

/** Refuse unsupported databases before changing journal settings or schema. */
export function assertSupportedSchema(db: Database.Database): number {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version > SCHEMA_VERSION) throw new Error(`Database uses newer schema ${version}; supported version is ${SCHEMA_VERSION}`);
  return version;
}

// Preserve the v1 DDL above as the migration's stable source definition.
function migrateChat(db: Database.Database): void {
  const sessions = initialSchema.split('CREATE TABLE sessions (')[1]!.split(') STRICT;')[0]!;
  const runs = initialSchema.split('CREATE TABLE runs (')[1]!.split(') STRICT;')[0]!;
  db.exec(`CREATE TABLE new_sessions (${sessions.replace('project_id TEXT NOT NULL', 'project_id TEXT').replace('UNIQUE(id, project_id)', 'policy TEXT NOT NULL CHECK(json_valid(policy)), UNIQUE(id, project_id)')}) STRICT;
    INSERT INTO new_sessions SELECT *, '{"revision":0,"inference":"cloud-allowed"}' FROM sessions;
    DROP TABLE sessions;
    ALTER TABLE new_sessions RENAME TO sessions;
    CREATE INDEX sessions_project ON sessions(project_id, updated_at DESC);
    CREATE TABLE new_runs (${runs.replace('project_id TEXT NOT NULL', 'project_id TEXT').replace('FOREIGN KEY(session_id,project_id)', 'session_policy_revision INTEGER NOT NULL DEFAULT 0 CHECK(session_policy_revision >= 0), FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE, FOREIGN KEY(session_id,project_id)')}) STRICT;
    INSERT INTO new_runs SELECT *, 0 FROM runs;
    DROP TABLE runs;
    ALTER TABLE new_runs RENAME TO runs;
    CREATE INDEX runs_session ON runs(session_id, created_at);
    CREATE TRIGGER runs_scope_insert BEFORE INSERT ON runs
      WHEN NOT EXISTS(SELECT 1 FROM sessions WHERE id=NEW.session_id AND project_id IS NEW.project_id)
      BEGIN SELECT RAISE(ABORT, 'RUN_SCOPE_MISMATCH'); END;
    CREATE TRIGGER runs_scope_update BEFORE UPDATE OF session_id,project_id ON runs
      WHEN NOT EXISTS(SELECT 1 FROM sessions WHERE id=NEW.session_id AND project_id IS NEW.project_id)
      BEGIN SELECT RAISE(ABORT, 'RUN_SCOPE_MISMATCH'); END;
    CREATE TRIGGER sessions_scope_immutable BEFORE UPDATE OF project_id ON sessions
      WHEN OLD.project_id IS NOT NEW.project_id
      BEGIN SELECT RAISE(ABORT, 'SESSION_SCOPE_IMMUTABLE'); END;`);
}

// v3 research DDL, frozen: this step's stable source definition, as initialSchema is for v1. v4 rebuilds these tables below.
const researchStatuses = `'queued','dispatching','collecting','collected','reviewing','approved','not_ready','failed','cancelling','cancelled'`;
// Research jobs are run-less: a journal row precedes every state change, identity is write-once, and readiness is unreachable here.
const researchJobsSchema = `
CREATE TABLE research (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision > 0),
  status TEXT NOT NULL CHECK(status IN (${researchStatuses})),
  topic TEXT NOT NULL CHECK(length(topic) BETWEEN 1 AND 2048),
  inputs TEXT NOT NULL CHECK(json_valid(inputs) AND length(inputs) <= 131072),
  client_ref TEXT NOT NULL UNIQUE CHECK(length(client_ref) BETWEEN 1 AND 64 AND client_ref GLOB '[A-Za-z0-9]*' AND client_ref NOT GLOB '*[^A-Za-z0-9._-]*'),
  research_level TEXT NOT NULL CHECK(research_level IN ('public-technical','private-connected')),
  policy_revision INTEGER NOT NULL CHECK(policy_revision >= 0), trust_revision INTEGER NOT NULL CHECK(trust_revision >= 0),
  collector_revision INTEGER CHECK(collector_revision >= 0), repository TEXT CHECK(length(repository) BETWEEN 3 AND 140),
  workflow TEXT CHECK(length(workflow) BETWEEN 5 AND 133), ref TEXT CHECK(length(ref) BETWEEN 1 AND 255), dispatched_at TEXT,
  workflow_run_id TEXT UNIQUE CHECK(length(workflow_run_id) BETWEEN 1 AND 16 AND workflow_run_id NOT GLOB '*[^0-9]*' AND workflow_run_id NOT GLOB '0*'),
  failure TEXT CHECK(length(failure) BETWEEN 2 AND 64 AND failure GLOB '[A-Z]*' AND failure NOT GLOB '*[^A-Z0-9_]*'),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK((repository IS NULL) = (workflow IS NULL) AND (repository IS NULL) = (ref IS NULL) AND (repository IS NULL) = (collector_revision IS NULL) AND (repository IS NULL) = (dispatched_at IS NULL)),
  CHECK(status <> 'queued' OR (repository IS NULL AND workflow_run_id IS NULL AND failure IS NULL)),
  CHECK(status IN ('queued','failed','cancelled') OR repository IS NOT NULL),
  CHECK(status <> 'dispatching' OR workflow_run_id IS NULL),
  CHECK(status NOT IN ('collecting','collected','reviewing','approved','not_ready') OR workflow_run_id IS NOT NULL),
  CHECK(workflow_run_id IS NULL OR repository IS NOT NULL),
  CHECK(status <> 'failed' OR failure IS NOT NULL),
  CHECK(failure IS NULL OR status IN ('failed','not_ready','cancelled'))
) STRICT;
CREATE INDEX research_project ON research(project_id,updated_at DESC);
CREATE UNIQUE INDEX research_active ON research(project_id) WHERE status IN ('queued','dispatching','collecting','reviewing','cancelling');
CREATE TABLE research_events (
  research_id TEXT NOT NULL REFERENCES research(id) ON DELETE CASCADE, revision INTEGER NOT NULL CHECK(revision > 0),
  from_status TEXT CHECK(from_status IN (${researchStatuses})), to_status TEXT NOT NULL CHECK(to_status IN (${researchStatuses})),
  actor TEXT NOT NULL CHECK(actor IN ('user','main','recovery')), request_id TEXT CHECK(length(request_id) BETWEEN 1 AND 128),
  cause TEXT NOT NULL CHECK(length(cause) BETWEEN 2 AND 64 AND cause GLOB '[A-Z]*' AND cause NOT GLOB '*[^A-Z0-9_]*'),
  detail TEXT NOT NULL CHECK(json_valid(detail) AND length(detail) <= 4096), engine_epoch TEXT NOT NULL, at INTEGER NOT NULL CHECK(at >= 0),
  PRIMARY KEY(research_id,revision),
  CHECK((revision = 1) = (from_status IS NULL) AND (revision = 1) = (to_status = 'queued')),
  CHECK(from_status IS NOT to_status)
) STRICT;
CREATE UNIQUE INDEX research_single_dispatch ON research_events(research_id) WHERE to_status = 'dispatching';
CREATE TRIGGER research_insert_guard BEFORE INSERT ON research
  WHEN NEW.status IS NOT 'queued' OR NEW.revision IS NOT 1
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_WRITE_INVALID'); END;
CREATE TRIGGER research_update_journaled BEFORE UPDATE ON research
  WHEN NEW.revision IS NOT OLD.revision + 1 OR NOT EXISTS(SELECT 1 FROM research_events WHERE research_id=NEW.id AND revision=NEW.revision AND from_status=OLD.status AND to_status=NEW.status)
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_TRANSITION_UNJOURNALED'); END;
CREATE TRIGGER research_identity_immutable BEFORE UPDATE ON research
  WHEN NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.client_ref IS NOT OLD.client_ref OR NEW.topic IS NOT OLD.topic
    OR NEW.inputs IS NOT OLD.inputs OR NEW.research_level IS NOT OLD.research_level OR NEW.policy_revision IS NOT OLD.policy_revision
    OR NEW.trust_revision IS NOT OLD.trust_revision OR NEW.created_at IS NOT OLD.created_at
    OR (OLD.repository IS NOT NULL AND (NEW.repository IS NOT OLD.repository OR NEW.workflow IS NOT OLD.workflow OR NEW.ref IS NOT OLD.ref
      OR NEW.collector_revision IS NOT OLD.collector_revision OR NEW.dispatched_at IS NOT OLD.dispatched_at))
    OR (OLD.workflow_run_id IS NOT NULL AND NEW.workflow_run_id IS NOT OLD.workflow_run_id)
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER research_readiness_reserved BEFORE UPDATE OF status ON research
  WHEN NEW.status = 'approved'
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_READINESS_RESERVED'); END;
CREATE TRIGGER research_events_step BEFORE INSERT ON research_events
  WHEN NOT EXISTS(SELECT 1 FROM research WHERE id=NEW.research_id AND ((NEW.revision=1 AND revision=1 AND status='queued') OR (NEW.revision>1 AND revision=NEW.revision-1 AND status=NEW.from_status)))
  BEGIN SELECT RAISE(ABORT, 'STALE_REVISION'); END;
CREATE TRIGGER research_events_append_only BEFORE UPDATE ON research_events
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_JOURNAL_APPEND_ONLY'); END;
CREATE TRIGGER research_events_retained BEFORE DELETE ON research_events
  WHEN EXISTS(SELECT 1 FROM research WHERE id=OLD.research_id)
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_JOURNAL_APPEND_ONLY'); END;`;

// No released build wrote v2 research rows, and they carry no dispatch identity. Keep any that exist verbatim
// under their v1/v2 definition rather than inventing a topic or client ref, or deleting them.
function migrateResearchJobs(db: Database.Database): void {
  const legacy = initialSchema.split('CREATE TABLE research (')[1]!.split(') STRICT;')[0]!;
  db.exec(`CREATE TABLE research_legacy (${legacy}) STRICT;
    INSERT INTO research_legacy (id,project_id,run_id,status,state,created_at,updated_at) SELECT id,project_id,run_id,status,state,created_at,updated_at FROM research;
    DROP TABLE research;
    ${researchJobsSchema}`);
}

const reviewStatuses = `'queued','dispatching','collecting','collected','reviewing','packaging','approved','not_ready','failed','cancelling','cancelled'`;
const v3ResearchColumns = 'id,project_id,revision,status,topic,inputs,client_ref,research_level,policy_revision,trust_revision,collector_revision,repository,workflow,ref,dispatched_at,workflow_run_id,failure,created_at,updated_at';
const v3ResearchEventColumns = 'research_id,revision,from_status,to_status,actor,request_id,cause,detail,engine_epoch,at';
// v4 tables, created under new names and renamed into place. new_research_events names its final parent, research.
const reviewTables = `
CREATE TABLE new_research (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision > 0),
  status TEXT NOT NULL CHECK(status IN (${reviewStatuses})),
  topic TEXT NOT NULL CHECK(length(topic) BETWEEN 1 AND 2048),
  inputs TEXT NOT NULL CHECK(json_valid(inputs) AND length(inputs) <= 131072),
  client_ref TEXT NOT NULL UNIQUE CHECK(length(client_ref) BETWEEN 1 AND 64 AND client_ref GLOB '[A-Za-z0-9]*' AND client_ref NOT GLOB '*[^A-Za-z0-9._-]*'),
  research_level TEXT NOT NULL CHECK(research_level IN ('public-technical','private-connected')),
  policy_revision INTEGER NOT NULL CHECK(policy_revision >= 0), trust_revision INTEGER NOT NULL CHECK(trust_revision >= 0),
  collector_revision INTEGER CHECK(collector_revision >= 0), repository TEXT CHECK(length(repository) BETWEEN 3 AND 140),
  workflow TEXT CHECK(length(workflow) BETWEEN 5 AND 133), ref TEXT CHECK(length(ref) BETWEEN 1 AND 255), dispatched_at TEXT,
  workflow_run_id TEXT UNIQUE CHECK(length(workflow_run_id) BETWEEN 1 AND 16 AND workflow_run_id NOT GLOB '*[^0-9]*' AND workflow_run_id NOT GLOB '0*'),
  failure TEXT CHECK(length(failure) BETWEEN 2 AND 64 AND failure GLOB '[A-Z]*' AND failure NOT GLOB '*[^A-Z0-9_]*'),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  review_session_id TEXT CHECK(length(review_session_id) BETWEEN 1 AND 128),
  review_run_id TEXT CHECK(length(review_run_id) BETWEEN 1 AND 128),
  review_digest TEXT CHECK(length(review_digest) = 64 AND review_digest NOT GLOB '*[^0-9a-f]*'),
  reviewed_package_sha256 TEXT CHECK(length(reviewed_package_sha256) = 64 AND reviewed_package_sha256 NOT GLOB '*[^0-9a-f]*'),
  reviewed_validator_revision TEXT CHECK(length(reviewed_validator_revision) = 40 AND reviewed_validator_revision NOT GLOB '*[^0-9a-f]*'),
  reviewed_bound_revision INTEGER CHECK(reviewed_bound_revision > 0),
  CHECK((repository IS NULL) = (workflow IS NULL) AND (repository IS NULL) = (ref IS NULL) AND (repository IS NULL) = (collector_revision IS NULL) AND (repository IS NULL) = (dispatched_at IS NULL)),
  CHECK(status <> 'queued' OR (repository IS NULL AND workflow_run_id IS NULL AND failure IS NULL)),
  CHECK(status IN ('queued','failed','cancelled') OR repository IS NOT NULL),
  CHECK(status <> 'dispatching' OR workflow_run_id IS NULL),
  CHECK(status NOT IN ('collecting','collected','reviewing','packaging','approved','not_ready') OR workflow_run_id IS NOT NULL),
  CHECK(workflow_run_id IS NULL OR repository IS NOT NULL),
  CHECK(status <> 'failed' OR failure IS NOT NULL),
  CHECK(failure IS NULL OR status IN ('failed','not_ready','cancelled')),
  CHECK((review_run_id IS NULL) = (review_session_id IS NULL)),
  CHECK((reviewed_package_sha256 IS NULL) = (reviewed_validator_revision IS NULL) AND (reviewed_package_sha256 IS NULL) = (reviewed_bound_revision IS NULL)),
  CHECK(status NOT IN ('reviewing','packaging') OR (review_run_id IS NOT NULL AND review_session_id IS NOT NULL)),
  CHECK(status <> 'packaging' OR review_digest IS NOT NULL),
  CHECK(status <> 'approved' OR (review_digest IS NOT NULL AND reviewed_package_sha256 IS NOT NULL
    AND reviewed_validator_revision IS NOT NULL AND reviewed_bound_revision IS NOT NULL AND failure IS NULL)),
  CHECK(status <> 'reviewing' OR (review_digest IS NULL AND failure IS NULL AND reviewed_package_sha256 IS NULL))
) STRICT;
CREATE TABLE new_research_events (
  research_id TEXT NOT NULL REFERENCES research(id) ON DELETE CASCADE, revision INTEGER NOT NULL CHECK(revision > 0),
  from_status TEXT CHECK(from_status IN (${reviewStatuses})), to_status TEXT NOT NULL CHECK(to_status IN (${reviewStatuses})),
  actor TEXT NOT NULL CHECK(actor IN ('user','main','recovery','engine')), request_id TEXT CHECK(length(request_id) BETWEEN 1 AND 128),
  cause TEXT NOT NULL CHECK(length(cause) BETWEEN 2 AND 64 AND cause GLOB '[A-Z]*' AND cause NOT GLOB '*[^A-Z0-9_]*'),
  detail TEXT NOT NULL CHECK(json_valid(detail) AND length(detail) <= 4096), engine_epoch TEXT NOT NULL, at INTEGER NOT NULL CHECK(at >= 0),
  PRIMARY KEY(research_id,revision),
  CHECK((revision = 1) = (from_status IS NULL) AND (revision = 1) = (to_status = 'queued')),
  CHECK(from_status IS NOT to_status)
) STRICT;`;
// Every index and trigger of both tables, recreated after the rename (DROP TABLE removed them). The v3 objects are
// unchanged except research_active (gains packaging); research_readiness_reserved is replaced by research_readiness_digest.
const reviewObjects = `
CREATE INDEX research_project ON research(project_id,updated_at DESC);
CREATE UNIQUE INDEX research_active ON research(project_id) WHERE status IN ('queued','dispatching','collecting','reviewing','packaging','cancelling');
CREATE UNIQUE INDEX research_single_dispatch ON research_events(research_id) WHERE to_status = 'dispatching';
CREATE TRIGGER research_insert_guard BEFORE INSERT ON research
  WHEN NEW.status IS NOT 'queued' OR NEW.revision IS NOT 1
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_WRITE_INVALID'); END;
CREATE TRIGGER research_update_journaled BEFORE UPDATE ON research
  WHEN NEW.revision IS NOT OLD.revision + 1 OR NOT EXISTS(SELECT 1 FROM research_events WHERE research_id=NEW.id AND revision=NEW.revision AND from_status=OLD.status AND to_status=NEW.status)
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_TRANSITION_UNJOURNALED'); END;
CREATE TRIGGER research_identity_immutable BEFORE UPDATE ON research
  WHEN NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.client_ref IS NOT OLD.client_ref OR NEW.topic IS NOT OLD.topic
    OR NEW.inputs IS NOT OLD.inputs OR NEW.research_level IS NOT OLD.research_level OR NEW.policy_revision IS NOT OLD.policy_revision
    OR NEW.trust_revision IS NOT OLD.trust_revision OR NEW.created_at IS NOT OLD.created_at
    OR (OLD.repository IS NOT NULL AND (NEW.repository IS NOT OLD.repository OR NEW.workflow IS NOT OLD.workflow OR NEW.ref IS NOT OLD.ref
      OR NEW.collector_revision IS NOT OLD.collector_revision OR NEW.dispatched_at IS NOT OLD.dispatched_at))
    OR (OLD.workflow_run_id IS NOT NULL AND NEW.workflow_run_id IS NOT OLD.workflow_run_id)
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER research_readiness_digest BEFORE UPDATE OF status ON research
  WHEN NEW.status = 'approved' AND (
    OLD.status IS NOT 'packaging'
    OR NEW.review_digest IS NOT OLD.review_digest
    OR NEW.reviewed_package_sha256 IS NULL
    OR NOT EXISTS(SELECT 1 FROM research_events WHERE research_id = NEW.id AND from_status = 'collecting' AND to_status = 'collected'
      AND json_extract(detail, '$.verification.artifactSha256') IS NOT NULL
      AND lower(json_extract(detail, '$.verification.artifactSha256')) IS NOT NEW.reviewed_package_sha256)
    OR NOT EXISTS(SELECT 1 FROM research_events WHERE research_id = NEW.id AND revision = NEW.revision
      AND from_status = 'packaging' AND to_status = 'approved' AND actor = 'main' AND cause = 'KIT_APPROVED'
      AND json_extract(detail, '$.reviewedPackage.sha256') = NEW.reviewed_package_sha256))
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_READINESS_UNVERIFIED'); END;
CREATE TRIGGER research_reviewed_immutable BEFORE UPDATE ON research
  WHEN OLD.status = 'approved' AND (NEW.status IS NOT OLD.status OR NEW.review_digest IS NOT OLD.review_digest
    OR NEW.reviewed_package_sha256 IS NOT OLD.reviewed_package_sha256 OR NEW.reviewed_validator_revision IS NOT OLD.reviewed_validator_revision
    OR NEW.reviewed_bound_revision IS NOT OLD.reviewed_bound_revision OR NEW.review_run_id IS NOT OLD.review_run_id OR NEW.review_session_id IS NOT OLD.review_session_id)
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER research_events_step BEFORE INSERT ON research_events
  WHEN NOT EXISTS(SELECT 1 FROM research WHERE id=NEW.research_id AND ((NEW.revision=1 AND revision=1 AND status='queued') OR (NEW.revision>1 AND revision=NEW.revision-1 AND status=NEW.from_status)))
  BEGIN SELECT RAISE(ABORT, 'STALE_REVISION'); END;
CREATE TRIGGER research_events_append_only BEFORE UPDATE ON research_events
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_JOURNAL_APPEND_ONLY'); END;
CREATE TRIGGER research_events_retained BEFORE DELETE ON research_events
  WHEN EXISTS(SELECT 1 FROM research WHERE id=OLD.research_id)
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_JOURNAL_APPEND_ONLY'); END;`;
/** The objects of both tables after v4, autoindexes aside, as [type, name] in name order. */
export const REVIEW_SCHEMA_OBJECTS: ReadonlyArray<readonly [string, string]> = [
  ['table', 'research'], ['index', 'research_active'], ['table', 'research_events'], ['trigger', 'research_events_append_only'],
  ['trigger', 'research_events_retained'], ['trigger', 'research_events_step'], ['trigger', 'research_identity_immutable'], ['trigger', 'research_insert_guard'],
  ['index', 'research_project'], ['trigger', 'research_readiness_digest'], ['trigger', 'research_reviewed_immutable'], ['index', 'research_single_dispatch'],
  ['trigger', 'research_update_journaled'],
];

/**
 * v4 (Task 5 review) rebuilds research and research_events, because SQLite cannot change a CHECK in place. The order is
 * sqlite.org's (docs/research/2026-10-03-sqlite-table-rebuild, E-01, E-04): create the new tables, copy with explicit
 * columns, drop the old, rename the new, recreate every index and trigger, then assert the result. migrate() owns the
 * frame: foreign keys off outside the transaction, one transaction, foreign_key_check, user_version last.
 */
function migrateResearchReview(db: Database.Database): void {
  // No v3 edge reaches reviewing or approved; a row in either has no mapping to v4's review columns, so refuse.
  if ((db.prepare("SELECT count(*) AS n FROM research WHERE status IN ('reviewing','approved')").get() as { n: number }).n) throw new Error('MIGRATION_RESEARCH_STATE');
  const counts = () => ['research', 'research_events'].map(table => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n);
  const before = counts();
  db.exec(`${reviewTables}
    INSERT INTO new_research (${v3ResearchColumns}) SELECT ${v3ResearchColumns} FROM research;
    INSERT INTO new_research_events (${v3ResearchEventColumns}) SELECT ${v3ResearchEventColumns} FROM research_events;
    DROP TABLE research_events;
    DROP TABLE research;
    ALTER TABLE new_research RENAME TO research;
    ALTER TABLE new_research_events RENAME TO research_events;
    ${reviewObjects}`);
  const objects = db.prepare("SELECT type,name FROM sqlite_master WHERE tbl_name IN ('research','research_events') AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name").all() as Array<{ type: string; name: string }>;
  if (JSON.stringify(objects.map(o => [o.type, o.name])) !== JSON.stringify(REVIEW_SCHEMA_OBJECTS)) throw new Error('MIGRATION_SCHEMA_MISMATCH');
  if (JSON.stringify(counts()) !== JSON.stringify(before)) throw new Error('MIGRATION_ROW_COUNT_MISMATCH');
}

export function migrate(db: Database.Database): void {
  assertSupportedSchema(db);
  // SQLite cannot toggle FK enforcement inside a transaction. Restore even on rollback.
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      let version = assertSupportedSchema(db);
      if (version === 0) { db.exec(initialSchema); version = 1; }
      if (version === 1) { migrateChat(db); version = 2; }
      if (version === 2) { migrateResearchJobs(db); version = 3; }
      if (version === 3) migrateResearchReview(db);
      if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('MIGRATION_FOREIGN_KEY_FAILURE');
      db.pragma(`user_version = ${SCHEMA_VERSION}`);
    }).immediate();
  } finally { db.pragma('foreign_keys = ON'); }
}
