import { useEffect, useState } from 'react';
import type { MethodResult, RecoveryItem } from '../shared';
import type { AppApi } from './App';

const observations = { uninspected: 'Not inspected', applied: 'Matches proposed contents', 'not-applied': 'Matches original contents', conflict: 'Current contents differ from both versions' };
const size = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MiB`;

export function RecoveryPanel({ api, projectId, runId, changed }: { api: AppApi; projectId: string; runId?: string; changed: () => void }) {
  const [page, setPage] = useState<MethodResult<'recovery.list'>>();
  const [storage, setStorage] = useState<MethodResult<'storage.read'>>();
  const [refresh, setRefresh] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState<string[]>([]); const [offset, setOffset] = useState(0);
  useEffect(() => api.onEvent(event => { if (['approval.required', 'approval.decided', 'run.interrupted', 'operation.unknown', 'run.completed', 'run.failed', 'run.cancelled', 'change.recorded'].includes(event.type)) setRefresh(value => value + 1); }), [api]);
  useEffect(() => {
    let alive = true;
    void Promise.all([api.invoke('recovery.list', { projectId, after: offset, limit: 20 }), api.invoke('storage.read', {})]).then(([list, stats]) => {
      if (alive) { setPage(list as MethodResult<'recovery.list'>); setStorage(stats as MethodResult<'storage.read'>); }
    }).catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'Recovery information is unavailable.'); });
    return () => { alive = false; };
  }, [api, projectId, runId, refresh, offset]);
  async function act(item: RecoveryItem, method: 'recovery.inspect' | 'recovery.acknowledge') {
    const op = item.operation; setBusy(true); setError('');
    try {
      await api.invoke(method, { projectId, operationId: op.id, inputHash: op.inputHash, trustRevision: op.trustRevision, policyRevision: op.policyRevision });
      setReviewed([]); setRefresh(value => value + 1); changed();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The review could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section className="recovery-panel" aria-label="Recovery and storage">
    {error && <p role="alert" className="form-error">{error}</p>}
    {page && (!!page.items.length || offset > 0) && <details className="recovery-list" open={page.pendingCount > 0 || undefined}>
      <summary>Recovery · {page.pendingCount ? `${page.pendingCount} needs review` : 'reviewed operations'}</summary>
      <p>Interrupted actions are never replayed. Review uncertain outcomes before starting another Build task. File inspection only compares the current contents.</p>
      {page.items.map(item => {
        const pending = item.operation.status === 'unknown' && !item.acknowledgedAt;
        return <article className="recovery-item" key={item.operation.id}>
          <h3>{item.operation.kind === 'write' ? 'Interrupted file edit' : 'Command outcome unknown'}</h3>
          <pre tabIndex={0}>{item.summary}</pre><p className="muted">{item.operation.createdAt ? new Date(item.operation.createdAt).toLocaleString() : 'Time unavailable'}</p>
          <p>{item.operation.kind === 'write' ? observations[item.observation] : 'Moonzila could not confirm how this command ended. Check its effects in your project.'}</p>
          {item.inspectedAt && <p className="muted">Last inspected: {new Date(item.inspectedAt).toLocaleString()}. The file may have changed since then.</p>}
          {pending ? <>
            {item.operation.kind === 'write' && <button disabled={busy || !!runId} onClick={() => void act(item, 'recovery.inspect')}>Inspect current file</button>}
            <label className="recovery-confirm"><input type="checkbox" checked={reviewed.includes(item.operation.id)} disabled={busy || !!runId} onChange={event => setReviewed(current => event.target.checked ? [...current, item.operation.id] : current.filter(id => id !== item.operation.id))} />I reviewed this outcome and accept the current project state.</label>
            <button disabled={busy || !!runId || !reviewed.includes(item.operation.id)} onClick={() => void act(item, 'recovery.acknowledge')}>Acknowledge outcome</button>
            <p className="muted">Acknowledging does not mark the action successful or run it again. Its snapshots become eligible for cleanup.</p>
          </> : <p className="status-tag">{item.acknowledgedAt ? 'Acknowledged · outcome remains uncertain' : 'Recovered · proposed contents found'}</p>}
        </article>;
      })}
      {(offset > 0 || page.hasMore) && <div className="review-actions"><button disabled={busy || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>Previous recovery page</button><button disabled={busy || !page.hasMore} onClick={() => setOffset(value => value + 20)}>Next recovery page</button></div>}
    </details>}
    {storage && <details className="snapshot-storage"><summary>Undo snapshots · {size(storage.usedBytes)} / {size(storage.limitBytes)}</summary><p>{storage.snapshotCount} snapshots across all projects. {size(storage.protectedBytes)} protected by active or unresolved work.</p><p>Older completed edits are cleaned up as space is needed and may lose Undo. Project files are never deleted by this cleanup. Conversations and model files use separate storage.</p></details>}
  </section>;
}
