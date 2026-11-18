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
	validateAdminSetupInput,
	ensureAdminInitialized,
	createInitialAdmin,
	authenticateAdminLogin,
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
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/setup', 'cross-site'), true);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/setup', 'same-site'), true);

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
	assert.match(middlewareSrc, /ensureAdminInitialized/);
	assert.match(middlewareSrc, /\/admin\/setup/);
	assert.match(middlewareSrc, /\/admin\/login/);
	assert.match(middlewareSrc, /\/admin\/api\//);

	const uploadSrc = fs.readFileSync(
		path.join(rootDir, 'src/pages/admin/api/upload/[slug].ts'),
		'utf8'
	);
	assert.match(uploadSrc, /ADMIN_UPLOAD_MAX_BYTES/);
	assert.match(uploadSrc, /status:\s*413/);
});

function createInMemoryAdminsDb(initialAdmins = []) {
	const admins = new Map();
	for (const row of initialAdmins) {
		admins.set(row.username, row.password_hash);
	}
	return {
		admins,
		prepare(sql) {
			const normalized = sql.replace(/\s+/g, ' ').trim();
			let boundArgs = [];
			const stmt = {
				bind(...args) {
					boundArgs = args;
					return stmt;
				},
				async first() {
					if (/^SELECT COUNT\(\*\) AS count FROM admins$/i.test(normalized)) {
						return { count: admins.size };
					}
					if (/^SELECT username, password_hash FROM admins WHERE username = \?$/i.test(normalized)) {
						const [username] = boundArgs;
						if (!admins.has(username)) return null;
						return { username, password_hash: admins.get(username) };
					}
					throw new Error(`Unsupported first() query: ${normalized}`);
				},
				async run() {
					if (
						/^INSERT INTO admins \(username, password_hash\) SELECT \?, \? WHERE NOT EXISTS \(SELECT 1 FROM admins\)$/i.test(
							normalized
						)
					) {
						const [username, hash] = boundArgs;
						if (admins.size > 0) {
							return { meta: { changes: 0 } };
						}
						admins.set(username, hash);
						return { meta: { changes: 1 } };
					}
					if (
						/^INSERT INTO admins \(username, password_hash\) VALUES \(\?, \?\) ON CONFLICT\(username\) DO UPDATE SET password_hash = excluded\.password_hash$/i.test(
							normalized
						)
					) {
						const [username, hash] = boundArgs;
						admins.set(username, hash);
						return { meta: { changes: 1 } };
					}
					throw new Error(`Unsupported run() query: ${normalized}`);
				},
			};
			return stmt;
		},
	};
}

test('validateAdminSetupInput validates username format, password length 8..128, and confirmation match', () => {
	assert.equal(validateAdminSetupInput('', 'StrongPass123!', 'StrongPass123!').ok, false);
	assert.equal(validateAdminSetupInput('admin user!', 'StrongPass123!', 'StrongPass123!').ok, false);
	assert.equal(validateAdminSetupInput('admin', 'short7!', 'short7!').ok, false);
	assert.equal(validateAdminSetupInput('admin', 'a'.repeat(129), 'a'.repeat(129)).ok, false);
	assert.equal(validateAdminSetupInput('admin', 'StrongPass123!', 'Mismatch123!').ok, false);

	const valid = validateAdminSetupInput('  admin_1@example.com  ', 'StrongPass123!', 'StrongPass123!');
	assert.equal(valid.ok, true);
	if (valid.ok) {
		assert.equal(valid.username, 'admin_1@example.com');
	}
});

test('ensureAdminInitialized detects empty D1 vs populated D1 vs valid ADMIN_USERNAME/ADMIN_PASSWORD env override', async () => {
	const emptyDb = createInMemoryAdminsDb();
	assert.deepEqual(await ensureAdminInitialized(emptyDb, {}), {
		initialized: false,
		hasEnvOverride: false,
	});

	// Short or whitespace env vars are ignored
	assert.deepEqual(
		await ensureAdminInitialized(emptyDb, {
			ADMIN_USERNAME: '   ',
			ADMIN_PASSWORD: 'StrongPass123!',
		}),
		{ initialized: false, hasEnvOverride: false }
	);
	assert.deepEqual(
		await ensureAdminInitialized(emptyDb, {
			ADMIN_USERNAME: 'admin',
			ADMIN_PASSWORD: 'short',
		}),
		{ initialized: false, hasEnvOverride: false }
	);

	// Valid env override marks admin as initialized even when D1 is empty
	assert.deepEqual(
		await ensureAdminInitialized(emptyDb, {
			ADMIN_USERNAME: 'admin',
			ADMIN_PASSWORD: 'StrongPass123!',
		}),
		{ initialized: true, hasEnvOverride: true }
	);

	// Populated D1 marks admin as initialized without env override
	const seededDb = createInMemoryAdminsDb([
		{ username: 'existing', password_hash: '$2b$10$5lT6NLQxxB8OOC6uYU/3AeF1Q1/VWyzC.w0DX8Q/iujyBb6GrT8oy' },
	]);
	assert.deepEqual(await ensureAdminInitialized(seededDb, {}), {
		initialized: true,
		hasEnvOverride: false,
	});
});

