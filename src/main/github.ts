import { z } from 'zod';
import { parseGitHubInput, type GitHubInput } from '../shared/github';
import { isSensitiveContextPath } from '../tools/paths';

const MAX_RESPONSE = 2_097_152;
const MAX_FILE = 262_144;
const entrySchema = z.object({ type: z.string(), path: z.string().max(1024), name: z.string().max(255), size: z.number().nonnegative().optional(), submodule_git_url: z.unknown().optional() });
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
/** One reader per active run: commit pins cannot bleed across runs or conversations. */
export class GitHubReader {
  private readonly commits = new Map<string, string>();
  constructor(private readonly fetcher: Fetcher = fetch) {}
  private async request(route: string, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) throw new Error('RUN_CANCELLED');
    const response = await this.fetcher(`https://api.github.com${route}`, { method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', signal,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Monnzila-public-repository-reader' } });
    try {
      if (signal.aborted) throw new Error('RUN_CANCELLED');
      if (response.status >= 300 && response.status < 400) throw new Error('GITHUB_REDIRECT');
      if (response.status === 404) throw new Error('GITHUB_NOT_FOUND');
      if (response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))) throw new Error('GITHUB_RATE_LIMIT');
      if (response.status === 401 || response.status === 403) throw new Error('GITHUB_FORBIDDEN');
      if (!response.ok) throw new Error('GITHUB_UNAVAILABLE');
      if (Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE) throw new Error('GITHUB_TOO_LARGE');
      if (!response.body) throw new Error('GITHUB_INVALID_RESPONSE');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      try { for (;;) {
        const part = await reader.read(); if (signal.aborted) throw new Error('RUN_CANCELLED'); if (part.done) break;
        length += part.value.byteLength; if (length > MAX_RESPONSE) throw new Error('GITHUB_TOO_LARGE'); chunks.push(part.value);
      } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw new Error('GITHUB_INVALID_RESPONSE'); }
    } finally { if (!response.body?.locked) await response.body?.cancel().catch(() => {}); }
  }
  async read(value: GitHubInput, allowed: readonly string[], stop: AbortSignal): Promise<string> {
    const input = parseGitHubInput(value);
    if (!allowed.includes(input.repository)) throw new Error('GITHUB_SCOPE_REQUIRED');
    if (isSensitiveContextPath(input.path)) throw new Error('GITHUB_PATH_EXCLUDED');
    const timeout = AbortSignal.timeout(20_000); const signal = AbortSignal.any([stop, timeout]);
    try {
      const base = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
      const key = `${input.repository}:${input.ref}`; let commit = this.commits.get(key);
      if (!commit) {
        const result = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }).safeParse(await this.request(`${base}/commits/${encodeURIComponent(input.ref)}`, signal));
        if (!result.success) throw new Error('GITHUB_INVALID_RESPONSE'); commit = result.data.sha; this.commits.set(key, commit);
      }
      const encodedPath = input.path.split('/').map(encodeURIComponent).join('/');
      const data = await this.request(`${base}/contents/${encodedPath}?ref=${commit}`, signal);
      const prefix = `https://github.com/${input.owner}/${input.repo}`;
      const identity = { repository: input.repository, commit, path: input.path };
      let result: object;
      if (Array.isArray(data)) {
        const entries = z.array(entrySchema).max(1000).safeParse(data); if (!entries.success) throw new Error('GITHUB_INVALID_RESPONSE');
        const visible = entries.data.filter(entry => ['file', 'dir'].includes(entry.type) && !entry.submodule_git_url && !isSensitiveContextPath(entry.path));
        const selected: object[] = [];
        for (const entry of visible) {
          const parent = input.path ? `${input.path}/` : '';
          if (entry.path !== parent + entry.name || entry.name.includes('/') || (entry.path.includes('\\') || [...entry.path].some(char => char.charCodeAt(0) < 32)) || ['.', '..'].includes(entry.name)) throw new Error('GITHUB_INVALID_RESPONSE');
          const item = { path: entry.path, type: entry.type === 'dir' ? 'directory' : 'file' };
          if (selected.length >= 200 || JSON.stringify(selected).length + JSON.stringify(item).length > 35000) break;
          selected.push(item);
        }
        result = { ...identity, kind: 'directory', url: `${prefix}/tree/${commit}${encodedPath ? '/' + encodedPath : ''}`, entries: selected, truncated: data.length >= 1000 || selected.length < visible.length, excludedEntries: entries.data.length - visible.length };
      } else {
        const file = z.object({ type: z.literal('file'), size: z.number().int().nonnegative().max(MAX_FILE), path: z.literal(input.path), encoding: z.literal('base64'), content: z.string().max(400000), submodule_git_url: z.unknown().optional(), target: z.unknown().optional() }).safeParse(data);
        if (!file.success || file.data.submodule_git_url || file.data.target) throw new Error('GITHUB_UNSUPPORTED_FILE');
        const encoded = file.data.content.replace(/\s/g, '');
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('GITHUB_INVALID_RESPONSE');
        const bytes = Buffer.from(encoded, 'base64'); if (bytes.length !== file.data.size || bytes.length > MAX_FILE) throw new Error('GITHUB_INVALID_RESPONSE');
        let text: string; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('GITHUB_UNSUPPORTED_FILE'); }
        if ([...text].some(char => { const code = char.charCodeAt(0); return (code < 32 && ![9, 10, 13].includes(code)) || code === 127; })) throw new Error('GITHUB_UNSUPPORTED_FILE');
        const lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
        const selected = lines.slice(input.startLine - 1, input.startLine - 1 + input.lineCount).join('\n'); const excerpt = selected.slice(0, 16000);
        const endLine = excerpt ? input.startLine + excerpt.split('\n').length - 1 : input.startLine - 1;
        result = { ...identity, kind: 'file', url: `${prefix}/blob/${commit}/${encodedPath}`, startLine: input.startLine, endLine, totalLines: lines.length, text: excerpt, truncated: input.startLine > 1 || endLine < lines.length || selected.length > excerpt.length };
      }
      if (signal.aborted) throw new Error('RUN_CANCELLED');
      return JSON.stringify(result);
    } catch (error) {
      if (stop.aborted) throw new Error('RUN_CANCELLED', { cause: error }); if (timeout.aborted) throw new Error('GITHUB_TIMEOUT', { cause: error });
      if (error instanceof Error && /^GITHUB_[A-Z_]+$/.test(error.message)) throw error;
      throw new Error('GITHUB_UNAVAILABLE', { cause: error });
    }
  }
}
