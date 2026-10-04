import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ProjectSchema, RunSchema, SessionSchema, type Request, type Run } from '../shared';

/** A run main holds a capability for (index.ts keeps a GitHub reader beside these). */
export interface ActiveRun { run: Run; stop: AbortController }
type PolicyUpdate = Extract<Request, { method: 'project.policy.update' }>;
type RunStart = Extract<Request, { method: 'run.start' }>;
export interface PolicyRouteHost {
  /** Forwards a request to the engine. */
  request(request: Request): Promise<unknown>;
  active: Map<string, ActiveRun>;
  revokeContext(runId: string): void;
  holdCollector(projectId: string): () => void;
  holdReview(projectId: string): () => void;
  /** True while a command or kit tool executes in main (run.start refuses `RUN_ACTIVE` then, as before). */
  commandsExecuting(): boolean;
  /** Installs main's capability for a run the engine admitted. */
  admit(run: Run): void;
}

const terminal = new Set<Run['status']>(['completed', 'failed', 'cancelled', 'interrupted']);
const ProjectListSchema = z.object({ projects: z.array(ProjectSchema) });
const SessionListSchema = z.object({ sessions: z.array(SessionSchema) });
const SessionRunsSchema = z.object({ runs: z.array(RunSchema) });
const SessionProjectSchema = z.object({ session: z.object({ projectId: z.string().nullable() }) });

/** One FIFO lock per project: a task runs only after every earlier task for that project has settled. */
export class ProjectLocks {
  private readonly tails = new Map<string, Promise<void>>();
  async run<T>(projectId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(projectId) ?? Promise.resolve();
    let release!: () => void;
    const tail = previous.then(() => new Promise<void>(done => { release = done; }));
    this.tails.set(projectId, tail);
    await previous;
    try { return await task(); } finally { release(); if (this.tails.get(projectId) === tail) this.tails.delete(projectId); }
  }
}

/**
 * Main's route for `project.policy.update` and `run.start` (research-review-ui spec section 4, "Never while other work
 * runs"). Both take the project's lock, so no run is admitted between the update's check and its stop. Under the lock an
 * update that leaves `inference` unchanged refuses `RUN_ACTIVE` while a non-research run is live in the project, before
 * any signal is aborted, vault context revoked or supervisor held; otherwise it stops, holds and forwards as before.
 */
export function createPolicyRoute(host: PolicyRouteHost) {
  const locks = new ProjectLocks();
  const read = (method: 'project.list' | 'session.list' | 'session.read', params: unknown) =>
    host.request({ protocolVersion: 1, clientRequestId: randomUUID(), method, params } as Request);

  async function nonResearchRunActive(projectId: string): Promise<boolean> {
    const { sessions } = SessionListSchema.parse(await read('session.list', { projectId }));
    for (const session of sessions) {
      const { runs } = SessionRunsSchema.parse(await read('session.read', { sessionId: session.id }));
      if (runs.some(run => run.mode !== 'research' && !terminal.has(run.status))) return true;
    }
    return false;
  }

  async function updatePolicy(request: PolicyUpdate): Promise<unknown> {
    const { projectId } = request.params;
    return locks.run(projectId, async () => {
      const { projects } = ProjectListSchema.parse(await read('project.list', {}));
      const current = projects.find(project => project.id === projectId);
      // An unknown project is the engine's PROJECT_NOT_FOUND, answered as before.
      if (current && request.params.policy.inference === current.policy.inference && await nonResearchRunActive(projectId)) throw new Error('RUN_ACTIVE');
      for (const [id, item] of host.active) if (item.run.projectId === projectId) { item.stop.abort(); host.revokeContext(id); }
      // Collectors stop and launch nothing until the change is applied; on release each job re-reads its admission.
      const releaseCollector = host.holdCollector(projectId); const releaseReview = host.holdReview(projectId);
      try { return await host.request(request); } finally { releaseCollector(); releaseReview(); }
    });
  }

  async function forwardStart(request: RunStart): Promise<unknown> {
    if (host.commandsExecuting()) throw new Error('RUN_ACTIVE');
    const result = await host.request(request);
    const { run } = z.object({ run: RunSchema }).parse(result);
    if (!host.active.has(run.id) && ['queued', 'running'].includes(run.status)) host.admit(run);
    return result;
  }

  async function startRun(request: RunStart): Promise<unknown> {
    if (host.commandsExecuting()) throw new Error('RUN_ACTIVE');
    let projectId: string | null;
    try {
      projectId = SessionProjectSchema.parse(await read('session.read', { sessionId: request.params.sessionId })).session.projectId;
    } catch (error) {
      // A missing session admits no run; the engine answers it (a replayed request included) as before.
      if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') return forwardStart(request);
      throw error;
    }
    return projectId === null ? forwardStart(request) : locks.run(projectId, () => forwardStart(request));
  }

  return { updatePolicy, startRun };
}
