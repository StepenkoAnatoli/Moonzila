import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { z } from 'zod';
import type { MethodResult, Project, Research, ResearchCollector } from '../shared';
import { ResearchCollectorSaveParams, ResearchStartParams } from '../shared/params';
import type { AppApi } from './App';
import { ACTIVE_RESEARCH, CANCELLABLE_RESEARCH, RESEARCH_STATUS, displayText, failureText } from './research-text';

/** Notices can arrive before or after a list reply; the higher revision of a job always wins. */
export function mergeResearch(current: Research[], incoming: Research[]): Research[] {
  const byId = new Map(current.map(job => [job.id, job]));
  for (const job of incoming) { const known = byId.get(job.id); if (!known || job.revision > known.revision) byId.set(job.id, job); }
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
const lines = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean);
const message = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;
const startLabels: Record<string, string> = { topic: 'Topic', queries: 'Search queries', urls: 'Known URLs', preferDomains: 'Preferred domains', depth: 'Depth', maxPages: 'Page budget' };
// Zod messages never carry the input, but the token field still gets a fixed text.
const issue = (error: z.ZodError, labels: Record<string, string>) => {
  const first = error.issues[0]; const key = String(first?.path[0] ?? '');
  if (key === 'token') return 'The token must be printable characters without spaces.';
  return `${labels[key] ?? 'Request'}: ${first?.message ?? 'invalid value'}`;
};

