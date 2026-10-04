import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';

export const revision = 'fcde0e6c4e9ba585454f81262d695609ef0af474';
export const legacyRevision = '1a0337b9cb1be34127f655671d72f752fe47210c';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function exportSource(repo, pin, destination) {
  // --git-dir, not -C: if the pin clone is broken, git must fail rather than walk up into Monnzila.
  const git = ['--git-dir', join(repo, '.git')];
  // A clone made before the pin moved may not contain the pinned commit: fetch it by SHA rather than fail.
  try { execFileSync('git', [...git, 'cat-file', '-e', `${pin}^{commit}`], { stdio: 'ignore', windowsHide: true }); }
  catch { execFileSync('git', [...git, 'fetch', '--quiet', 'origin', pin], { stdio: 'inherit', windowsHide: true }); }
  mkdirSync(destination, { recursive: true });
  const archive = execFileSync('git', [...git, 'archive', pin, 'research-kit'], { windowsHide: true, maxBuffer: 64 * 1024 ** 2 });
  execFileSync('tar', ['-xf', '-', '-C', destination], { input: archive, windowsHide: true });
  return join(destination, 'research-kit');
}
export function inventory(root) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) { const bytes = readFileSync(file); files.push({ path: relative(root, file).replaceAll('\\', '/'), size: bytes.length, sha256: sha256(bytes) }); }
      else throw new Error('Unexpected runtime link');
    }
  }
  for (const dir of ['bin', 'lib', 'schemas']) walk(join(root, dir));
  return { revision, files: files.sort((a, b) => a.path.localeCompare(b.path, 'en')) };
}
export function json(file, value) { mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
