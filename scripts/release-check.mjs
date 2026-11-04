import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set([
  '.git',
  '.local',
  'node_modules',
  'artifacts',
  'test-results',
  'playwright-report',
  'coverage',
]);
async function walk(directory, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name === '.DS_Store') continue;
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw Error(`Symlink is not allowed in release: ${relative}`);
    if (entry.isDirectory())
      files.push(...(await walk(path.join(directory, entry.name), relative + '/')));
    else files.push(relative);
  }
  return files;
}
const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
const files =
  tracked.status === 0 && tracked.stdout
    ? tracked.stdout.split('\0').filter(Boolean)
    : await walk(root);
const failures = [];
for (const file of files) {
  if (
    /(^|\/)(\.local|backups|node_modules|\.env|artifacts)(\/|$)|(?:receipt|diagnostic|backup)-\d|\.pdf$|\.app\//i.test(
      file,
    )
  ) {
    failures.push(`${file}: private or unsupported release path`);
    continue;
  }
  const content = await fs.readFile(path.join(root, file));
  if (content.length > 2 * 1024 * 1024) failures.push(`${file}: unexpected large asset`);
  if (file.endsWith('.woff2') && content.subarray(0, 4).toString() !== 'wOF2')
    failures.push(`${file}: invalid WOFF2 header`);
  if (/\.(png|jpg|webp|ico|woff2)$/.test(file)) continue;
  const text = content.toString('utf8');
  for (const [name, pattern] of [
    ['absolute home path', /\/(?:Users|home)\/[A-Za-z0-9_.-]+\//],
    [
      'possible credential',
      /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{30,})\b/,
    ],
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ])
    if (pattern.test(text)) failures.push(`${file}: ${name}`);
}
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (pkg.private !== true)
  failures.push('package.json: private must remain true to prevent accidental npm publication');
if (Object.keys(pkg.dependencies || {}).length)
  failures.push('Runtime packages introduced; review offline contract');
for (const required of [
  'README.md',
  'AGENTS.md',
  'LICENSE',
  'NOTICE',
  'web/fonts/LICENSE.txt',
  'SECURITY.md',
  'llms.txt',
  'schemas/plan.schema.json',
  'skills/bcd325p2-channel-planning/SKILL.md',
])
  if (!files.includes(required)) failures.push('Missing release file ' + required);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    JSON.stringify({
      releaseFiles: files.length,
      privacyScan: 'passed',
      runtimeDependencies: 0,
      packagePrivate: true,
      note: 'This audit does not publish or change repository visibility.',
    }),
  );
