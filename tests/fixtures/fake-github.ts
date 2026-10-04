// Test-only. A loopback stand-in for api.github.com, reached by the real Research Kit collector through a
// CONNECT proxy that tunnels only api.github.com:443 and artifacts.invalid:443 and forwards nothing anywhere.
// TLS ends here with a CA and leaf generated for this fake (tests/fixtures/github-tls.ts), trusted only by the child's
// NODE_EXTRA_CA_CERTS = caPath. The CA file lives in the fake's own temporary folder until close().
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo, Socket } from 'node:net';
import { generateTestTls } from './github-tls';

export const FAKE_REPOSITORY = 'o/r';
export const FAKE_RUN_ID = 1;
export const FAKE_ARTIFACT_ID = 7;
/** The run's commit: a journey's package is made with this as its commit, so the import's binding matches it. */
export const FAKE_HEAD_SHA = 'a'.repeat(40);

export interface FakeScenario {
  /** The dispatch answer: 'ok' is 200 with the run details, 'reset' closes the socket after reading the body. */
  dispatch?: 'ok' | 'reset' | number;
  dispatchBody?: unknown;
  htmlUrl?: string;
  /** The run read: an HTTP status other than 200, or the run's status and conclusion. */
  runHttp?: number;
  runStatus?: string;
  conclusion?: string | null;
  /** Holds every run read this long, so a short kit --timeout ends on the first poll. */
  holdRunMs?: number;
  artifactsHttp?: number;
  artifacts?: Array<{ id: number; name: string; expired?: boolean }>;
  /** The artifact download: 200 with zip, 302 to artifacts.invalid, or another status. */
  download?: 'direct' | 'redirect' | number;
  zip?: Buffer;
}
export interface SeenRequest { host: string; method: string; path: string; authorization: 'exact' | 'other' | 'none'; version: string | null; body: unknown }

export interface FakeGitHub {
  readonly proxyUrl: string;
  /** Absolute path of this fake's freshly generated test CA; removed by close(). */
  readonly caPath: string;
  readonly seen: SeenRequest[];
  readonly connects: string[];
  set(scenario: FakeScenario): void;
  reset(): void;
  close(): Promise<void>;
}

const tunnelled = new Set(['api.github.com:443', 'artifacts.invalid:443']);

export async function startFakeGitHub(token: string): Promise<FakeGitHub> {
  let scenario: FakeScenario = {};
  const seen: SeenRequest[] = []; const connects: string[] = []; const sockets = new Set<Socket>();
  const material = await generateTestTls();
  // Any failure from here on removes the generated folder: nothing is left in tmp by a start that throws.
  try {
    const api = https.createServer({ key: material.leafKeyPem, cert: material.leafPem }, (request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8'); const header = request.headers.authorization;
        const path = request.url ?? ''; const host = String(request.headers.host ?? '');
        let body: unknown; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
        seen.push({ host, method: request.method ?? '', path, authorization: header === undefined ? 'none' : header === `Bearer ${token}` ? 'exact' : 'other', version: (request.headers['x-github-api-version'] as string | undefined) ?? null, body });
        const json = (status: number, value?: unknown) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(value === undefined ? '' : JSON.stringify(value)); };
        const zip = () => { response.writeHead(200, { 'content-type': 'application/zip' }); response.end(scenario.zip ?? Buffer.alloc(0)); };
        if (host.startsWith('artifacts.invalid')) { if (request.method === 'GET' && path === `/blob/${FAKE_ARTIFACT_ID}`) zip(); else json(404, { message: 'Not Found' }); return; }
        const base = `/repos/${FAKE_REPOSITORY}/actions`;
        if (request.method === 'POST' && path === `${base}/workflows/collect.yml/dispatches`) {
          const answer = scenario.dispatch ?? 'ok';
          if (answer === 'reset') { request.socket.destroy(); return; }
          if (answer === 204) { response.writeHead(204); response.end(); return; }
          if (answer !== 'ok') { json(answer, scenario.dispatchBody ?? { message: `HTTP ${answer}` }); return; }
          json(200, { workflow_run_id: FAKE_RUN_ID, run_url: `https://api.github.com${base}/runs/${FAKE_RUN_ID}`, html_url: scenario.htmlUrl ?? `https://github.com/${FAKE_REPOSITORY}/actions/runs/${FAKE_RUN_ID}` });
          return;
        }
        if (request.method === 'GET' && path === `${base}/runs/${FAKE_RUN_ID}`) {
          setTimeout(() => {
            if (scenario.runHttp) json(scenario.runHttp, { message: `HTTP ${scenario.runHttp}` });
            // The identity fields are what main's verified import checks (src/main/research-import.ts RunSchema); the kit's
            // watch reads only status and conclusion.
            else json(200, { id: FAKE_RUN_ID, run_attempt: 1, head_sha: FAKE_HEAD_SHA, head_branch: 'main', path: '.github/workflows/collect.yml', event: 'workflow_dispatch', repository: { full_name: FAKE_REPOSITORY }, status: scenario.runStatus ?? 'completed', conclusion: scenario.conclusion === undefined ? 'success' : scenario.conclusion, html_url: `https://github.com/${FAKE_REPOSITORY}/actions/runs/${FAKE_RUN_ID}` });
          }, scenario.holdRunMs ?? 0);
          return;
        }
        if (request.method === 'GET' && path.split('?')[0] === `${base}/runs/${FAKE_RUN_ID}/artifacts`) {
          if (scenario.artifactsHttp) { json(scenario.artifactsHttp, { message: `HTTP ${scenario.artifactsHttp}` }); return; }
          const artifacts = (scenario.artifacts ?? [{ id: FAKE_ARTIFACT_ID, name: 'research-kit-corpus-v1-moonaliza-fixture' }]).map(item => ({ expired: false, ...item }));
          json(200, { total_count: artifacts.length, artifacts }); return;
        }
        if (request.method === 'GET' && path === `${base}/artifacts/${FAKE_ARTIFACT_ID}/zip`) {
          const answer = scenario.download ?? 'direct';
          if (answer === 'direct') zip();
          else if (answer === 'redirect') { response.writeHead(302, { location: `https://artifacts.invalid/blob/${FAKE_ARTIFACT_ID}` }); response.end(); }
          else json(answer, { message: `HTTP ${answer}` });
          return;
        }
        json(404, { message: 'Not Found' });
      });
    });
    const proxy = http.createServer((_request, response) => { response.writeHead(403); response.end(); });
    proxy.on('connect', (request: http.IncomingMessage, socket: Socket, head: Buffer) => {
      const authority = request.url ?? ''; connects.push(authority); sockets.add(socket); socket.on('close', () => sockets.delete(socket));
      if (!tunnelled.has(authority)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) socket.unshift(head);
      api.emit('connection', socket);
    });
    await new Promise<void>((done, fail) => { proxy.once('error', fail); proxy.listen(0, '127.0.0.1', done); });
    const { port } = proxy.address() as AddressInfo;
    return {
      proxyUrl: `http://127.0.0.1:${port}`, caPath: material.caPath, seen, connects,
      set(next) { scenario = next; },
      reset() { scenario = {}; seen.length = 0; connects.length = 0; },
      async close() {
        for (const socket of sockets) socket.destroy();
        await Promise.all([new Promise<void>(done => proxy.close(() => done())), new Promise<void>(done => api.close(() => done()))]);
        await material.dispose();
      },
    };
  } catch (error) { await material.dispose(); throw error; }
}
