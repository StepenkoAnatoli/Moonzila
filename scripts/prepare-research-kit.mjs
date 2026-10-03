// Explicit development/CI provisioning. The desktop never clones or downloads a tool.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportSource, inventory, revision } from './research-kit-source.mjs';
// Paths below are repository-relative: run from the repository root whatever the caller's cwd.
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const repo = resolve('.build/research-kit-pin');
if (!existsSync(repo)) {
  try { execFileSync('git', ['-c', 'core.longpaths=true', 'clone', '--no-checkout', 'https://github.com/StepenkoAnatoli/Research-Kit.git', repo], { stdio: 'inherit', windowsHide: true }); }
  catch { throw new Error(`Could not clone the external Research Kit into ${repo}. The first run needs access to github.com; later runs reuse the clone.`); }
}
// Export into an empty directory, so files from an earlier pin cannot fail the inventory check.
const destination = resolve('.build/research-kit-external');
rmSync(destination, { recursive: true, force: true });
const root = exportSource(repo, revision, destination);
const expected = JSON.parse(readFileSync('src/adapters/research-kit/runtime-inventory.json', 'utf8'));
if (JSON.stringify(inventory(root)) !== JSON.stringify(expected)) throw new Error('Pinned Research Kit bytes differ from reviewed inventory');
console.log(`Prepared external Research Kit ${revision}; ${expected.files.length} runtime files verified.`);
