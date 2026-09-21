#!/usr/bin/env node
// Refuses commits that contain anything resembling a secret (PLAN §20.1).
// Usage: node scripts/check-secrets.mjs --staged | --all
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const PATTERNS = [
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Stripe live key', /\bsk_live_[A-Za-z0-9]{16,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  [
    'filled secret env var',
    /^(?:VAPID_PRIVATE_KEY|JWT_[A-Z_]*SECRET|FIELD_ENCRYPTION_KEY|SMTP_PASSWORD|SENTRY_DSN)=\S{8,}/m,
  ],
];

const BLOCKED_FILES = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example$)[^/]+$/,
  /\.p8$/,
  /\.pem$/,
  /(^|\/)google-services\.json$/,
];

const mode = process.argv[2] ?? '--staged';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const files = (
  mode === '--all'
    ? git('ls-files', '--cached', '--others', '--exclude-standard')
    : git('diff', '--cached', '--name-only', '--diff-filter=ACM')
)
  .split('\n')
  .filter(Boolean);

const problems = [];
for (const file of files) {
  if (BLOCKED_FILES.some((re) => re.test(file))) {
    problems.push(`${file}: this file type must never be committed`);
    continue;
  }
  if (!existsSync(file) || /\.(png|jpe?g|webp|gif|ico|woff2?|mp3|wav|pdf)$/i.test(file)) continue;
  const text = mode === '--all' ? readFileSync(file, 'utf8') : git('show', `:${file}`);
  for (const [label, re] of PATTERNS) {
    if (re.test(text)) problems.push(`${file}: looks like a ${label}`);
  }
}

if (problems.length) {
  console.error('✖ Possible secrets found — commit refused:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`✓ secret scan clean (${files.length} files)`);
