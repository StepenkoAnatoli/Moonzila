import { z } from 'zod';
import { RunSchema, type Request, type Run } from '../shared';
import { PolicyGuardResultSchema, SessionProjectResultSchema, type Control } from '../engine/control';

/** A run main holds a capability for (index.ts keeps a GitHub reader beside these). */
export interface ActiveRun { run: Run; stop: AbortController }
type PolicyUpdate = Extract<Request, { method: 'project.policy.update' }>;
type RunStart = Extract<Request, { method: 'run.start' }>;
export interface PolicyRouteHost {
  /** Forwards a request to the engine. */
  request(request: Request): Promise<unknown>;
  /** Sends an internal control to the engine; the route uses only `policy.guard` and `session.project`. */
  control(control: Control): Promise<unknown>;
  active: Map<string, ActiveRun>;
  revokeContext(runId: string): void;
  holdCollector(projectId: string): () => void;
  holdReview(projectId: string): () => void;
  /** True while a command or kit tool executes in main (run.start refuses `RUN_ACTIVE` then, as before). */
  commandsExecuting(): boolean;
  /** Installs main's capability for a run the engine admitted. */
  admit(run: Run): void;
}

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
  async function updatePolicy(request: PolicyUpdate): Promise<unknown> {
    const { projectId } = request.params;
    return locks.run(projectId, async () => {
      // One read: the stored inference and whether a non-research run is unfinished. A null guard (no such project) is
      // the engine's PROJECT_NOT_FOUND, answered as before.
      const guard = PolicyGuardResultSchema.parse(await host.control({ method: 'policy.guard', projectId }));
      if (guard && request.params.policy.inference === guard.inference && guard.nonResearchRunActive) throw new Error('RUN_ACTIVE');
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
    const session = SessionProjectResultSchema.parse(await host.control({ method: 'session.project', sessionId: request.params.sessionId }));
    // A missing session (null) admits no run; the engine answers it (a replayed request included) as before, unlocked.
    if (session === null || session.projectId === null) return forwardStart(request);
    return locks.run(session.projectId, () => forwardStart(request));
  }

  return { updatePolicy, startRun };
}
