import { useCallback, useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Project, Profile, Session, Message, Run, RunEvent, MethodName, MethodParams, MethodResult, Research } from '../shared';
import { ChangesPanel } from './ChangesPanel';
import { CommandResultSchema } from '../shared/commands';
import { LocalModelPanel } from './LocalModelPanel';
import { ResearchPanel } from './ResearchPanel';

export interface AppApi {
  invoke(method: string, params?: Record<string, unknown>): Promise<unknown>;
  onEvent(listener: (event: RunEvent) => void): () => void;
  onResearch?(listener: (research: Research) => void): () => void;
}
declare global { interface Window { moonaliza: AppApi } }

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,button,select')?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="modal-backdrop"><div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,[tabindex="0"]') ?? []);
    const first = items[0]; const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}><div className="modal-title"><h2>{title}</h2><button aria-label="Close dialog" onClick={close}>×</button></div>{children}</div></div>;
}

export function App({ api = window.moonaliza }: { api?: AppApi }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projectId, setProjectId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [profileId, setProfileId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [mode, setMode] = useState<'ask' | 'plan' | 'build' | 'research'>('ask');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [profileDialog, setProfileDialog] = useState(false);
  const [localModelsDialog, setLocalModelsDialog] = useState(false);
  const [researchDialog, setResearchDialog] = useState(false);
  const [privacyReview, setPrivacyReview] = useState<Project | 'chat'>();
  const [scopeLoading, setScopeLoading] = useState(true);
  const [branching, setBranching] = useState(false);
  const [branchDestination, setBranchDestination] = useState('');
  const [handoff, setHandoff] = useState('');
  const pendingSession = useRef<Session | undefined>(undefined);
  const [telemetry, setTelemetry] = useState<Pick<MethodResult<'session.read'>, 'context' | 'usage' | 'failure'>>();
  const [selection, setSelection] = useState<{ ticketId: string; name: string; pathLabel: string }>();
  const [details, setDetails] = useState(true);
  const project = projects.find(item => item.id === projectId);
  const profile = profiles.find(item => item.id === profileId);
  const currentSession = sessions.find(item => item.id === sessionId);
  const chatLocalOnly = currentSession ? currentSession.policy.inference === 'local-only' : !project;
  const cloudBlocked = (project?.policy.inference === 'local-only' || chatLocalOnly) && profile?.locality === 'external';
  const activeRun = runs.find(run => ['queued', 'running', 'awaiting_approval', 'awaiting_review', 'cancelling'].includes(run.status));
  const call = useCallback(<M extends MethodName,>(method: M, params: MethodParams<M>) => api.invoke(method, params as Record<string, unknown>) as Promise<MethodResult<M>>, [api]);
  const report = (reason: unknown) => setError(reason instanceof Error ? reason.message : 'The operation failed. Try again.');

  const refreshProjects = useCallback(async () => {
    const result = await call('project.list', {}); setProjects(result.projects); return result.projects;
  }, [call]);
  const refreshProfiles = useCallback(async () => {
    const result = await call('profile.list', {}); setProfiles(result.profiles);
    setProfileId(current => result.profiles.some(p => p.id === current) ? current : result.profiles[0]?.id ?? '');
  }, [call]);
  useEffect(() => {
    let alive = true;
    Promise.all([call('project.list', {}), call('profile.list', {})]).then(([p, f]) => {
      if (!alive) return;
      setProjects(p.projects); setProjectId(p.projects[0]?.id ?? '');
      setProfiles(f.profiles); setProfileId(f.profiles[0]?.id ?? ''); setReady(true);
    }).catch(reason => { if (alive) { report(reason); setReady(true); } });
    return () => { alive = false; };
  }, [call]);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setScopeLoading(true); setSessionId(''); setMessages([]); setRuns([]); setSessions([]); setText(''); setTelemetry(undefined); setMode('ask');
    call('session.list', { projectId: projectId || null }).then(result => { if (alive) { setSessions(result.sessions); const pending = pendingSession.current; if (pending && pending.projectId === (projectId || null)) { setSessionId(pending.id); pendingSession.current = undefined; } } }).catch(reason => { if (alive) report(reason); }).finally(() => { if (alive) setScopeLoading(false); });
    return () => { alive = false; };
  }, [projectId, call, ready]);
  useEffect(() => {
    // Session loading can follow a fast admission failure; never erase its message.
    setTelemetry(undefined);
    if (!sessionId) return;
    let alive = true;
    let revision = 0;
    const refresh = () => { const version = ++revision; return call('session.read', { sessionId }).then(result => { if (alive && version === revision) { setMessages(result.messages); setRuns(result.runs); setTelemetry(result); setSessions(current => current.map(item => item.id === result.session.id ? result.session : item)); } }).catch(reason => { if (alive && version === revision) report(reason); }); };
    void refresh();
    const unsubscribe = api.onEvent(() => { void refresh(); });
    return () => { alive = false; unsubscribe(); };
  }, [api, call, sessionId]);

  async function openProject(create = false) {
    setError(''); setBusy(true);
    try { const result = await call('project.pick', create ? { create: true } : {}); if ('ticketId' in result) setSelection(result); }
    catch (reason) { report(reason); } finally { setBusy(false); }
  }
  async function trustProject() {
    if (!selection) return;
    setBusy(true); setError('');
    try { const result = await call('project.trust', { ticketId: selection.ticketId }); await refreshProjects(); if (branching) setBranchDestination(result.project.id); else selectProject(result.project.id); setSelection(undefined); }
    catch (reason) { report(reason); } finally { setBusy(false); }
  }
  async function newSession() {
    const result = await call('session.create', { projectId: project?.id ?? null, title: 'New conversation' });
    setSessions(current => [result.session, ...current]); setSessionId(result.session.id); setMessages([]); setRuns([]); setTelemetry(undefined); setError('');
    return result.session.id;
  }
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || !profile || busy || scopeLoading || activeRun || cloudBlocked) return;
    setBusy(true); setError('');
    try {
      const target = sessionId || await newSession();
      if (!target) return;
      const result = await call('run.start', { sessionId: target, profileId: profile.id, mode, prompt: text.trim() });
      setRuns(current => [result.run, ...current]); setText(''); setTelemetry(undefined);
      const history = await call('session.read', { sessionId: target }); setMessages(history.messages); setSessions(current => current.map(item => item.id === target ? history.session : item));
    } catch (reason) { report(reason); } finally { setBusy(false); }
  }
  async function stop() {
    if (!activeRun) return;
    try { const result = await call('run.cancel', { runId: activeRun.id }); setRuns(current => current.map(r => r.id === result.run.id ? result.run : r)); }
    catch (reason) { report(reason); }
  }
  async function changePrivacy(target: Project, inference: 'local-only' | 'cloud-allowed') {
    setBusy(true); setError('');
    try {
      await call('project.policy.update', { projectId: target.id, expectedRevision: target.policy.revision, policy: { inference, research: target.policy.research } });
      await refreshProjects(); setPrivacyReview(undefined);
    } catch (reason) { report(reason); } finally { setBusy(false); }
  }
  async function changeChatPrivacy(inference: 'local-only' | 'cloud-allowed') {
    setBusy(true); setError('');
    const draft = text;
    try {
      let target = currentSession;
      if (!target) {
        const result = await call('session.create', { projectId: project?.id ?? null }); target = result.session;
        setSessions(current => [result.session, ...current]); setSessionId(result.session.id);
      }
      const result = await call('session.policy.update', { sessionId: target.id, expectedRevision: target.policy.revision, inference });
      setSessions(current => current.map(item => item.id === result.session.id ? result.session : item));
      setPrivacyReview(undefined); setText(draft);
    } catch (reason) { report(reason); } finally { setBusy(false); }
  }
  function reviewBranch() {
    setBranchDestination(project ? '' : projects[0]?.id ?? '');
    const discussion = !project ? messages.filter(m => ['user', 'assistant'].includes(m.role) && !m.toolCalls && !m.partial).map(m => `${m.role === 'user' ? 'You' : 'Moonzila'}: ${m.content}`).join('\n\n') : '';
    setHandoff(discussion.length <= 65536 ? discussion : ''); setBranching(true);
  }
  async function branchConversation() {
    if (!sessionId) return;
    setBusy(true); setError('');
    try {
      const result = await call('session.branch', { sessionId, projectId: branchDestination || null, context: handoff });
      setBranching(false); setText(''); setMessages([]); setRuns([]); setTelemetry(undefined); setMode('ask');
      if (branchDestination === projectId) { setSessions(current => [result.session, ...current]); setSessionId(result.session.id); }
      else { pendingSession.current = result.session; selectProject(branchDestination); }
    } catch (reason) { report(reason); } finally { setBusy(false); }
  }
  function selectProject(id: string) {
    if (id === projectId) return;
    setError(''); setScopeLoading(true); setText(''); setMessages([]); setRuns([]); setTelemetry(undefined); setProjectId(id);
  }
  function selectSession(id: string) { setError(''); setText(''); setMessages([]); setRuns([]); setTelemetry(undefined); setSessionId(id); }
  /** Open review: the review conversation may be newer than the listed conversations, so the list is read again first. */
  async function openConversation(id: string) {
    setResearchDialog(false); selectSession(id);
    if (sessions.some(item => item.id === id)) return;
    try { const result = await call('session.list', { projectId: projectId || null }); setSessions(result.sessions); } catch (reason) { report(reason); }
  }
  async function freshRequest() {
    if (!sessionId) return;
    const prompt = [...messages].reverse().find(message => message.role === 'user')?.content ?? '';
    setBusy(true); setError('');
    try {
      const result = await call('session.branch', { sessionId, projectId: projectId || null, context: '' });
      setSessions(current => [result.session, ...current]); setSessionId(result.session.id); setMessages([]); setRuns([]); setTelemetry(undefined); setText(prompt);
    } catch (reason) { report(reason); } finally { setBusy(false); }
  }
  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!event.ctrlKey || busy || selection || profileDialog || localModelsDialog || researchDialog || privacyReview || branching || scopeLoading) return;
    if (event.key.toLowerCase() === 'o' && !activeRun) { event.preventDefault(); void openProject(); }
    if (event.key.toLowerCase() === 'n' && !activeRun) { event.preventDefault(); setText(''); setBusy(true); void newSession().catch(report).finally(() => setBusy(false)); }
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => shortcut(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return <div className="workbench">
    <a className="skip-link" href="#conversation">Skip to conversation</a>
    <aside className="sidebar" aria-label="Projects and conversations">
      <div className="brand"><svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><path d="M24 25A13 13 0 1 1 24 7A11 11 0 1 0 24 25Z" fill="currentColor"/><circle cx="25" cy="16" r="2" fill="currentColor"/></svg><strong>Moonzila</strong></div>
      <button className="open-project" aria-label="Open project" aria-keyshortcuts="Control+O" onClick={() => void openProject()} disabled={busy || !!activeRun}>Open project <kbd aria-hidden="true">Ctrl O</kbd></button>
      <button className={!projectId ? 'nav-item selected' : 'nav-item'} disabled={busy || !!activeRun} onClick={() => selectProject('')}>General chats</button>
      <button className="quiet-button" disabled={busy || !!activeRun} onClick={() => void openProject(true)}>Create project folder</button>
      <div className="sidebar-label">Projects</div>
      <nav aria-label="Projects">{projects.map(p => <button key={p.id} className={p.id === projectId ? 'nav-item selected' : 'nav-item'} disabled={busy || !!activeRun} onClick={() => selectProject(p.id)}><span className="folder-icon" aria-hidden="true">▱</span><span>{p.name}</span>{!p.trusted && <span className="muted">Untrusted</span>}</button>)}</nav>
      <div className="sidebar-label conversation-label">Conversations<button aria-label="New conversation" disabled={busy || scopeLoading || !!activeRun} onClick={() => { setText(''); setBusy(true); void newSession().catch(report).finally(() => setBusy(false)); }}>+</button></div>
      <nav className="session-list" aria-label="Conversations">{sessions.map(s => <button className={s.id === sessionId ? 'nav-item selected' : 'nav-item'} key={s.id} disabled={busy || scopeLoading || !!activeRun} onClick={() => selectSession(s.id)}>{s.title}</button>)}{sessions.length === 0 && <p className="quiet-note">Your conversations will be saved here.</p>}</nav>
      <div className="sidebar-bottom"><button onClick={() => setLocalModelsDialog(true)}>Local models</button><button onClick={() => setProfileDialog(true)}>Model profiles <span aria-hidden="true">⚙</span></button><span className="development-label">Development build · 0.8.1</span></div>
    </aside>
    <main id="conversation" className="main-pane">
      <header className="toolbar"><div><h1>{project?.name ?? 'General chat'}</h1><span className="muted">{project ? project.policy.inference === 'local-only' || chatLocalOnly ? 'Local inference only' : 'Cloud inference allowed' : chatLocalOnly ? 'Local inference only · No folder access' : 'Cloud inference allowed · No folder access'}</span></div><div className="toolbar-actions">{sessionId && <button disabled={busy || !!activeRun} onClick={reviewBranch}>{project ? 'Switch workspace' : 'Attach workspace'}</button>}<button className="quiet-button" aria-pressed={details} onClick={() => setDetails(!details)}>Project details</button></div></header>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
      {telemetry?.failure && <div className="error-banner recovery-banner" role="alert"><span>{telemetry.failure.message}</span>{telemetry.failure.code === 'CONTEXT_LIMIT' && <div className="recovery-actions"><button onClick={() => setProfileDialog(true)}>Review context settings</button><button disabled={busy || !!activeRun} onClick={() => void freshRequest()}>Start fresh with this request</button></div>}</div>}
      <section className="transcript" aria-label="Conversation">
        {messages.length === 0 ? <div className="empty-state"><div className="orbit-mark" aria-hidden="true"><span /></div><h2>{project ? 'What are we working on?' : 'Your work starts here'}</h2><p>{project ? 'Ask a question or describe a change. Moonzila keeps the conversation with your project.' : 'Ask anything, explore an idea, or plan what to build. Choose a model to start; attach a folder whenever you need project tools.'}</p><div className="mode-examples"><button onClick={() => { setMode('ask'); setText(project ? 'Explain how this project is organized.' : 'Help me think through an idea.'); }}>{project ? 'Understand the project' : 'Explore an idea'}<span>Ask a question</span></button><button onClick={() => { setMode('plan'); setText('Help me plan the next change.'); }}>Plan a change<span>Work through an approach</span></button></div>{!profiles.length && <p className="setup-note">Add a connection in Model profiles to send your first message.</p>}</div> : messages.map(message => <MessageItem key={message.id} message={message} />)}
        {activeRun && <div className="run-progress" role="status">{activeRun.status === 'cancelling' ? 'Stopping the run…' : activeRun.status === 'awaiting_approval' ? 'Waiting for your review…' : 'Working…'}</div>}
        {project && <ChangesPanel key={project.id} api={api} projectId={project.id} runId={activeRun?.id} runMode={activeRun?.mode} />}
      </section>
      {telemetry?.context && <details className="context-notice"><summary>Context estimate: {telemetry.context.estimatedInputTokens.toLocaleString()} / {telemetry.context.inputBudgetTokens.toLocaleString()} input tokens</summary><p>Estimated from UTF-8 content and tool declarations; the provider’s tokenizer may differ. Response reserve: {telemetry.context.reservedOutputTokens.toLocaleString()} tokens. {telemetry.context.omittedHistoryMessages} older messages omitted; {telemetry.context.compactedToolResults} tool results shown as retrievable excerpts. Full results remain in this conversation.</p><p>{telemetry.usage ? `Last reported usage (step ${telemetry.usage.modelSteps}): ${telemetry.usage.inputTokens.toLocaleString()} input, ${telemetry.usage.outputTokens.toLocaleString()} output tokens.` : 'The provider has not reported token usage for this run.'}</p></details>}
      <form className="composer" onSubmit={event => void send(event)}>
        {cloudBlocked && <div className="privacy-notice" role="status"><p><strong>{profile.name}</strong> connects to {new URL(profile.endpoint).host}. This conversation or project currently allows local inference only. Choose a local profile or review cloud access before sending.</p><button type="button" onClick={() => setPrivacyReview(project?.policy.inference === 'local-only' ? project : 'chat')}>Review cloud access</button></div>}
        <label className="sr-only" htmlFor="prompt">Message Moonzila</label><textarea id="prompt" placeholder={project ? 'Ask about your project or describe a task…' : 'Ask anything or explore an idea…'} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && event.ctrlKey) void send(event); }} disabled={!ready || scopeLoading || busy} />
        <div className="composer-controls"><label className="select-label">Mode<select aria-label="Mode" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>{['ask', 'plan', 'build', 'research'].map(m => <option key={m} value={m} disabled={m === 'research' || (m === 'build' && !project)}>{m[0]!.toUpperCase() + m.slice(1)}</option>)}</select></label><select aria-label="Model profile" value={profileId} onChange={e => setProfileId(e.target.value)}><option value="">Choose a model</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="composer-spacer" />{activeRun ? <button type="button" className="stop-button" onClick={() => void stop()}>Stop run</button> : <button className="primary" type="submit" aria-label="Send message" disabled={(!!project && !project.trusted) || !profile || !text.trim() || busy || scopeLoading || cloudBlocked}>Send <span aria-hidden="true">↑</span></button>}</div>
      </form><p className="composer-footnote">{!project ? 'Paste a public GitHub repository URL to read it. General chat has no local file or command access.' : mode === 'build' ? 'File changes and commands require your review.' : 'This mode does not modify project files. Public GitHub URLs can be read.'}</p>
    </main>
    {details && <aside className="details-pane" aria-label="Project details"><h2>Project details</h2>{project ? <><div className="detail-section"><h3>Folder</h3><p className="path-label">{project.pathLabel}</p><span className="status-tag">{project.trusted ? 'Trusted project' : 'Trust revoked'}</span></div><div className="detail-section"><h3>Privacy</h3><p>{project.policy.inference === 'local-only' ? 'Project content stays with local model connections.' : 'Project content may be sent to your selected cloud provider.'}</p><button disabled={busy} onClick={() => project.policy.inference === 'local-only' ? setPrivacyReview(project) : void changePrivacy(project, 'local-only')}>{project.policy.inference === 'local-only' ? 'Allow cloud inference' : 'Use local inference only'}</button></div><div className="detail-section"><h3>Model connection</h3><p>{profile ? profile.name : 'No model selected'}</p><p className="muted">{profile?.model ?? 'Add your local runtime or API provider.'}</p><button onClick={() => setProfileDialog(true)}>Manage profiles</button></div><div className="detail-section"><h3>Research</h3><p>{project.policy.research === 'off' ? 'Research is off for this project.' : 'Collections send only the fields you review to your GitHub collector.'}</p><button onClick={() => setResearchDialog(true)}>Open research</button></div><div className="detail-section"><h3>Project access</h3><button disabled={!project.trusted} onClick={() => void call('project.revokeTrust', { projectId: project.id }).then(refreshProjects).catch(report)}>Revoke trust</button></div></> : <p className="muted">Chat first. A folder is only needed for project files and commands. Research tools are not connected yet.</p>}{currentSession && <div className="detail-section"><h3>Conversation privacy</h3><p>{chatLocalOnly ? 'This conversation allows local inference only.' : 'This conversation permits cloud inference, subject to project policy.'}</p><button disabled={busy} onClick={() => chatLocalOnly ? setPrivacyReview('chat') : void changeChatPrivacy('local-only')}>{chatLocalOnly ? 'Allow cloud for conversation' : 'Keep conversation local'}</button></div>}</aside>}
    <footer className="statusbar" role="status"><span className={ready ? 'status-dot ready' : 'status-dot'} />{ready ? 'Ready' : 'Connecting to engine…'}<span className="status-spacer" /><span>{profile?.name ?? 'No model connected'}</span><span>{activeRun ? 'Run active' : 'Idle'}</span></footer>
    {selection && <Modal title="Trust this project?" close={() => setSelection(undefined)}><p>Moonzila will be able to read this folder when you start a task. File changes and commands require approval.</p><p className="trust-path">{selection.pathLabel}</p><p>Only open folders whose contents you trust. Project instructions cannot grant additional permissions.</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="modal-actions"><button onClick={() => setSelection(undefined)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void trustProject()}>Trust and open</button></div></Modal>}
    {branching && !selection && <Modal title="Continue in another workspace" close={() => { if (!busy) setBranching(false); }}><p>The original conversation stays saved. A new conversation receives only the text you review below. File access, tool results and approvals do not transfer.</p><label className="branch-field">Destination<select aria-label="Destination workspace" value={branchDestination} onChange={e => setBranchDestination(e.target.value)}><option value="">General chat · no folder</option>{projects.filter(p => p.trusted).map(p => <option key={p.id} value={p.id}>{p.name} · {p.pathLabel}</option>)}</select></label><div className="modal-actions"><button disabled={busy} onClick={() => void openProject()}>Choose another folder</button><button disabled={busy} onClick={() => void openProject(true)}>Create new folder</button></div><label className="branch-field">Discussion to carry over<textarea aria-label="Discussion to carry over" rows={7} maxLength={65536} value={handoff} onChange={e => setHandoff(e.target.value)} /></label><p className="muted">{handoff.length.toLocaleString()} / 65,536 characters. Empty starts a fresh topic. The stricter privacy setting is preserved; destination project rules also apply. Nothing is sent yet.</p>{error && <p role="alert">{error}</p>}<div className="modal-actions"><button disabled={busy} onClick={() => setBranching(false)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void branchConversation()}>Create conversation</button></div></Modal>}
    {privacyReview === 'chat' && <Modal title="Allow cloud for this conversation?" close={() => { if (!busy) setPrivacyReview(undefined); }}><p>Allow this conversation's messages and any reviewed handoff text to be sent to external model providers you select. Project privacy rules still apply.</p>{profile?.locality === 'external' && <p>Selected provider: {profile.name} at {new URL(profile.endpoint).host}.</p>}<p>Nothing is sent by changing this setting. Your draft stays ready.</p>{error && <p role="alert">{error}</p>}<div className="modal-actions"><button disabled={busy} onClick={() => setPrivacyReview(undefined)}>Keep local only</button><button className="primary" disabled={busy} onClick={() => void changeChatPrivacy('cloud-allowed')}>Allow for this conversation</button></div></Modal>}
    {profileDialog && <ProfileDialog api={api} close={() => setProfileDialog(false)} saved={() => void refreshProfiles()} profiles={profiles} />}
    {researchDialog && project && <Modal title="Research" close={() => setResearchDialog(false)}><ResearchPanel key={project.id} api={api} project={project} openConversation={id => void openConversation(id)} /></Modal>}
    {localModelsDialog && <Modal title="Local model readiness" close={() => setLocalModelsDialog(false)}><LocalModelPanel api={api} /></Modal>}
    {privacyReview && privacyReview !== 'chat' && <Modal title="Allow cloud inference?" close={() => { if (!busy) setPrivacyReview(undefined); }}><p>Allow prompts, selected project contents and tool results from <strong>{privacyReview.name}</strong> to be sent to external model providers. This permission applies to future cloud profiles selected for this project.</p>{profile?.locality === 'external' && <p>Currently selected: <strong>{profile.name}</strong> at {new URL(profile.endpoint).host}.</p>}<p>Nothing is sent by changing this setting. Your draft stays ready for you to send. Research permissions are separate.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button disabled={busy} onClick={() => setPrivacyReview(undefined)}>Keep local only</button><button className="primary" disabled={busy} onClick={() => void changePrivacy(privacyReview, 'cloud-allowed')}>Allow for this project</button></div></Modal>}
  </div>;
}

