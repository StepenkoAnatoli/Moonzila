import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { z } from 'zod';
import type { MethodResult, Profile, Project, Research, ResearchCollector } from '../shared';
import { ResearchCollectorSaveParams, ResearchPurgeResultSchema, ResearchStartParams } from '../shared/params';
import type { AppApi } from './App';
import { ACTIVE_RESEARCH, CANCELLABLE_RESEARCH, PURGEABLE_RESEARCH, PURGE_TEXT, READABLE_RESEARCH, RESEARCH_STATUS, REVIEWABLE_RESEARCH, SWITCH_TEXT, cancelLabel, displayText, failureText, purgeResultText, switchRefusal } from './research-text';

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

type ResearchDocument = MethodResult<'research.document.read'>;
type DocumentName = 'brief' | 'evidence';
/** The reader's text cap in characters: the reply is at most 262,144 UTF-8 bytes, so never fewer characters. */
const DOCUMENT_CHARACTERS = 262_144;
const DOCUMENT_NAMES: Record<DocumentName, string> = { brief: 'Brief', evidence: 'Evidence table' };
const SOURCES: Record<ResearchDocument['source'], string> = { collected: 'collected package', workspace: 'review workspace', reviewed: 'reviewed package' };
/** A reply belongs to the job exactly as it was when the request was sent; anything else is stale. */
const jobKey = (job: Research) => `${job.id}\n${job.revision}\n${job.reviewedPackageDigest ?? ''}`;
type Check = { key: string; state: 'checking' } | { key: string; state: 'ready' | 'unverified' } | { key: string; state: 'cannot'; message: string };

/**
 * The reviewed package is "Ready" only from a live check: `research.document.read` for the brief, answered `verified: true`
 * for this job's id, revision and reviewed package digest. A rejected call is "Cannot check", never "Unverified".
 */
