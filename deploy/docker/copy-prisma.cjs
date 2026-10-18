'use strict';
const { createRequire } = require('node:module');
const { dirname, resolve } = require('node:path');
const { cpSync, existsSync, realpathSync } = require('node:fs');
const sourceRequire = createRequire('/build/backend/packages/database/package.json');
const source = resolve(dirname(sourceRequire.resolve('@prisma/client/package.json')), '../../.prisma/client');
if (!existsSync(source)) throw new Error('Linux Prisma client was not generated');
for (const app of ['api', 'worker']) {
  const deployedRequire = createRequire(realpathSync(`/out/${app}/node_modules/@operix/database/package.json`));
  const client = dirname(deployedRequire.resolve('@prisma/client/package.json'));
  cpSync(source, resolve(client, '../../.prisma/client'), { recursive: true });
  // Fail the image build if the deployed package cannot resolve the generated client.
  const { PrismaClient } = deployedRequire('@prisma/client');
  if (typeof PrismaClient !== 'function') throw new Error('Prisma client packaging failed');
}
