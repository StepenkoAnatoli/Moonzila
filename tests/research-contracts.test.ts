import { describe, expect, test } from 'vitest';
import { EventSchema, MethodSpec, PublicErrorSchema, RESEARCH_INPUT_BUDGET, ResearchSchema, ResearchStatusSchema } from '../src/shared';
import { commandLineFits, dispatchArgs } from '../src/adapters/research-kit/collector';
import { safeError } from '../src/main/bridge';
import { ACTIVE_RESEARCH as ENGINE_ACTIVE, RESEARCH_EDGES } from '../src/engine/research-state';
import { ACTIVE_RESEARCH, CANCELLABLE_RESEARCH, RESEARCH_STATUS } from '../src/renderer/research-text';

const start = MethodSpec['research.start'].params;
const save = MethodSpec['research.collector.save'].params;
const validStart = { projectId: 'p1', topic: 'Ollama context limits', queries: ['ollama num_ctx default'], urls: ['https://docs.ollama.com/faq'], preferDomains: ['docs.ollama.com'], acknowledgedPublic: true };

describe('research contracts', () => {
  test('the declared-but-superseded methods are gone', () => {
    // research.provision took raw secrets from the renderer; research.review let a user flip readiness.
    expect(Object.keys(MethodSpec)).not.toContain('research.provision');
    expect(Object.keys(MethodSpec)).not.toContain('research.review');
  });

  test('start takes the collector inputs and requires acknowledging they become public', () => {
    expect(start.parse(validStart)).toMatchObject({ depth: 'quick', maxPages: 8 });
    expect(start.safeParse({ ...validStart, acknowledgedPublic: false }).success).toBe(false);
    expect(start.safeParse({ ...validStart, acknowledgedPublic: undefined }).success).toBe(false);
    expect(start.safeParse({ ...validStart, brief: 'free text' }).success).toBe(false);
  });

  test('start enforces the collector limits', () => {
    expect(start.safeParse({ ...validStart, maxPages: 26 }).success).toBe(false);
    expect(start.safeParse({ ...validStart, maxPages: 0 }).success).toBe(false);
    // Known URLs are fetched directly and count against the page budget.
    expect(start.safeParse({ ...validStart, maxPages: 1, urls: ['https://a.example/1', 'https://a.example/2'] }).success).toBe(false);
    // Queries and URLs travel as one newline-separated input, so neither may contain a line break.
    expect(start.safeParse({ ...validStart, queries: ['one\ntwo'] }).success).toBe(false);
    expect(start.safeParse({ ...validStart, topic: 'a\nb' }).success).toBe(false);
    expect(start.safeParse({ ...validStart, depth: 'deep' }).success).toBe(false);
    // The kit's own parser would read these as flags (`--runner=windows-latest` would change the runner).
    expect(start.safeParse({ ...validStart, queries: ['--runner=windows-latest'] }).success).toBe(false);
    expect(start.safeParse({ ...validStart, topic: '--max-pages=25' }).success).toBe(false);
    // Preferred domains are joined with commas, so a comma would smuggle in another domain.
    expect(start.safeParse({ ...validStart, preferDomains: ['a.example,b.example'] }).success).toBe(false);
    expect(start.safeParse({ ...validStart, preferDomains: ['github.com/actions/upload-artifact'] }).success).toBe(true);
  });

  test('no research payload accepts a credential field', () => {
    // Start from a valid input for each method, so a rejection can only come from the added field.
    const valid: Record<string, object> = {
      'research.collector.read': {}, 'research.list': { projectId: 'p1' }, 'research.start': validStart, 'research.read': { researchId: 'r1' },
      'research.cancel': { researchId: 'r1' }, 'research.review.start': { researchId: 'r1', profileId: 'pr1' }, 'research.purge': { researchId: 'r1' },
    };
    const names = Object.keys(MethodSpec).filter(key => key.startsWith('research.') && key !== 'research.collector.save');
    expect(names.sort()).toEqual(Object.keys(valid).sort());
    for (const name of names) {
      const params = MethodSpec[name as keyof typeof MethodSpec].params;
      expect(params.safeParse(valid[name]).success, name).toBe(true);
      for (const field of ['secret', 'token', 'provisioningSecret', 'runtimeSecret']) {
        expect(params.safeParse({ ...valid[name], [field]: 'ghp_x' }).success, `${name}.${field}`).toBe(false);
      }
    }
  });

  test('the collector token enters only through the main-owned save, and never comes back', () => {
    const spec = MethodSpec['research.collector.save'];
    expect(spec.owner).toBe('main');
    expect(save.safeParse({ repository: 'owner/collector', workflow: 'collect.yml', ref: 'main', token: 'github_pat_x' }).success).toBe(true);
    expect(save.safeParse({ repository: 'owner/collector', workflow: 'collect.yml', ref: 'main', token: 'x', clearToken: true }).success).toBe(false);
    expect(save.safeParse({ repository: 'not a repo', workflow: 'collect.yml', ref: 'main' }).success).toBe(false);
    expect(save.safeParse({ repository: 'owner/collector', workflow: '../collect.yml', ref: 'main' }).success).toBe(false);
    expect(save.safeParse({ repository: '-owner/collector', workflow: 'collect.yml', ref: 'main' }).success).toBe(false);
    expect(save.safeParse({ repository: 'owner/collector', workflow: 'collect.yml', ref: '--no-wait' }).success).toBe(false);
    expect(save.safeParse({ repository: 'owner/collector', workflow: 'collect.yml', ref: 'release/1.x' }).success).toBe(true);
    const collector = { revision: 1, repository: 'owner/collector', workflow: 'collect.yml', ref: 'main', tokenConfigured: true };
    expect(spec.result.safeParse({ collector }).success).toBe(true);
    expect(spec.result.safeParse({ collector: { ...collector, token: 'github_pat_x' } }).success).toBe(false);
    expect(MethodSpec['research.collector.read'].result.safeParse({ collector: { ...collector, token: 'x' } }).success).toBe(false);
  });

  test('a collector token is printable ASCII without whitespace, so the kit cannot trim it into another value', () => {
    const base = { repository: 'owner/collector', workflow: 'collect.yml', ref: 'main' };
    for (const token of ['github_pat_x', 'x', '~!@#$%^&*()_+{}|:"<>?']) expect(save.safeParse({ ...base, token }).success, token).toBe(true);
    for (const token of [' github_pat_x', 'github_pat_x ', 'a b', 'a\nb', 'a\tb', 'a\0b', 'ünicode', '']) expect(save.safeParse({ ...base, token }).success, JSON.stringify(token)).toBe(false);
    expect(save.safeParse({ ...base, clearToken: true }).success).toBe(true);
  });

  test('research start inputs are refused early when they cannot fit one collector command line', () => {
    const long = (n: number) => 'q'.repeat(n);
    expect(start.safeParse({ ...validStart, topic: long(2048), queries: Array(16).fill(long(500)), urls: [], preferDomains: [] }).success).toBe(true);
    expect(start.safeParse({ ...validStart, topic: long(2048), queries: Array(16).fill(long(512)), urls: Array(8).fill(`https://example.com/${long(300)}`) }).success).toBe(false);
  });

  test('inputs at the budget fit one collector command line, even when every character of topic and queries needs escaping', () => {
    // Quotes double under Windows quoting. URLs fill the rest of the budget exactly; targets and paths are at their longest.
    const topic = '"'.repeat(2048); const queries = Array<string>(16).fill('"'.repeat(512));
    const rest = RESEARCH_INPUT_BUDGET - topic.length - queries.length * 512; const prefix = 'https://example.com/';
    const urls = Array.from({ length: 25 }, (_, i) => prefix + 'p'.repeat(Math.floor(rest / 25) + (i < rest % 25 ? 1 : 0) - prefix.length));
    const params = start.parse({ ...validStart, topic, queries, urls, preferDomains: [], maxPages: 25 });
    expect(start.safeParse({ ...validStart, topic, queries, urls: [...urls.slice(1), urls[0] + 'p'], preferDomains: [], maxPages: 25 }).success).toBe(false);
    const path = 'C:\\' + 'd'.repeat(250) + '\\';
    const target = { collectorRevision: 1, repository: 'o'.repeat(39) + '/' + 'r'.repeat(100), workflow: 'w'.repeat(128) + '.yml', ref: 'r'.repeat(255) };
    const job = { topic: params.topic, clientRef: 'm'.repeat(64), inputs: { queries: params.queries, urls: params.urls, preferDomains: params.preferDomains, depth: params.depth, maxPages: params.maxPages } };
    expect(commandLineFits(path + 'node.exe', dispatchArgs(path + 'collect-remote.mjs', job, target))).toBe(true);
  });

  test('COLLECTOR_TOKEN_REQUIRED crosses the bridge as itself', () => {
    const error = safeError(new Error('COLLECTOR_TOKEN_REQUIRED'));
    expect(error.code).toBe('COLLECTOR_TOKEN_REQUIRED');
    expect(PublicErrorSchema.safeParse(error).success).toBe(true);
    expect(error.message).not.toMatch(/github_pat|token:/);
  });

  test('the panel\'s active and cancellable statuses are the engine\'s', () => {
    // The panel shows one active job per project and offers Cancel where the user may cancel. Both follow the engine's
    // own rules, so a status added there (as `packaging` in schema v4) cannot be left out here.
    expect([...ACTIVE_RESEARCH].sort()).toEqual([...ENGINE_ACTIVE].sort());
    const userCancels = Object.entries(RESEARCH_EDGES).filter(([, edges]) => [edges?.cancelling, edges?.cancelled].some(edge => edge?.actors.includes('user'))).map(([from]) => from);
    expect([...CANCELLABLE_RESEARCH].sort()).toEqual(userCancels.sort());
    for (const status of ResearchStatusSchema.options) expect(RESEARCH_STATUS[status]).toMatch(/\S/);
  });

  test('review is started for a job, never decided by a flag', () => {
    const params = MethodSpec['research.review.start'].params;
    expect(params.safeParse({ researchId: 'r1', profileId: 'pr1' }).success).toBe(true);
    expect(params.safeParse({ researchId: 'r1', profileId: 'pr1', decision: 'sufficient' }).success).toBe(false);
    expect(params.safeParse({ researchId: 'r1', profileId: 'pr1', buildAuthorized: true }).success).toBe(false);
  });

  test('job state and events share one status vocabulary', () => {
    const statuses = ['queued', 'dispatching', 'collecting', 'collected', 'reviewing', 'packaging', 'approved', 'not_ready', 'failed', 'cancelling', 'cancelled'];
    expect(ResearchStatusSchema.options).toEqual(statuses);
    const research = { id: 'r1', projectId: 'p1', revision: 1, status: 'collecting', topic: 't', clientRef: 'monnzila-r1', workflowRunId: '123', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' };
    expect(ResearchSchema.safeParse(research).success).toBe(true);
    expect(ResearchSchema.safeParse({ ...research, status: 'sufficient' }).success).toBe(false);
    expect(ResearchSchema.safeParse({ ...research, clientRef: '-bad' }).success).toBe(false);
    expect(ResearchSchema.safeParse({ ...research, packageDigest: 'a'.repeat(64) }).success).toBe(true);
    const event = { schemaVersion: 1, engineEpoch: 'e', runId: 'run', seq: 1, at: 1, type: 'research.status' };
    expect(EventSchema.safeParse({ ...event, payload: { researchId: 'r1', status: 'approved' } }).success).toBe(true);
    expect(EventSchema.safeParse({ ...event, payload: { researchId: 'r1', status: 'awaiting_review' } }).success).toBe(false);
  });
});

test('the research start input budget is the 12,000 characters the collection spec states', () => {
  expect(RESEARCH_INPUT_BUDGET).toBe(12_000);
});
