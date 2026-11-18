#!/usr/bin/env node
/**
 * Creates .env from .env.example with freshly generated random secrets.
 *   node scripts/generate-env.js            -> writes .env (refuses to overwrite)
 *   node scripts/generate-env.js --force    -> overwrite
 *   node scripts/generate-env.js --production -> NODE_ENV=production, COOKIE_SECURE=true
 * Run it separately for every environment so local and production never share secrets.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const target = path.join(root, '.env');
const args = process.argv.slice(2);

if (fs.existsSync(target) && !args.includes('--force')) {
  console.error('.env already exists. Re-run with --force to overwrite it.');
  process.exit(1);
}

const hex = (n) => crypto.randomBytes(n).toString('hex');
const adminPassword = `${hex(6)}Aa1!`;
const values = {
  JWT_ACCESS_SECRET: hex(48),
  JWT_REFRESH_SECRET: hex(48),
  MONGO_ROOT_PASSWORD: hex(24),
  SEED_SUPER_ADMIN_PASSWORD: adminPassword,
  BREVO_WEBHOOK_SECRET: hex(24),
};
if (args.includes('--production')) Object.assign(values, { NODE_ENV: 'production', COOKIE_SECURE: 'true' });

let out = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
for (const [k, v] of Object.entries(values)) out = out.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`);
fs.writeFileSync(target, out, { mode: 0o600 });

console.log('Created .env with new random secrets.');
console.log(`Initial super admin password (also stored in .env): ${adminPassword}`);
console.log('Next: set SEED_SUPER_ADMIN_EMAIL and your Brevo / Backblaze / Groq values, then run: docker compose up -d --build');
