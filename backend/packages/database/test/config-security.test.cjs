const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { createRequire } = require('node:module');
const prismaRequire = createRequire(require.resolve('prisma/config'));
const { loadConfigFromFile } = prismaRequire('@prisma/config');

test('patched Prisma config merger loads migration settings without losing nested options', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'operix-prisma-config-'));
  try {
    writeFileSync(
      join(directory, 'prisma.config.cjs'),
      `module.exports = {
      schema: './prisma/schema.prisma',
      migrations: { path: './prisma/migrations', seed: 'node controlled-seed.cjs' }
    };`,
    );
    const result = await loadConfigFromFile({ configRoot: directory });
    assert.equal(result.error, undefined);
    assert.equal(result.config.schema, resolve(directory, 'prisma/schema.prisma'));
    assert.equal(result.config.migrations.path, resolve(directory, 'prisma/migrations'));
    assert.equal(result.config.migrations.seed, 'node controlled-seed.cjs');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Prisma resolves the patched merger and handles recursive inputs', async () => {
  const prismaRequire = createRequire(require.resolve('prisma/config'));
  const configRequire = createRequire(prismaRequire.resolve('@prisma/config'));
  const { deepmerge } = configRequire('deepmerge-ts');
  const input = { nested: { retained: true } };
  input.self = input;
  const merged = deepmerge(input, { nested: { added: true } });
  assert.equal(merged.nested.retained, true);
  assert.equal(merged.nested.added, true);
  assert.equal(merged.self, merged);
});
