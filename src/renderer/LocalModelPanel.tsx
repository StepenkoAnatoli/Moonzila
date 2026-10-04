import { useCallback, useEffect, useState } from 'react';
import type { MethodResult } from '../shared';
import type { AppApi } from './App';

const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
export function LocalModelPanel({ api }: { api: AppApi }) {
  const [report, setReport] = useState<MethodResult<'hardware.read'>>();
  const [runtime, setRuntime] = useState<MethodResult<'runtime.inspect'>>();
  const [reading, setReading] = useState(true); const [checking, setChecking] = useState(false); const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh(value => value + 1), []);
  useEffect(() => {
    let alive = true; setReading(true); setError('');
    void api.invoke('hardware.read', {}).then(result => { if (alive) setReport(result as MethodResult<'hardware.read'>); }).catch(() => { if (alive) setError('Hardware information is unavailable. Your model profiles still work.'); }).finally(() => { if (alive) setReading(false); });
    return () => { alive = false; };
  }, [api, refresh]);
  async function inspect() {
    setChecking(true); setError('');
    try { setRuntime(await api.invoke('runtime.inspect', {}) as MethodResult<'runtime.inspect'>); }
    catch { setError('The local runtime could not be inspected. Your model profiles still work.'); }
    finally { setChecking(false); }
  }
  const hardware = report?.hardware;
  const reserve = hardware ? Math.max(2 * 1024 ** 3, Math.ceil(hardware.totalRamBytes * 0.15)) : 0;
  return <div className="local-model-panel">
    <p>Check this PC and an existing Ollama connection before choosing a local model. Model availability alone does not establish coding quality.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section aria-label="PC hardware">
      <div className="local-panel-heading"><h3>This PC</h3><button disabled={reading} onClick={reload}>{reading ? 'Reading hardware…' : 'Refresh hardware'}</button></div>
      {!reading && report && !hardware && <p role="status">Hardware information is unavailable. Your model profiles still work.</p>}
      {hardware && <>
        <strong>{hardware.cpu.name}</strong><p>{hardware.cpu.architecture} · {hardware.cpu.logicalProcessors} logical processors</p>
        <dl className="hardware-measurements"><div><dt>Total RAM</dt><dd>{gib(hardware.totalRamBytes)}</dd></div><div><dt>Available now</dt><dd>{gib(hardware.availableRamBytes)}</dd></div><div><dt>System reserve</dt><dd>{gib(reserve)}</dd></div></dl>
        <p className="muted">Measured {new Date(report.checkedAt).toLocaleTimeString()}. Available memory changes as other apps run.</p>
        {hardware.availableRamBytes < reserve && <p className="memory-notice">Available RAM is below the {gib(reserve)} system reserve. Close other apps before testing a local model.</p>}
        {hardware.adapters.map(adapter => <article className="hardware-adapter" key={adapter.id}><strong>{adapter.name}</strong><dl className="hardware-measurements"><div><dt>Dedicated GPU memory</dt><dd>{gib(adapter.dedicatedBytes)}</dd></div></dl><p>Free GPU memory: {adapter.availableBytes === null ? 'Unknown' : gib(adapter.availableBytes)}</p><p className="muted">Driver: {adapter.driver ?? 'Unknown'}</p></article>)}
        {!hardware.adapters.length && <p>{hardware.warnings.includes('DXGI_UNAVAILABLE') ? 'Graphics information is unavailable.' : 'No physical graphics adapter was reported.'}</p>}
        {hardware.warnings.length > 0 && <p className="muted">Some graphics measurements are unavailable. Shared system memory and process budgets are not counted as free GPU memory.</p>}
      </>}
    </section>
    <section aria-label="Local runtime" className="local-runtime">
      <div className="local-panel-heading"><h3>Ollama connection</h3><button disabled={checking} onClick={() => void inspect()}>{checking ? 'Checking…' : 'Check Ollama'}</button></div>
      <p>Checks 127.0.0.1:11434 for an existing runtime and installed models. Monnzila does not start, stop or change that runtime during this check.</p>
      {runtime && <div role="status" data-testid="runtime-status">
        {runtime.status === 'unavailable' ? <p>No Ollama runtime could be reached at this address. For a different local address, use Model profiles.</p> : runtime.status === 'incompatible' ? <p>The service responded, but its model inventory could not be verified.</p> : <><p>Connected · Ollama {runtime.version} · externally managed</p>{!runtime.models.length && <p>No installed models were reported.</p>}
          <ul className="local-model-list">{runtime.models.map(model => <li key={`${model.name}:${model.digest}`}><strong>{model.name}</strong><span>{gib(model.sizeBytes)} on disk · {model.quantization ?? 'Quantization unknown'}</span><span className="muted">Not qualified for coding</span></li>)}</ul></>}
      </div>}
      <p className="muted">Managed installation and automatic model qualification are still in development. Existing local and API connections are available in Model profiles.</p>
    </section>
  </div>;
}