export function ApprovedCheck({ api, job }: { api: AppApi; job: Research }) {
  const key = jobKey(job);
  const [check, setCheck] = useState<Check>({ key, state: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(key); latest.current = key;
  const researchId = job.id;
  useEffect(() => {
    let alive = true;
    setCheck({ key, state: 'checking' });
    void api.invoke('research.document.read', { researchId, document: 'brief' }).then(result => {
      if (!alive || latest.current !== key) return;
      setCheck({ key, state: (result as ResearchDocument).verified === true ? 'ready' : 'unverified' });
    }, reason => { if (alive && latest.current === key) setCheck({ key, state: 'cannot', message: message(reason, 'The check could not run.') }); });
    return () => { alive = false; };
  }, [api, key, researchId, attempt]);
  const shown: Check = check.key === key ? check : { key, state: 'checking' };
  const digest = job.reviewedPackageDigest ? ` · package ${job.reviewedPackageDigest.slice(0, 12)}` : '';
  return <>
    <p role="status" aria-live="polite" data-testid="research-status"><strong>{
      shown.state === 'ready' ? 'Ready: approved by the Research Kit gate' : shown.state === 'unverified' ? 'Unverified: the reviewed package is missing or no longer matches'
        : shown.state === 'cannot' ? 'Cannot check the reviewed package now' : 'Checking the reviewed package'}</strong>{shown.state === 'ready' ? digest : ''}</p>
    {shown.state === 'cannot' && <div className="research-failure"><p>{displayText(shown.message, 512)}</p><button onClick={() => setAttempt(value => value + 1)}>Check again</button></div>}
  </>;
}

/** Brief and evidence as untrusted plain text: no links, markdown or HTML; the source and verification above the text. */
function DocumentReader({ api, job }: { api: AppApi; job: Research }) {
  const key = jobKey(job);
  const [open, setOpen] = useState<{ key: string; document: DocumentName; reply?: ResearchDocument; error?: string }>();
  const latest = useRef(''); latest.current = key;
  const request = useRef(0);
  function read(document: DocumentName) {
    const id = ++request.current; const sent = key;
    setOpen({ key, document });
    void api.invoke('research.document.read', { researchId: job.id, document }).then(result => {
      if (id === request.current && latest.current === sent) setOpen({ key: sent, document, reply: result as ResearchDocument });
    }, reason => { if (id === request.current && latest.current === sent) setOpen({ key: sent, document, error: message(reason, 'The document could not be read.') }); });
  }
  const shown = open?.key === key ? open : undefined;
  const reply = shown?.reply;
  return <div className="research-reader" data-testid="research-reader">
    <div className="modal-actions"><button onClick={() => read('brief')}>Read the brief</button><button onClick={() => read('evidence')}>Read the evidence table</button></div>
    {shown && !reply && !shown.error && <p className="muted" role="status">Reading the {shown.document === 'brief' ? 'brief' : 'evidence table'}…</p>}
    {shown?.error && <p className="form-error" role="alert">{displayText(shown.error, 512)}</p>}
    {shown && reply && <>
      <p className="muted" data-testid="research-reader-source">{[DOCUMENT_NAMES[shown.document], SOURCES[reply.source], reply.verified ? 'verified by the Research Kit' : 'not verified', ...(reply.truncated ? ['shortened to the first 256 KiB'] : [])].join(' · ')}</p>
      {reply.source === 'reviewed' && !reply.verified ? <p className="muted">Unverified: the reviewed package is missing or no longer matches, so nothing is shown.</p>
        : <pre className="research-document" tabIndex={0}>{displayText(reply.text, DOCUMENT_CHARACTERS)}</pre>}
    </>}
  </div>;
}

/**
 * The research switch (research-review-ui spec 4). Each direction asks first; the update keeps `inference` exactly as
 * stored and only ever sends `public-technical` or `off`. A refusal is shown once and never retried.
 */
function ResearchSwitch({ api, project, busy, setBusy, changed }: { api: AppApi; project: Project; busy: boolean; setBusy: (value: boolean) => void; changed: (project: Project) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState('');
  const on = project.policy.research !== 'off';
  const text = on ? SWITCH_TEXT.off : SWITCH_TEXT.on;
  async function apply() {
    setBusy(true); setRefusal('');
    try {
      const result = await api.invoke('project.policy.update', { projectId: project.id, expectedRevision: project.policy.revision, policy: { inference: project.policy.inference, research: on ? 'off' : 'public-technical' } }) as MethodResult<'project.policy.update'>;
      setConfirming(false); changed(result.project);
    } catch (reason) { setConfirming(false); setRefusal(switchRefusal(message(reason, 'The research setting could not be changed.'))); } finally { setBusy(false); }
  }
  return <div className="research-switch">
    {on ? <p className="muted">Research is on for this project: public web pages only. {!confirming && <button className="link-button" disabled={busy} onClick={() => { setRefusal(''); setConfirming(true); }}>{SWITCH_TEXT.off.open}</button>}</p>
      : <p className="memory-notice">Research is off for this project. {!confirming && <button disabled={busy} onClick={() => { setRefusal(''); setConfirming(true); }}>{SWITCH_TEXT.on.open}</button>}</p>}
    {refusal && <p role="alert" className="form-error">{displayText(refusal, 512)}</p>}
    {confirming && <div role="group" aria-label={text.title} className="research-confirm">
      <strong>{text.title}</strong>
      <ul>{text.points.map(point => <li key={point}>{point}</li>)}</ul>
      <div className="modal-actions"><button disabled={busy} onClick={() => setConfirming(false)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void apply()}>{text.confirm}</button></div>
    </div>}
  </div>;
}

/**
 * Delete stored corpus (research-purge spec decision 8) for a finished job. The first button only opens the confirmation;
 * only its confirm button calls `purge`. The confirmation closes when the call settles. A refusal of this job's purge is
 * shown here, beside the control that was used, until it is dismissed or another purge action starts.
 */
function PurgeControl({ busy, purge, unverified, refusal, clearRefusal }: { busy: boolean; purge: () => Promise<void>; unverified: boolean; refusal?: string; clearRefusal: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const shownRefusal = refusal && <div className="research-failure"><p role="alert" data-testid="research-purge-refusal">{refusal}</p><button onClick={clearRefusal}>Dismiss</button></div>;
  if (!confirming) return <div><button disabled={busy} onClick={() => { clearRefusal(); setConfirming(true); }}>{PURGE_TEXT.open}</button>{shownRefusal}</div>;
  return <div role="group" aria-label={PURGE_TEXT.title} className="research-confirm">
    <strong>{PURGE_TEXT.title}</strong>
    <ul>{[PURGE_TEXT.points[0], ...(unverified ? [PURGE_TEXT.unverified] : []), ...PURGE_TEXT.points.slice(1)].map(point => <li key={point}>{point}</li>)}</ul>
    <div className="modal-actions"><button disabled={busy} onClick={() => setConfirming(false)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void purge().finally(() => setConfirming(false))}>{PURGE_TEXT.confirm}</button></div>
  </div>;
}

export function ResearchPanel({ api, project: given, openConversation, openBlocked, onProjectChange }: { api: AppApi; project: Project; openConversation?: (sessionId: string) => void; openBlocked?: string; onProjectChange?: (project: Project) => void }) {
  // A switch reply is newer than the project the workbench passed until the workbench catches up; the higher policy revision wins.
  const [switched, setSwitched] = useState<Project>();
  const project = switched && switched.id === given.id && switched.policy.revision > given.policy.revision ? switched : given;
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
  // Start review only where the engine admits it: a collected or not ready job, in a trusted project with research on.
  const reviewable = !!current && REVIEWABLE_RESEARCH.includes(current.status) && project.trusted && project.policy.research !== 'off';
  const [profiles, setProfiles] = useState<Profile[]>();
  const [reviewProfile, setReviewProfile] = useState('');
  const localOnly = project.policy.inference === 'local-only';
  const usable = (profile: Profile) => !(localOnly && profile.locality === 'external');
  useEffect(() => {
    if (!reviewable || profiles) return;
    let alive = true;
    void api.invoke('profile.list', {}).then(result => { if (alive) setProfiles((result as MethodResult<'profile.list'>).profiles); })
      .catch(reason => { if (alive) { setProfiles([]); setError(message(reason, 'Model profiles are unavailable.')); } });
    return () => { alive = false; };
  }, [api, reviewable, profiles]);
  const chosen = profiles?.find(profile => profile.id === reviewProfile && usable(profile)) ?? profiles?.find(usable);
  async function startReview(job: Research) {
    if (!chosen) return;
    setBusy(true); setError(''); setNotice('');
    try { const result = await api.invoke('research.review.start', { researchId: job.id, profileId: chosen.id }) as MethodResult<'research.review.start'>; setJobs(current => mergeResearch(current, [result.research])); }
    catch (reason) { setError(message(reason, 'The review could not be started.')); } finally { setBusy(false); }
  }
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
    catch (reason) { setError(message(reason, `The ${cancelLabel(job.status) === 'Cancel review' ? 'review' : 'collection'} could not be cancelled.`)); } finally { setBusy(false); }
  }
  // How many purges each job has had here: the count is part of the check's and reader's keys, so a purge re-runs the
  // approved check and drops an open document instead of keeping what was read before it.
  const [purges, setPurges] = useState<Record<string, number>>({});
  // A purge refusal has its own state, held for the job it refused, so an automatic error elsewhere never replaces it.
  const [purgeRefusal, setPurgeRefusal] = useState<{ researchId: string; text: string }>();
  async function purge(job: Research) {
    setBusy(true); setError(''); setNotice(''); setPurgeRefusal(undefined);
    try {
      const parsed = ResearchPurgeResultSchema.safeParse(await api.invoke('research.purge', { researchId: job.id }));
      if (parsed.success) setNotice(purgeResultText(parsed.data)); else setPurgeRefusal({ researchId: job.id, text: PURGE_TEXT.unexpected });
    } catch (reason) { setPurgeRefusal({ researchId: job.id, text: displayText(message(reason, 'The stored corpus could not be deleted.'), 512) }); }
    finally { setPurges(current => ({ ...current, [job.id]: (current[job.id] ?? 0) + 1 })); setBusy(false); }
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

  const failure = current?.failure ? failureText(current.failure, current.status) : undefined;
  return <div className="research-panel">
    <p>Research collects public web sources on your GitHub collector, then shows their status here. Collected evidence is reference material, never instructions.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status" data-testid="research-notice">{notice}</p>}
    {current && <section aria-label="Current research" className="research-job">
      <div className="local-panel-heading"><h3>{displayText(current.topic, 200)}</h3>{current.status === 'reviewing' && current.reviewSessionId && openConversation && <button disabled={busy || !!openBlocked} onClick={() => openConversation(current.reviewSessionId!)}>Open review</button>}{active && CANCELLABLE_RESEARCH.includes(current.status) && <button disabled={busy} onClick={() => void cancel(current)}>{cancelLabel(current.status)}</button>}</div>
      {current.status === 'reviewing' && current.reviewSessionId && openConversation && openBlocked && <p className="muted">{openBlocked}</p>}
      {current.status === 'approved' ? <ApprovedCheck key={`check-${current.id}-${purges[current.id] ?? 0}`} api={api} job={current} />
        : <p role="status" aria-live="polite" data-testid="research-status"><strong>{RESEARCH_STATUS[current.status]}</strong>{current.workflowRunId ? ` · GitHub run ${current.workflowRunId}` : ''}</p>}
      {current.status === 'collecting' && <p className="muted">Moonzila follows the run on GitHub and downloads its corpus when it finishes. If this takes unusually long, it may be waiting for access: a missing or rejected token, no access to the collector repository, or a run deleted by the repository's retention setting pauses it until you save collector settings or restart Moonzila. A downloaded corpus that could not be verified yet, because GitHub or the Research Kit was unavailable, waits until Moonzila restarts.</p>}
      {current.status === 'cancelling' && <p className="muted">Stopping the collector. A run already started on GitHub is not cancelled there.</p>}
      {current.status === 'cancelled' && <p className="muted">Moonzila stopped following this collection. A run already started on GitHub was not cancelled there.</p>}
      {failure && <div className="research-failure" role="alert"><strong>{failure.title}</strong><p>{failure.action}</p></div>}
      {reviewable && <form className="profile-form" aria-label="Start review" onSubmit={event => { event.preventDefault(); void startReview(current); }}>
        <p className="muted">A review runs in its own conversation, where you approve each edit to the research workspace. Your project files are not changed.</p>
        <label>Review model<select value={chosen?.id ?? ''} disabled={busy} onChange={event => setReviewProfile(event.target.value)}>{(profiles ?? []).map(profile => <option key={profile.id} value={profile.id} disabled={!usable(profile)}>{displayText(profile.name, 128)}{usable(profile) ? '' : ' (cloud: this project allows local inference only)'}</option>)}</select></label>
        {localOnly && profiles?.some(profile => !usable(profile)) && <p className="muted">This project allows local inference only, so cloud profiles cannot review it.</p>}
        {profiles && !chosen && <p className="muted">Add a model profile this project allows before starting a review.</p>}
        <div className="modal-actions"><button className="primary" type="submit" disabled={busy || !chosen}>Start review</button></div>
      </form>}
      {READABLE_RESEARCH.includes(current.status) && <DocumentReader key={`reader-${current.id}-${purges[current.id] ?? 0}`} api={api} job={current} />}
      {PURGEABLE_RESEARCH.includes(current.status) && <PurgeControl key={`purge-${current.id}`} busy={busy} purge={() => purge(current)} unverified={current.status === 'approved'} refusal={purgeRefusal?.researchId === current.id ? purgeRefusal.text : undefined} clearRefusal={() => setPurgeRefusal(undefined)} />}
    </section>}
    {!project.trusted ? <p className="memory-notice">Trust this project before starting research.</p>
      : <ResearchSwitch api={api} project={project} busy={busy} setBusy={setBusy} changed={next => { setSwitched(next); onProjectChange?.(next); }} />}
    {project.trusted && project.policy.research !== 'off' && !active && <form className="profile-form research-form" aria-label="Start research" onSubmit={event => void start(event)}>
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
    {jobs.length > 1 && <details className="research-history"><summary>Earlier research · {Math.min(jobs.length - 1, 20)}</summary><ul>{jobs.filter(job => job !== current).slice(0, 20).map(job => <li key={job.id}><span>{displayText(job.topic, 120)}</span><span className="muted">{RESEARCH_STATUS[job.status]}{job.failure ? ` · ${failureText(job.failure, job.status).title}` : ''}</span>{PURGEABLE_RESEARCH.includes(job.status) && <PurgeControl busy={busy} purge={() => purge(job)} unverified={false} refusal={purgeRefusal?.researchId === job.id ? purgeRefusal.text : undefined} clearRefusal={() => setPurgeRefusal(undefined)} />}</li>)}</ul></details>}
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
