// Real-browser pilot verification environment:
//   isolated PostgreSQL schema → real bootstrap CLI → compiled API (SMTP → Mailpit)
//   → production build of the pilot frontend served by `vite preview`.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { startStack } from '../backend/apps/api/test/support/harness.mjs';

const freePort = () =>
  new Promise((done) => {
    const listener = createServer();
    listener.listen(0, '127.0.0.1', () => {
      const port = listener.address().port;
      listener.close(() => done(port));
    });
  });

export default async function globalSetup() {
  const webPort = await freePort();
  const web = `http://127.0.0.1:${webPort}`;
  const stack = await startStack({
    prefix: 'browser_test',
    env: {
      APP_URL: web,
      CORS_ORIGINS: web,
      OPERIX_MODULE_ALLOWLIST: 'core,crm,sales,projects',
      SWAGGER_ENABLED: 'false',
    },
  });
  const run = randomUUID().slice(0, 8);
  const ownerEmail = `owner.${run}@browser.test`;
  stack.cli('dist/cli/bootstrap-pilot.js', ['--owner-email', ownerEmail]);

  const outDir = 'e2e/.dist';
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir'], {
    env: { ...process.env, VITE_API_URL: `${stack.base}/api/v1` },
    stdio: 'pipe',
  });
  const preview = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'preview', '--outDir', outDir, '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'],
    { stdio: 'pipe', windowsHide: true },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(web)).ok) break;
    } catch {}
    await delay(100);
  }
  writeFileSync('e2e/.state.json', JSON.stringify({ web, api: stack.base, ownerEmail, run, schema: stack.schema }));
  return async () => {
    preview.kill();
    await stack.stop();
  };
}
