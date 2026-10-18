import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import type { GlobalSetupContext } from 'vitest/node';
import { PrismaClient } from '@operix/database';
import { API_ROOT, BACKEND_ROOT, QA_SCHEMA_PATTERN, assertSafeDatabase } from './env';

async function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const listener = createServer();
    listener.once('error', fail);
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address() as { port: number };
      listener.close(() => done(port));
    });
  });
}

async function waitForHealth(url: string, child: ChildProcess, output: () => string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`QA API exited early (${child.exitCode}):\n${output()}`);
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2_000) });
      const body = (await response.json()) as { database?: string };
      if (response.ok && body.database === 'connected') return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`QA API did not become healthy:\n${output()}`);
}

/**
 * 1. create a uniquely named schema on the local server
 * 2. apply the repository's migrations to it (`prisma migrate deploy`)
 * 3. start the compiled API (built into .tmp-build/ by `pnpm test:qa`)
 * 4. teardown: stop the API and drop only that schema
 */
export default async function setup({ provide }: GlobalSetupContext) {
  const base = assertSafeDatabase();
  const entry = resolve(API_ROOT, '.tmp-build/main.js');
  if (!existsSync(entry)) throw new Error('Compiled API not found; run `pnpm --filter @operix/api test:qa`');

  const schema = `qa_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(base.toString());
  url.searchParams.set('schema', schema);
  const admin = new PrismaClient({ datasourceUrl: base.toString() });
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);

  let child: ChildProcess | undefined;
  const teardown = async () => {
    if (child && child.exitCode === null) {
      const stopped = new Promise((r) => child!.once('exit', r));
      child.kill();
      await stopped;
    }
    if (!process.env.QA_KEEP_SCHEMA) {
      if (!QA_SCHEMA_PATTERN.test(schema)) throw new Error('Refusing to drop an unexpected schema');
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await admin.$disconnect();
  };

  try {
    const requireDb = createRequire(resolve(BACKEND_ROOT, 'packages/database/package.json'));
    execFileSync(process.execPath, [requireDb.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: resolve(BACKEND_ROOT, 'packages/database'),
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: 'pipe',
    });

    const port = await freePort();
    let log = '';
    child = spawn(process.execPath, [entry], {
      cwd: API_ROOT,
      env: { ...process.env, DATABASE_URL: url.toString(), PORT: String(port), NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk) => { log = (log + chunk).slice(-8_000); });
    child.stderr?.on('data', (chunk) => { log = (log + chunk).slice(-8_000); });
    const apiUrl = `http://127.0.0.1:${port}/api/v1`;
    await waitForHealth(apiUrl, child, () => log);

    provide('apiUrl', apiUrl);
    provide('databaseUrl', url.toString());
    provide('schema', schema);
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}

declare module 'vitest' {
  export interface ProvidedContext {
    apiUrl: string;
    databaseUrl: string;
    schema: string;
  }
}
