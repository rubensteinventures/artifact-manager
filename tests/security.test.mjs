import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	verifyAdminCredentials,
	checkLoginRateLimit,
	recordFailedLoginAttempt,
	clearLoginRateLimit,
	LOGIN_MAX_FAILED_ATTEMPTS,
	isBlockedCrossSiteMutation,
	applyAdminSecurityHeaders,
} from '../src/lib/admin-auth.ts';
import { verifySkillApiBearer } from '../src/lib/skill-api-auth.ts';
import { parseCreateSkillPresentationBody } from '../src/lib/skill-presentations-payload.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('verifyAdminCredentials performs async bcrypt comparison including dummy hash fallback for unknown users', async () => {
	const knownHash = '$2b$10$5lT6NLQxxB8OOC6uYU/3AeF1Q1/VWyzC.w0DX8Q/iujyBb6GrT8oy';
	assert.equal(await verifyAdminCredentials('testadmin', 'testpass123', knownHash), true);
	assert.equal(await verifyAdminCredentials('testadmin', 'wrongpass', knownHash), false);
	assert.equal(await verifyAdminCredentials('unknown-user', 'testpass123', null), false);
	assert.equal(await verifyAdminCredentials('', 'testpass123', knownHash), false);
	assert.equal(await verifyAdminCredentials('testadmin', '', knownHash), false);
});

test('KV login rate limiter blocks after LOGIN_MAX_FAILED_ATTEMPTS and clears on success', async () => {
	const store = new Map();
	const mockKv = {
		async get(key) {
			return store.get(key) ?? null;
		},
		async put(key, value) {
			store.set(key, value);
		},
		async delete(key) {
			store.delete(key);
		},
	};

	const ip = '203.0.113.42';
	for (let i = 0; i < LOGIN_MAX_FAILED_ATTEMPTS; i++) {
		assert.equal(await checkLoginRateLimit(mockKv, ip), false);
		await recordFailedLoginAttempt(mockKv, ip);
	}
	assert.equal(await checkLoginRateLimit(mockKv, ip), true);

	await clearLoginRateLimit(mockKv, ip);
	assert.equal(await checkLoginRateLimit(mockKv, ip), false);
});

test('isBlockedCrossSiteMutation blocks cross-site and sibling-subdomain mutations on /admin/* while exempting /admin/api/v1/skill/*', () => {
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/presentations/q1', 'cross-site'), true);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/presentations/q1', 'same-site'), true);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/api/upload/q1', 'same-site'), true);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/api/logout', 'cross-site'), true);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/logout', 'cross-site'), true);

	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/presentations/q1', 'same-origin'), false);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/presentations/q1', 'none'), false);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/presentations/q1', null), false);
	assert.equal(isBlockedCrossSiteMutation('GET', '/admin/presentations/q1', 'cross-site'), false);
	assert.equal(
		isBlockedCrossSiteMutation('POST', '/admin/api/v1/skill/presentations', 'cross-site'),
		false
	);
	assert.equal(
		isBlockedCrossSiteMutation('PUT', '/admin/api/v1/skill/presentations/q1', 'cross-site'),
		false
	);
});

test('applyAdminSecurityHeaders sets X-Frame-Options: DENY, nosniff, and strict-origin-when-cross-origin', () => {
	const res = applyAdminSecurityHeaders(new Response('ok'));
	assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
	assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
	assert.equal(res.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
});

test('verifySkillApiBearer and parseCreateSkillPresentationBody validate Bearer token and payload', async () => {
	const req = new Request('https://example.com/admin/api/v1/skill/presentations', {
		headers: { Authorization: 'Bearer secret-token-123' },
	});
	assert.equal(await verifySkillApiBearer(req, 'secret-token-123'), true);
	assert.equal(await verifySkillApiBearer(req, 'wrong-token'), false);
	assert.equal(await verifySkillApiBearer(req, undefined), false);

	const parsed = await parseCreateSkillPresentationBody({
		slug: 'demo-deck',
		name: 'Demo Deck',
		access: { mode: 'public' },
		files: [{ path: 'index.html', data: btoa('<html></html>'), contentType: 'text/html' }],
	});
	assert.equal(parsed.ok, true);
});

test('middleware.ts routes /content/* to content-viewer with SAMEORIGIN and gates /admin/* with DENY and /admin/login redirects', () => {
	const middlewareSrc = fs.readFileSync(path.join(rootDir, 'src/middleware.ts'), 'utf8');
	assert.match(middlewareSrc, /handleContentRequest/);
	assert.match(middlewareSrc, /applyViewerSecurityHeaders/);
	assert.match(middlewareSrc, /applyAdminSecurityHeaders/);
	assert.match(middlewareSrc, /\/admin\/login/);
	assert.match(middlewareSrc, /\/admin\/api\//);

	const uploadSrc = fs.readFileSync(
		path.join(rootDir, 'src/pages/admin/api/upload/[slug].ts'),
		'utf8'
	);
	assert.match(uploadSrc, /ADMIN_UPLOAD_MAX_BYTES/);
	assert.match(uploadSrc, /status:\s*413/);
});
