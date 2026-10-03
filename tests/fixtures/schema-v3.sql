-- Exact v3 schema SQL produced by MoonAliza ab92529 src/engine/migrations.ts migrate() (SCHEMA_VERSION 3): sqlite_master in rowid order, excluding autoindexes and history_fts shadow tables.
-- user_version=3 appended to model a database created by a v3 build.
CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, root_path TEXT NOT NULL,
  path_label TEXT NOT NULL, trusted INTEGER NOT NULL CHECK(trusted IN (0,1)),
  trust_revision INTEGER NOT NULL CHECK(trust_revision >= 0),
  policy TEXT NOT NULL CHECK(json_valid(policy)), missing INTEGER NOT NULL CHECK(missing IN (0,1)), created_at TEXT NOT NULL
) STRICT;
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
CREATE TABLE "sessions" (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, policy TEXT NOT NULL CHECK(json_valid(policy)), UNIQUE(id, project_id)
) STRICT;
CREATE INDEX sessions_project ON sessions(project_id, updated_at DESC);
CREATE TABLE "runs" (
  id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, project_id TEXT,
  mode TEXT NOT NULL CHECK(mode IN ('ask','plan','research','build','mission')),
  status TEXT NOT NULL CHECK(status IN ('queued','running','awaiting_approval','awaiting_review','cancelling','completed','failed','cancelled','interrupted')),
  profile_id TEXT NOT NULL, profile_revision_id TEXT NOT NULL,
  policy_revision INTEGER NOT NULL, trust_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL, finished_at TEXT, next_seq INTEGER NOT NULL DEFAULT 1 CHECK(next_seq > 0),
  session_policy_revision INTEGER NOT NULL DEFAULT 0 CHECK(session_policy_revision >= 0), FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE, FOREIGN KEY(session_id,project_id) REFERENCES sessions(id,project_id) ON DELETE CASCADE,
  FOREIGN KEY(profile_id,profile_revision_id) REFERENCES profile_revisions(id,revision_id),
  UNIQUE(id,session_id), UNIQUE(id,project_id)
) STRICT;
CREATE INDEX runs_session ON runs(session_id, created_at);
CREATE TRIGGER runs_scope_insert BEFORE INSERT ON runs
      WHEN NOT EXISTS(SELECT 1 FROM sessions WHERE id=NEW.session_id AND project_id IS NEW.project_id)
      BEGIN SELECT RAISE(ABORT, 'RUN_SCOPE_MISMATCH'); END;
CREATE TRIGGER runs_scope_update BEFORE UPDATE OF session_id,project_id ON runs
      WHEN NOT EXISTS(SELECT 1 FROM sessions WHERE id=NEW.session_id AND project_id IS NEW.project_id)
      BEGIN SELECT RAISE(ABORT, 'RUN_SCOPE_MISMATCH'); END;
CREATE TRIGGER sessions_scope_immutable BEFORE UPDATE OF project_id ON sessions
      WHEN OLD.project_id IS NOT NEW.project_id
      BEGIN SELECT RAISE(ABORT, 'SESSION_SCOPE_IMMUTABLE'); END;
CREATE TABLE research_legacy (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id TEXT, status TEXT NOT NULL, state TEXT NOT NULL CHECK(json_valid(state)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(run_id,project_id) REFERENCES runs(id,project_id) ON DELETE CASCADE
) STRICT;
CREATE TABLE research (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision > 0),
  status TEXT NOT NULL CHECK(status IN ('queued','dispatching','collecting','collected','reviewing','approved','not_ready','failed','cancelling','cancelled')),
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
  from_status TEXT CHECK(from_status IN ('queued','dispatching','collecting','collected','reviewing','approved','not_ready','failed','cancelling','cancelled')), to_status TEXT NOT NULL CHECK(to_status IN ('queued','dispatching','collecting','collected','reviewing','approved','not_ready','failed','cancelling','cancelled')),
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
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_JOURNAL_APPEND_ONLY'); END;
PRAGMA user_version = 3;
