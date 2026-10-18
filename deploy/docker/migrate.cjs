'use strict';
const { spawnSync } = require('node:child_process');
const cli = require.resolve('prisma/build/index.js', { paths: [process.cwd()] });
const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
  stdio: 'inherit', env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
});
process.exit(result.status ?? 1);
