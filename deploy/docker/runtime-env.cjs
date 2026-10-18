'use strict';
const fs = require('node:fs');
const file = process.env.OPERIX_SECRET_FILE;
if (!file) throw new Error('OPERIX_SECRET_FILE is required');
const secret = JSON.parse(fs.readFileSync(file, 'utf8'));
const permitted = new Set(['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'SMTP_USER', 'SMTP_PASSWORD']);
for (const [key, value] of Object.entries(secret)) {
  if (!permitted.has(key) || typeof value !== 'string' || !value)
    throw new Error('Invalid runtime secret configuration');
  process.env[key] = value;
}
if (process.env.SEED_DEMO_DATA !== 'false' || process.env.NODE_ENV !== 'production')
  throw new Error('Deployment requires production mode and disabled demo data');