function ProfileDialog({ api, close, saved, profiles }: { api: AppApi; close: () => void; saved: () => void; profiles: Profile[] }) {
  const [editing, setEditing] = useState<Profile>();
  const [name, setName] = useState(''); const [model, setModel] = useState('');
  const [contextTokens, setContextTokens] = useState(8192); const [outputTokens, setOutputTokens] = useState(2048);
  const [kind, setKind] = useState('ollama'); const [endpoint, setEndpoint] = useState('http://127.0.0.1:11434');
  const [secret, setSecret] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.invoke('profile.save', { ...(editing ? { id: editing.id, expectedRevision: editing.revision } : {}), name, kind, endpoint, model, contextTokens, outputTokens, ...(secret ? { secret } : {}) }); setSecret(''); saved(); close(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Profile could not be saved.'); } finally { setBusy(false); }
  }
  function edit(profile: Profile) {
    setEditing(profile); setName(profile.name); setKind(profile.kind); setEndpoint(profile.endpoint); setModel(profile.model);
    setContextTokens(profile.contextTokens); setOutputTokens(profile.outputTokens); setSecret(''); setError(''); setNotice('');
  }
  return <Modal title="Model profiles" close={close}><p>Connect to your local Ollama runtime or an OpenAI-compatible API. For Ollama, choose Ollama (local): its native API can refuse silent context truncation; the compatible /v1 API cannot.</p>{profiles.length > 0 && <div className="profile-list">{profiles.map(p => <div key={p.id}><div><strong>{p.name}</strong><small>{p.model} · {p.locality === 'local' ? 'Local' : 'Cloud'} · {p.contextTokens.toLocaleString()} context</small></div><button disabled={busy} aria-label={`Edit ${p.name}`} onClick={() => edit(p)}>Edit</button><button disabled={busy} onClick={() => { setBusy(true); setError(''); void api.invoke('profile.test', { profileId: p.id }).then(() => setNotice(`${p.name}: connection succeeded`)).catch(reason => setError(String(reason.message))).finally(() => setBusy(false)); }}>Test connection</button></div>)}</div>}{notice && <p role="status">{notice}</p>}<form onSubmit={event => void save(event)} className="profile-form">{editing && <p role="status">Editing {editing.name}. Changes apply to future runs. Leave the key blank to keep the encrypted credential at the same endpoint.</p>}<label>Profile name<input required value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label><label>Provider<select value={kind} onChange={e => { setKind(e.target.value); setEndpoint(e.target.value === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1'); }}><option value="ollama">Ollama (local)</option><option value="openai-compatible">OpenAI-compatible API</option></select></label><label>Endpoint<input required type="url" value={endpoint} onChange={e => setEndpoint(e.target.value)} /></label><label>Model name<input required value={model} onChange={e => setModel(e.target.value)} placeholder="Exact model name from your provider" /></label><p className="muted">Use the context window supported by this exact model. Raising this number does not increase the provider’s limit. The maximum response is reserved inside the window.</p><label>Context window (tokens)<input type="number" min="512" max="2000000" required value={contextTokens} onChange={e => setContextTokens(Number(e.target.value))} /></label><label>Maximum response (tokens)<input type="number" min="1" max={Math.min(200000, contextTokens)} required value={outputTokens} onChange={e => setOutputTokens(Number(e.target.value))} /></label><label>API key <span className="muted">(optional for local models)</span><input type="password" value={secret} onChange={e => setSecret(e.target.value)} autoComplete="new-password" /></label><p className="muted">Keys are encrypted by Windows and cannot be retrieved from this interface.</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="modal-actions"><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={busy} type="submit">{busy ? 'Saving…' : editing ? 'Save changes' : 'Save profile'}</button></div></form></Modal>;
}

function MessageItem({ message }: { message: Message }) {
  if (message.role === 'tool') {
    if (message.toolName === 'run_command' || message.toolName?.startsWith('git_')) {
      try {
        const result = CommandResultSchema.parse(JSON.parse(message.content));
        const status = result.cancelled ? 'Stopped' : result.timedOut ? 'Timed out' : result.status === 'unknown' ? 'Outcome unknown' : result.status === 'failed' ? 'Could not start' : `Exit code ${result.code}`;
        return <details className="message tool"><summary>{message.toolName === 'run_command' ? 'Command' : 'Git'} · {status}{result.truncated ? ' · Output truncated' : ''}</summary><pre className="message-content">{result.output || '(no output)'}</pre></details>;
      } catch { /* Read-tool errors retain their structured explanation. */ }
    }
    return <details className="message tool"><summary>{message.toolName ?? 'File tool'} result</summary><pre className="message-content">{message.content}</pre></details>;
  }
  const content = message.content || (message.toolCalls?.some(call => call.name === 'run_command') ? 'Preparing a command for review…' : message.toolCalls?.some(call => ['write_file', 'edit_file'].includes(call.name)) ? 'Preparing an edit for review…' : message.toolCalls?.length ? 'Inspecting the project…' : '');
  if (!content) return null;
  return <article className={`message ${message.role}`}><div className="message-author">{message.role === 'user' ? 'You' : 'Moonzila'}</div><div className="message-content">{content}</div></article>;
}
