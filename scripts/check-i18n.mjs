// CI check: every catalog has the same keys, and every literal t('key') used by
// the pilot UI exists in the English catalog.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../src/pilot/locales/en.js';
import { fr } from '../src/pilot/locales/fr.js';

const problems = [];
for (const [name, a, b] of [['fr', en, fr], ['en', fr, en]])
  for (const key of Object.keys(a)) if (!(key in b)) problems.push(`${name} is missing ${key}`);

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : /\.(jsx?|mjs)$/.test(entry) ? [path] : [];
  });
for (const file of walk('src/pilot').filter((f) => !f.endsWith('i18n.js'))) {
  for (const [, key] of readFileSync(file, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g))
    if (!(key in en)) problems.push(`${file}: unknown key ${key}`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`i18n OK: ${Object.keys(en).length} keys in en and fr`);