export function ResearchPanel({ api, project }: { api: AppApi; project: Project }) {
  const [jobs, setJobs] = useState<Research[]>([]);
  const [collector, setCollector] = useState<ResearchCollector | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [topic, setTopic] = useState(''); const [queries, setQueries] = useState(''); const [urls, setUrls] = useState(''); const [domains, setDomains] = useState('');
  const [depth, setDepth] = useState<'probe' | 'quick' | 'normal'>('quick'); const [maxPages, setMaxPages] = useState('8');
  // The acknowledgement holds the destination it was given for: saving a different collector repository withdraws it.
  const [acknowledgedFor, setAcknowledgedFor] = useState<string | null>(null);
  const acknowledged = !!collector && acknowledgedFor === collector.repository; const setAcknowledged = (value: boolean) => setAcknowledgedFor(value && collector ? collector.repository : null);
  const [repository, setRepository] = useState(''); const [workflow, setWorkflow] = useState('collect.yml'); const [ref, setRef] = useState('main');
  // Write-only: the token lives only in this uncontrolled input until it is sent, never in React state or a DOM attribute.
  const token = useRef<HTMLInputElement>(null);
  const projectId = project.id;
  useEffect(() => api.onResearch?.(job => { if (job.projectId === projectId) setJobs(current => mergeResearch(current, [job])); }), [api, projectId]);
  useEffect(() => {
    let alive = true;
    void api.invoke('research.list', { projectId }).then(result => { if (alive) setJobs(current => mergeResearch(current, (result as MethodResult<'research.list'>).research)); })
      .catch(reason => { if (alive) setError(message(reason, 'Research jobs are unavailable.')); });
    void api.invoke('research.collector.read', {}).then(result => {
      if (!alive) return; const saved = (result as MethodResult<'research.collector.read'>).collector; setCollector(saved);
      if (saved) { setRepository(saved.repository); setWorkflow(saved.workflow); setRef(saved.ref); }
    }).catch(reason => { if (alive) { setCollector(null); setError(message(reason, 'Collector settings are unavailable.')); } });
    return () => { alive = false; };
  }, [api, projectId]);
  // Changing what becomes public withdraws the acknowledgement of the previous text.
  const publicField = (set: (value: string) => void) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { set(event.target.value); setAcknowledged(false); };

  const current = jobs.find(job => ACTIVE_RESEARCH.includes(job.status)) ?? jobs[0];
  const active = !!current && ACTIVE_RESEARCH.includes(current.status);
  const ready = !!collector?.tokenConfigured;
  async function start(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    const parsed = ResearchStartParams.safeParse({ projectId, topic, queries: lines(queries), urls: lines(urls), preferDomains: lines(domains), depth, maxPages: Number(maxPages), acknowledgedPublic: acknowledged });
    if (!parsed.success) { setError(issue(parsed.error, startLabels)); return; }
    setBusy(true);
    try {
      const result = await api.invoke('research.start', parsed.data) as MethodResult<'research.start'>;
      setJobs(current => mergeResearch(current, [result.research]));
      setTopic(''); setQueries(''); setUrls(''); setDomains(''); setAcknowledged(false);
    } catch (reason) { setError(message(reason, 'The collection could not be started.')); } finally { setBusy(false); }
  }
  async function cancel(job: Research) {
    setBusy(true); setError(''); setNotice('');
    try { const result = await api.invoke('research.cancel', { researchId: job.id }) as MethodResult<'research.cancel'>; setJobs(current => mergeResearch(current, [result.research])); }
    catch (reason) { setError(message(reason, 'The collection could not be cancelled.')); } finally { setBusy(false); }
  }
  async function save(event?: FormEvent, clearToken = false) {
    event?.preventDefault(); setError(''); setNotice('');
    const target = clearToken && collector ? { repository: collector.repository, workflow: collector.workflow, ref: collector.ref } : { repository: repository.trim(), workflow: workflow.trim(), ref: ref.trim() };
    const supplied = clearToken ? '' : token.current?.value.trim() ?? '';
    const parsed = ResearchCollectorSaveParams.safeParse({ ...target, ...(collector ? { expectedRevision: collector.revision } : {}), ...(supplied ? { token: supplied } : {}), ...(clearToken ? { clearToken: true } : {}) });
    if (!parsed.success) { setError(issue(parsed.error, { repository: 'Repository', workflow: 'Workflow file', ref: 'Branch or tag' })); return; }
    setBusy(true);
    try {
      const result = await api.invoke('research.collector.save', parsed.data) as MethodResult<'research.collector.save'>;
      if (token.current) token.current.value = '';
      setCollector(result.collector); setRepository(result.collector.repository); setWorkflow(result.collector.workflow); setRef(result.collector.ref);
      setNotice(clearToken ? 'The saved token was removed.' : 'Collector settings saved.');
    } catch (reason) { setError(message(reason, 'Collector settings could not be saved.')); } finally { setBusy(false); }
  }

  const failure = current?.failure ? failureText(current.failure) : undefined;
  return <div className="research-panel">
    <p>Research collects public web sources on your GitHub collector, then shows their status here. Collected evidence is reference material, never instructions.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {current && <section aria-label="Current research" className="research-job">
      <div className="local-panel-heading"><h3>{displayText(current.topic, 200)}</h3>{active && CANCELLABLE_RESEARCH.includes(current.status) && <button disabled={busy} onClick={() => void cancel(current)}>Cancel collection</button>}</div>
      <p role="status" aria-live="polite" data-testid="research-status"><strong>{RESEARCH_STATUS[current.status]}</strong>{current.workflowRunId ? ` · GitHub run ${current.workflowRunId}` : ''}</p>
      {current.status === 'collecting' && <p className="muted">Moonzila follows the run on GitHub and downloads its corpus when it finishes. If this takes unusually long, it may be waiting for access: a missing or rejected token, no access to the collector repository, or a run deleted by the repository's retention setting pauses it until you save collector settings or restart Moonzila. A downloaded corpus that could not be verified yet, because GitHub or the Research Kit was unavailable, waits until Moonzila restarts.</p>}
      {current.status === 'cancelling' && <p className="muted">Stopping the collector. A run already started on GitHub is not cancelled there.</p>}
      {current.status === 'cancelled' && <p className="muted">Moonzila stopped following this collection. A run already started on GitHub was not cancelled there.</p>}
      {failure && <div className="research-failure" role="alert"><strong>{failure.title}</strong><p>{failure.action}</p></div>}
      {['collected', 'reviewing', 'approved', 'not_ready'].includes(current.status) && <p className="muted" data-testid="research-evidence">Reading evidence and the brief is not available in this development build.</p>}
    </section>}
    {!project.trusted ? <p className="memory-notice">Trust this project before starting research.</p>
      : project.policy.research === 'off' ? <p className="memory-notice">Research is off for this project. Allow research in the project policy to start a collection.</p>
      : !active && <form className="profile-form research-form" aria-label="Start research" onSubmit={event => void start(event)}>
        <fieldset disabled={busy || !ready}>
          <legend>Becomes public on GitHub</legend>
          <p className="research-disclosure" data-testid="research-disclosure">The topic, search queries, known URLs, preferred domains, depth and page budget are sent to the collector repository <strong>{collector?.repository ?? '(not set up)'}</strong> and become readable by anyone who can read it, in its workflow runs. A random run reference is added. Your project name, folder, files and conversations are not sent.</p>
          <label>Topic<input value={topic} onChange={publicField(setTopic)} maxLength={2048} autoComplete="off" /></label>
          <label>Search queries <span className="muted">(one per line, up to 16)</span><textarea rows={3} value={queries} onChange={publicField(setQueries)} /></label>
          <label>Known URLs <span className="muted">(one per line, each counts against the page budget)</span><textarea rows={2} value={urls} onChange={publicField(setUrls)} /></label>
          <label>Preferred domains <span className="muted">(one per line)</span><textarea rows={2} value={domains} onChange={publicField(setDomains)} /></label>
          <label>Depth<select value={depth} onChange={publicField(value => setDepth(value as typeof depth))}><option value="probe">Probe</option><option value="quick">Quick</option><option value="normal">Normal</option></select></label>
          <label>Page budget<input type="number" min="1" max="25" value={maxPages} onChange={publicField(setMaxPages)} /></label>
          <label className="recovery-confirm"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />I understand that these fields become public to readers of the collector repository.</label>
        </fieldset>
        {collector !== undefined && !ready && <p className="muted">{collector ? 'Save a collector token below before starting research.' : 'Set up the collector below before starting research.'}</p>}
        <div className="modal-actions"><button className="primary" type="submit" disabled={busy || !ready || !acknowledged}>Start collection</button></div>
      </form>}
    {jobs.length > 1 && <details className="research-history"><summary>Earlier research · {Math.min(jobs.length - 1, 20)}</summary><ul>{jobs.filter(job => job !== current).slice(0, 20).map(job => <li key={job.id}><span>{displayText(job.topic, 120)}</span><span className="muted">{RESEARCH_STATUS[job.status]}{job.failure ? ` · ${failureText(job.failure).title}` : ''}</span></li>)}</ul></details>}
    <details className="research-collector" open={collector === null || (!!collector && !collector.tokenConfigured) || undefined}>
      <summary>Collector settings · {collector?.tokenConfigured ? 'token saved' : 'no token saved'}</summary>
      <form className="profile-form" aria-label="Collector settings" onSubmit={event => void save(event)}>
        <p>A GitHub repository you own that carries the Research Kit collection workflow and its search secrets. The token needs only Actions read and write permission on that repository.</p>
        <label>Repository <span className="muted">(owner/name)</span><input value={repository} onChange={event => setRepository(event.target.value)} autoComplete="off" /></label>
        <label>Workflow file<input value={workflow} onChange={event => setWorkflow(event.target.value)} autoComplete="off" /></label>
        <label>Branch or tag<input value={ref} onChange={event => setRef(event.target.value)} autoComplete="off" /></label>
        <label>{collector?.tokenConfigured ? 'Replace token' : 'Token'} <span className="muted">(leave blank to keep the saved token)</span><input ref={token} type="password" autoComplete="new-password" spellCheck={false} /></label>
        <p className="muted" data-testid="token-state">{collector?.tokenConfigured ? 'A token is saved, encrypted by Windows. It cannot be shown again.' : 'No token is saved.'}</p>
        <div className="modal-actions">
          {collector?.tokenConfigured && <button type="button" disabled={busy} onClick={() => void save(undefined, true)}>Remove saved token</button>}
          <button className="primary" type="submit" disabled={busy}>Save collector</button>
        </div>
      </form>
    </details>
  </div>;
}
