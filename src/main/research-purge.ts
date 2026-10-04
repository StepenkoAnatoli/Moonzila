import type { Control } from '../engine/control';
import { ResearchRetainedResultSchema } from '../engine/control';
import { ACTIVE_RESEARCH } from '../engine/research-state';
import type { ResearchKit } from '../adapters/research-kit/adapter';
import type { ResearchPurgeResultSchema } from '../shared/params';
import type { z } from 'zod';

/**
 * `research.purge` (docs/specification/research-purge.md): deletes a finished job's retained package bytes. The job, its
 * journal and every recorded hash stay; the engine's state does not change. The renderer names a job, never a path.
 */
export type ResearchPurgeResult = z.infer<typeof ResearchPurgeResultSchema>;
export interface PurgeDeps {
  control(control: Control): Promise<unknown>;
  /** The kit, or null when research is not installed: RESEARCH_KIT_UNAVAILABLE. */
  kit: Pick<ResearchKit, 'purgeRetained'> | null;
}
/** Decision 2: only finished research; `collected` and `not_ready` can still be reviewed. */
export const PURGE_ALLOWED: ReadonlySet<string> = new Set(['approved', 'failed', 'cancelled']);
const ACTIVE: ReadonlySet<string> = new Set(ACTIVE_RESEARCH);

/**
 * One locked step in the adapter: main's read of every job's references (`research.retained`) happens inside the storage
 * lock, so an import, a packaging step, a review start or the reader touching the same store runs wholly before or after.
 * - The job must be approved, failed or cancelled, else PURGE_NOT_ALLOWED, before anything is deleted.
 * - Its collected and reviewed digests are deleted unless another job, in any status, references them (`keptShared`
 *   counts those kept whose file is in the store).
 * - Store entries no job references are deleted only when no job anywhere is active; otherwise kept (`keptBusy`).
 * The engine's own refusals (NOT_FOUND, ENGINE_UNAVAILABLE, ...) pass through; any failure of the store or a delete
 * is RESEARCH_KIT_UNAVAILABLE, except a ZIP another program still holds open after the delete's one retry:
 * PURGE_INCOMPLETE (P5-5), and the ZIPs deleted before it stay deleted with their receipts forgotten.
 */
export async function purgeResearch(deps: PurgeDeps, researchId: string): Promise<ResearchPurgeResult> {
  if (!deps.kit) throw new Error('RESEARCH_KIT_UNAVAILABLE');
  let decided: Error | undefined;
  let keptShared = 0; let keptBusy = false;
  // Inside the lock: the read and the refusals first, before the store is even listed (review F2).
  const plan = async (): Promise<(stored: readonly string[]) => string[]> => {
    try {
      const { jobs } = ResearchRetainedResultSchema.parse(await deps.control({ method: 'research.retained' }));
      const job = jobs.find(item => item.id === researchId);
      if (!job) throw new Error('NOT_FOUND');
      if (!PURGE_ALLOWED.has(job.status)) throw new Error('PURGE_NOT_ALLOWED');
      const others = new Set<string>(); const referenced = new Set<string>();
      for (const item of jobs) for (const sha of [item.collected, item.reviewed]) {
        if (sha === null) continue;
        referenced.add(sha); if (item.id !== job.id) others.add(sha);
      }
      const own = [...new Set([job.collected, job.reviewed].filter((sha): sha is string => sha !== null))];
      const busy = jobs.some(item => ACTIVE.has(item.status));
      return stored => {
        const targets = own.filter(sha => !others.has(sha));
        // Only the job's own shared digests whose file is in the store (P5-6): a second purge reports 0 once it is gone.
        keptShared = own.filter(sha => others.has(sha) && stored.includes(sha)).length;
        const orphans = stored.filter(sha => !referenced.has(sha));
        if (busy) keptBusy = orphans.length > 0;
        else targets.push(...orphans);
        return targets;
      };
    } catch (error) { decided = error instanceof Error ? error : new Error('INTERNAL_ERROR'); throw decided; }
  };
  let removed: number;
  try { ({ removed } = await deps.kit.purgeRetained(plan)); }
  catch (error) {
    if (decided && error === decided) throw error;
    if (error instanceof Error && error.message === 'PURGE_INCOMPLETE') throw new Error('PURGE_INCOMPLETE', { cause: error });
    throw new Error('RESEARCH_KIT_UNAVAILABLE', { cause: error });
  }
  return { removed, keptShared, keptBusy };
}