test('createInitialAdmin atomically creates the first admin only when uninitialized and blocks subsequent attempts', async () => {
	const db = createInMemoryAdminsDb();

	// Blocked if env override is active
	const blockedByEnv = await createInitialAdmin(
		db,
		{ username: 'webadmin', password: 'StrongPass123!', confirmPassword: 'StrongPass123!' },
		{ ADMIN_USERNAME: 'envadmin', ADMIN_PASSWORD: 'EnvStrongPassword123!' }
	);
	assert.equal(blockedByEnv.ok, false);
	if (!blockedByEnv.ok) {
		assert.equal(blockedByEnv.alreadyInitialized, true);
	}
	assert.equal(db.admins.size, 0);

	// First-run setup succeeds when D1 is empty and no env override is active
	const created = await createInitialAdmin(
		db,
		{ username: '  firstadmin  ', password: 'FirstAdminPass123!', confirmPassword: 'FirstAdminPass123!' },
		{}
	);
	assert.deepEqual(created, { ok: true, username: 'firstadmin' });
	assert.equal(db.admins.size, 1);
	assert.equal(await authenticateAdminLogin(db, 'firstadmin', 'FirstAdminPass123!', {}), true);

	// Subsequent setup attempt is permanently locked
	const secondAttempt = await createInitialAdmin(
		db,
		{ username: 'secondadmin', password: 'SecondAdminPass123!', confirmPassword: 'SecondAdminPass123!' },
		{}
	);
	assert.equal(secondAttempt.ok, false);
	if (!secondAttempt.ok) {
		assert.equal(secondAttempt.alreadyInitialized, true);
	}
	assert.equal(db.admins.size, 1);
});

test('authenticateAdminLogin allows ADMIN_USERNAME and ADMIN_PASSWORD env override to recover/reset an existing D1 admin password and persist to D1', async () => {
	const oldHash = '$2b$10$5lT6NLQxxB8OOC6uYU/3AeF1Q1/VWyzC.w0DX8Q/iujyBb6GrT8oy'; // 'testpass123'
	const db = createInMemoryAdminsDb([{ username: 'testadmin', password_hash: oldHash }]);

	// Before override: old password works, new password fails
	assert.equal(await authenticateAdminLogin(db, 'testadmin', 'testpass123', {}), true);
	assert.equal(await authenticateAdminLogin(db, 'testadmin', 'RecoveredPass999!', {}), false);

	// With recovery env vars set: wrong password fails, recovery password succeeds and upserts D1
	const recoveryEnv = {
		ADMIN_USERNAME: 'testadmin',
		ADMIN_PASSWORD: 'RecoveredPass999!',
	};
	assert.equal(await authenticateAdminLogin(db, 'testadmin', 'wrongpass', recoveryEnv), false);
	assert.equal(await authenticateAdminLogin(db, 'testadmin', 'RecoveredPass999!', recoveryEnv), true);

	// After removing recovery env vars: the recovered password remains persisted in D1 and old password no longer works
	assert.equal(await authenticateAdminLogin(db, 'testadmin', 'RecoveredPass999!', {}), true);
	assert.equal(await authenticateAdminLogin(db, 'testadmin', 'testpass123', {}), false);

	// Also supports recovering with a brand-new username if the original username was forgotten
	const newUsernameEnv = {
		ADMIN_USERNAME: 'recovered_owner',
		ADMIN_PASSWORD: 'OwnerNewPass888!',
	};
	assert.equal(
		await authenticateAdminLogin(db, 'recovered_owner', 'OwnerNewPass888!', newUsernameEnv),
		true
	);
	assert.equal(await authenticateAdminLogin(db, 'recovered_owner', 'OwnerNewPass888!', {}), true);
});

test('CLI scripts enforce shell=false process execution, path-traversal sandboxing, O_NOFOLLOW symlink checks, and skill license', () => {
	const backfillSrc = fs.readFileSync(
		path.join(rootDir, 'scripts/backfill-presentation-dates.js'),
		'utf8'
	);
	assert.doesNotMatch(backfillSrc, /\bexecSync\b/);
	assert.match(backfillSrc, /\bexecFileSync\b/);
	assert.match(backfillSrc, /shell:\s*false/);

	const skillScriptSrc = fs.readFileSync(
		path.join(rootDir, 'skills/presentations-manager/scripts/update_presentation.js'),
		'utf8'
	);
	assert.match(skillScriptSrc, /O_NOFOLLOW/);
	assert.match(skillScriptSrc, /fstatSync/);
	assert.match(skillScriptSrc, /Path traversal blocked/);

	const skillMd = fs.readFileSync(
		path.join(rootDir, 'skills/presentations-manager/SKILL.md'),
		'utf8'
	);
	assert.match(skillMd, /^license:\s*MIT$/m);
});

