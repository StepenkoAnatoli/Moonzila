import { useCallback, useEffect, useRef, useState } from 'react';
import type { Approval, Change, MethodResult, Operation, Run } from '../shared';
import type { AppApi } from './App';
import { RecoveryPanel } from './RecoveryPanel';

type Preview = MethodResult<'approval.read'>;
// A card carries the mode of the run it was loaded for, so a stale card never relabels when the current run changes before the reload lands.
type Card = Preview & { runMode?: Run['mode'] };
// runMode is the mode of the run named by runId: a review edit in a research run targets the private research workspace, never the project.
export function ChangesPanel({ api, projectId, runId, runMode }: { api: AppApi; projectId: string; runId?: string; runMode?: Run['mode'] }) {
  const [pending, setPending] = useState<Card>(); const [changes, setChanges] = useState<Change[]>([]);
  const [selected, setSelected] = useState<MethodResult<'changes.read'>>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0);
  const review = useRef<HTMLElement>(null);
  useEffect(() => { if (pending) review.current?.scrollIntoView?.({ block: 'nearest' }); }, [pending?.operation.id]);
  const update = useCallback(() => setRefresh(value => value + 1), []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = api.onEvent(event => {
      if (!['approval.required', 'approval.decided', 'change.recorded', 'run.cancelled', 'run.failed', 'run.completed', 'run.interrupted', 'operation.unknown'].includes(event.type)) return;
      clearTimeout(timer); timer = setTimeout(update, 25);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [api, update]);
  useEffect(() => {
    let alive = true;
    async function load() {
      const result = await api.invoke('changes.list', { projectId }) as MethodResult<'changes.list'>;
      const waiting = runId ? await api.invoke('approval.list', { runId }) as { operations: Operation[] } : { operations: [] };
      const first = waiting.operations[0];
      const preview = first ? await api.invoke('approval.read', { projectId, operationId: first.id }) as Preview : undefined;
      if (alive) { setChanges(result.changes); setPending(preview && { ...preview, runMode }); }
    }
    void load().catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'Changes could not be loaded.'); });
    return () => { alive = false; };
  }, [api, projectId, runId, runMode, refresh]);
  async function decide(decision: Approval['decision']) {
    if (!pending) return; setBusy(true); setError('');
    const op = pending.operation;
    try {
      await api.invoke('approval.decide', { operationId: op.id, projectId: op.projectId, inputHash: op.inputHash, policyRevision: op.policyRevision, trustRevision: op.trustRevision, decision });
      setPending(undefined); update();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The decision could not be saved.'); }
    finally { setBusy(false); }
  }
  async function undo(change: Change) {
    setBusy(true); setError('');
    try { await api.invoke('changes.undo', { projectId, changeId: change.id, expectedAfterHash: change.afterHash }); setSelected(undefined); update(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The change could not be undone.'); }
    finally { setBusy(false); }
  }
  async function inspect(change: Change) {
    setError('');
    try { setSelected(await api.invoke('changes.read', { projectId, changeId: change.id }) as MethodResult<'changes.read'>); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The change could not be read.'); }
  }
  return <section className="changes-panel" aria-label="File changes">
    <RecoveryPanel api={api} projectId={projectId} runId={runId} changed={update} />
    {error && <p role="alert" className="form-error">{error}</p>}
    {pending?.kind === 'write' && <section ref={review} className="edit-review" aria-label="Edit review">
      <h2>{pending.runMode === 'research' ? 'Research workspace' : 'Review edit'} · {pending.path}</h2><p>The file will change only after you approve this exact edit.</p>
      <div className="change-columns"><div><h3>Current content</h3><pre tabIndex={0} aria-label="Current content">{pending.before ?? '(new file)'}</pre></div><div><h3>Proposed content</h3><pre tabIndex={0} aria-label="Proposed content">{pending.after ?? '(delete file)'}</pre></div></div>
      <div className="review-actions"><button disabled={busy} onClick={() => void decide('deny')}>Decline edit</button><button disabled={busy} className="primary" onClick={() => void decide('allow')}>Approve edit</button></div>
    </section>}
    {pending?.kind === 'command' && <section ref={review} className="edit-review command-review" aria-label="Command review">
      <h2>Review command</h2>
      <div className="command-details" tabIndex={0} aria-label="Command details">
      <p>This command runs with your Windows account’s access. It can change files and use the network. Command changes are not covered by file Undo.</p>
      <h3>Executable</h3><pre tabIndex={0}>{pending.executable}</pre>
      <h3>Arguments (in order)</h3><pre tabIndex={0} aria-label="Command arguments">{JSON.stringify(pending.args, null, 2)}</pre>
      <p>Working folder: <code>{pending.cwd}</code></p><p>Timeout: {pending.timeoutMs / 1000} seconds. Output is limited to 60 KB. App credentials are not supplied.</p>
      </div>
      <div className="review-actions"><button disabled={busy} onClick={() => void decide('deny')}>Decline command</button><button disabled={busy} className="primary" onClick={() => void decide('allow')}>Approve command</button></div>
    </section>}
    {!!changes.length && <details className="change-history"><summary>Project changes</summary>
      {changes.map(change => <div className="change-row" key={change.id}><span className="change-path">{change.path}</span><span>{change.status === 'undone' ? 'Undone' : change.status === 'applied' ? 'Applied' : change.status === 'conflict' ? 'Conflict' : 'Needs review'}</span><button onClick={() => void inspect(change)} aria-label={`View ${change.path}`}>View</button><button disabled={busy || !!runId || change.status !== 'applied' || !change.snapshotAvailable} onClick={() => void undo(change)} aria-label={`Undo ${change.path}`}>Undo</button></div>)}
      {selected && <div className="change-inspection"><h3>{selected.change.path}</h3>{selected.truncated ? <p>Original snapshots are unavailable.</p> : <div className="change-columns"><div><h3>Before</h3><pre tabIndex={0}>{selected.before ?? '(new file)'}</pre></div><div><h3>After</h3><pre tabIndex={0}>{selected.after ?? '(deleted file)'}</pre></div></div>}<button onClick={() => setSelected(undefined)}>Close change</button></div>}
    </details>}
  </section>;
}
