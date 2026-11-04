import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { schema, compilePlan } from '../src/plan.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = JSON.stringify(schema, null, 2) + '\n',
  schemaFile = path.join(root, 'schemas/plan.schema.json');
if (process.argv.includes('--write-schema')) await fs.writeFile(schemaFile, expected);
if ((await fs.readFile(schemaFile, 'utf8')) !== expected)
  throw Error('Generated schema is stale; run node scripts/check.mjs --write-schema');
let checked = 0;
for (const folder of ['src', 'web', 'tests', 'scripts'])
  for (const file of await fs.readdir(path.join(root, folder))) {
    if (!file.endsWith('.mjs')) continue;
    const r = spawnSync(process.execPath, ['--check', path.join(root, folder, file)], {
      encoding: 'utf8',
    });
    if (r.status !== 0) throw Error(`${folder}/${file}: ${r.stderr}`);
    checked++;
  }
for (const file of await fs.readdir(path.join(root, 'examples')))
  if (file.endsWith('.json'))
    await compilePlan(JSON.parse(await fs.readFile(path.join(root, 'examples', file), 'utf8')));
const documents = [
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  ...(await fs.readdir(path.join(root, 'docs')))
    .filter((f) => f.endsWith('.md'))
    .map((f) => 'docs/' + f),
];
for (const file of documents) {
  const body = await fs.readFile(path.join(root, file), 'utf8');
  for (const [, link] of body.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(https?:|#)/.test(link)) continue;
    await fs.access(path.resolve(root, path.dirname(file), link.split('#')[0])).catch(() => {
      throw Error(`Broken local link ${file}: ${link}`);
    });
  }
}
console.log(
  JSON.stringify({
    syntaxFiles: checked,
    schema: 'current',
    examples: 'valid',
    documentationLinks: 'valid',
  }),
);
