// Real Nest HTTP server + PostgreSQL in an isolated, UUID-named schema, with
// real SMTP delivery into a local Mailpit. Nothing outside that schema is read
// or written, and the schema is dropped afterwards.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@operix/database';

// backend/ — resolved from this file so the harness also works from the repo root (browser tests).
export const root = fileURLToPath(new URL('../../../../', import.meta.url));
const fileEnv = existsSync(resolve(root, '.env'))
  ? parseEnv(readFileSync(resolve(root, '.env'), 'utf8'))
  : {};
const databaseUrl = process.env.TEST_DATABASE_URL ?? fileEnv.DATABASE_URL;
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';
const SMTP_HOST = process.env.TEST_SMTP_HOST ?? '127.0.0.1';
const SMTP_PORT = process.env.TEST_SMTP_PORT ?? '1025';

export async function startStack({ env = {}, prefix = 'pilot_test' } = {}) {
  const url = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname))
    throw Error('Integration tests require a local PostgreSQL server');
  const schema = `${prefix}_${randomUUID().replaceAll('-', '')}`;
  url.searchParams.set('schema', schema);
  const admin = new PrismaClient({ datasourceUrl: databaseUrl });
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const requireDb = createRequire(resolve(root, 'packages/database/package.json'));
  execFileSync(process.execPath, [requireDb.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: resolve(root, 'packages/database'),
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  const port = await new Promise((done) => {
    const listener = createServer();
    listener.listen(0, '127.0.0.1', () => {
      const p = listener.address().port;
      listener.close(() => done(p));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const apiEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: url.toString(),
    JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
    PORT: String(port),
    APP_URL: 'http://localhost:5173',
    MAIL_DRIVER: 'smtp',
    SMTP_HOST,
    SMTP_PORT,
    MAIL_FROM: 'Operix Test <no-reply@operix.test>',
    INVITE_LINK_IN_RESPONSE: 'false',
    REQUEST_LOGGING: 'false',
    ...env,
  };
  let output = '';
  const server = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve(root, 'apps/api'),
    windowsHide: true,
    env: apiEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (c) => (output += c));
  server.stderr.on('data', (c) => (output += c));
  let healthy = false;
  for (let i = 0; i < 300 && !healthy && server.exitCode === null; i++) {
    try {
      healthy = (await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {}
    if (!healthy) await delay(100);
  }
  if (!healthy) throw Error(`Test API did not start: ${output.replaceAll(url.toString(), '[db]')}`);

  /** Runs a compiled CLI with the same environment as the API. */
  const cli = (script, args) =>
    execFileSync(process.execPath, [script, ...args], {
      cwd: resolve(root, 'apps/api'),
      env: apiEnv,
      encoding: 'utf8',
      stdio: 'pipe',
    });

  async function stop() {
    server.kill();
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
  return { db, base, cli, stop, output: () => output };
}

export function client(base) {
  return async function call(method, path, principal, body, organizationId) {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(principal
          ? {
              Authorization: `Bearer ${principal.accessToken}`,
              'x-organization-id': organizationId ?? principal.organization.id,
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed, headers: res.headers };
  };
}

/** Waits for the newest message to `email` in Mailpit and returns its text body. */
export async function mailTo(email, { subject, after } = {}) {
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages = [] } = await res.json();
    const match = messages.find(
      (m) =>
        (!subject || m.Subject.includes(subject)) &&
        (!after || new Date(m.Created).getTime() >= after),
    );
    if (match) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json();
      return { subject: full.Subject, text: full.Text, html: full.HTML };
    }
    await delay(100);
  }
  throw Error(`No email to ${email}${subject ? ` with subject "${subject}"` : ''}`);
}
export async function mailCount(email) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const data = await res.json();
  return data.messages?.length ?? 0;
}
export const tokenFrom = (text, route) => {
  const match = text.match(new RegExp(`#/${route}\\?token=([A-Za-z0-9_-]+)`));
  if (!match) throw Error(`No ${route} link in email`);
  return match[1];
};
