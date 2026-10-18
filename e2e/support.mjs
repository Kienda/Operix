import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const state = () => JSON.parse(readFileSync('e2e/.state.json', 'utf8'));
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) — what an authenticator app would show. */
export function totp(secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/\s|=/g, '').toUpperCase())
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

/** Newest link of the given route from the newest email to `to`. */
export async function emailLink(to, route) {
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages = [] } = await res.json();
    if (messages.length) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json();
      const match = message.Text.match(new RegExp(`(https?://\\S+#/${route}\\?token=[A-Za-z0-9_-]+)`));
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`No ${route} email for ${to}`);
}

/** Fails the test on any console error or failed network request the page makes. */
export function watchPage(page, problems) {
  page.on('console', (msg) => msg.type() === 'error' && problems.push(`console: ${msg.text()}`));
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (req) => problems.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`));
}
