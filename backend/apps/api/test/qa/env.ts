import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/** backend/ — three levels above apps/api/test/qa. */
export const BACKEND_ROOT = resolve(__dirname, '../../../..');
export const API_ROOT = resolve(__dirname, '../..');
export const REPO_ROOT = resolve(BACKEND_ROOT, '..');
export const RESULTS_DIR = resolve(REPO_ROOT, 'tmp/qa-e2e');

/** Loads backend/.env without overriding variables already set in the shell. */
export function loadBackendEnv(): void {
  const file = resolve(BACKEND_ROOT, '.env');
  if (!existsSync(file)) return;
  const parsed = parseEnv(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

/** Refuses anything that is not plainly a local development database. */
export function assertSafeDatabase(): URL {
  loadBackendEnv();
  if (process.env.NODE_ENV === 'production') throw new Error('QA suite refuses to run with NODE_ENV=production');
  const raw = process.env.QA_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not configured');
  const url = new URL(raw);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error(`QA suite only runs against a local PostgreSQL server (got host ${url.hostname})`);
  }
  return url;
}

export const QA_SCHEMA_PATTERN = /^qa_test_[a-f0-9]{32}$/;
