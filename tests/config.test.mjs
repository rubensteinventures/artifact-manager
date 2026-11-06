import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('wrangler.jsonc configures DB, BUCKET, SESSION, and branding vars with safe placeholders', () => {
	const raw = fs.readFileSync(path.join(rootDir, 'wrangler.jsonc'), 'utf8');
	assert.match(raw, /"binding":\s*"DB"/);
	assert.match(raw, /"binding":\s*"BUCKET"/);
	assert.match(raw, /"binding":\s*"SESSION"/);
	assert.match(raw, /"workers_dev":\s*true/);
	assert.match(raw, /"APP_NAME"/);
	assert.doesNotMatch(raw, /YOUR_PREVIEW_KV_NAMESPACE_ID/);
	assert.doesNotMatch(raw, /SESSION_SECRET/);
	assert.doesNotMatch(raw, /single-page-application/);
	assert.doesNotMatch(raw, /911d2b94-2e1e-420b/);
	assert.doesNotMatch(raw, /2ef80afa62094235/);
	assert.doesNotMatch(raw, /innovaitionpartners/i);
});

test('D1 migrations define admins and presentations tables with uploaded_at', () => {
	const m1 = fs.readFileSync(path.join(rootDir, 'migrations/0001_init.sql'), 'utf8');
	const m2 = fs.readFileSync(path.join(rootDir, 'migrations/0002_add_uploaded_at.sql'), 'utf8');
	assert.match(m1, /CREATE TABLE IF NOT EXISTS admins/);
	assert.match(m1, /CREATE TABLE IF NOT EXISTS presentations/);
	assert.match(m2, /ALTER TABLE presentations ADD COLUMN uploaded_at TEXT/);
});

test('package.json configures Deploy to Cloudflare scripts (using DB binding) and binding descriptions', () => {
	const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
	assert.equal(pkg.scripts['db:migrate:remote'], 'wrangler d1 migrations apply DB --remote');
	assert.equal(
		pkg.scripts['deploy'],
		'npm run build && npm run db:migrate:remote && wrangler deploy'
	);
	assert.ok(pkg.cloudflare?.bindings?.DB?.description);
	assert.ok(pkg.cloudflare?.bindings?.BUCKET?.description);
	assert.ok(pkg.cloudflare?.bindings?.SESSION?.description);
});

test('repository includes MIT LICENSE, SECURITY.md disclosure policy, and package.json license field', () => {
	const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
	assert.equal(pkg.license, 'MIT');

	const license = fs.readFileSync(path.join(rootDir, 'LICENSE'), 'utf8');
	assert.match(license, /^MIT License/m);
	assert.match(license, /Permission is hereby granted, free of charge/);

	const securityMd = fs.readFileSync(path.join(rootDir, 'SECURITY.md'), 'utf8');
	assert.match(securityMd, /Security Policy/i);
});
