import { open, writeFile } from 'node:fs/promises';
import { ResearchKit } from '../src/adapters/research-kit/adapter';
import { BindingSchema } from '../src/adapters/research-kit/contracts';

const flags = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index]!; const value = process.argv[index + 1];
  if (!['--config', '--artifact', '--binding', '--output'].includes(name) || !value || flags.has(name)) throw new Error('Usage: npx tsx scripts/verify-research-kit.ts --config <trusted-installation.json> --artifact <package.zip> --binding <expected-job.json> --output <report.json>');
  flags.set(name, value);
}
if (flags.size !== 4) throw new Error('All four named arguments are required. See docs/specification/research-kit-offline.md.');
async function json(path: string) {
  const handle = await open(path, 'r');
  try { const bytes = Buffer.alloc(65537); const { bytesRead } = await handle.read(bytes); if (bytesRead > 65536) throw new Error('CONFIG_LIMIT'); return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')); }
  finally { await handle.close(); }
}
const adapter = new ResearchKit(await json(flags.get('--config')!));
const controller = new AbortController(); process.once('SIGINT', () => controller.abort());
try {
  const result = await adapter.validate(flags.get('--artifact')!, BindingSchema.parse(await json(flags.get('--binding')!)), controller.signal);
  await writeFile(flags.get('--output')!, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(`${result.status}; researchReady=${result.researchReady}; Moonzila tool permission is separate.`);
  process.exitCode = result.status === 'PASS' ? 0 : 1;
} finally { await adapter.close(); }
