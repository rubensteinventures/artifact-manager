import bcrypt from 'bcryptjs';
import { timingSafeEqualStrings } from './presentation-password.ts';

/**
 * Precomputed cost-10 bcrypt hash used when an admin username does not exist in D1,
 * ensuring login attempts for unknown users still incur full bcrypt verification time.
 */
export const DUMMY_ADMIN_BCRYPT_HASH =
	'$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
export const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60;
export const ADMIN_USERNAME_REGEX = /^[a-zA-Z0-9._@-]{1,64}$/;
export const ADMIN_PASSWORD_MIN_LENGTH = 8;
export const ADMIN_PASSWORD_MAX_LENGTH = 128;

export type AdminSetupDb = {
	prepare(sql: string): {
		bind(...args: unknown[]): {
			first(): Promise<Record<string, unknown> | null>;
			run(): Promise<{ meta?: { changes?: number } }>;
		};
		first(): Promise<Record<string, unknown> | null>;
	};
};

/**
 * Reads optional `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables.
 * Returns `{ username, password }` only when both are valid (`username` matches `ADMIN_USERNAME_REGEX`
 * and `password` is `8..128` characters).
 */
export function getEnvAdminOverride(
	envVars?: Record<string, unknown>
): { username: string; password: string } | null {
	if (!envVars) return null;
	const rawUser = envVars.ADMIN_USERNAME;
	const rawPass = envVars.ADMIN_PASSWORD;
	if (typeof rawUser !== 'string' || typeof rawPass !== 'string') {
		return null;
	}
	const username = rawUser.trim();
	if (!ADMIN_USERNAME_REGEX.test(username)) {
		return null;
	}
	if (
		rawPass.length < ADMIN_PASSWORD_MIN_LENGTH ||
		rawPass.length > ADMIN_PASSWORD_MAX_LENGTH
	) {
		return null;
	}
	return { username, password: rawPass };
}

/** Validates input for the one-time `/admin/setup` form. */
export function validateAdminSetupInput(
	username: string,
	password: string,
	confirmPassword: string
): { ok: true; username: string } | { ok: false; error: string } {
	const trimmedUsername = typeof username === 'string' ? username.trim() : '';
	if (!trimmedUsername) {
		return { ok: false, error: 'Username is required.' };
	}
	if (!ADMIN_USERNAME_REGEX.test(trimmedUsername)) {
		return {
			ok: false,
			error: 'Username must be 1–64 characters and contain only letters, numbers, ., _, @, or -.',
		};
	}
	if (typeof password !== 'string' || password.length < ADMIN_PASSWORD_MIN_LENGTH) {
		return {
			ok: false,
			error: `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
		};
	}
	if (password.length > ADMIN_PASSWORD_MAX_LENGTH) {
		return {
			ok: false,
			error: `Password must be at most ${ADMIN_PASSWORD_MAX_LENGTH} characters.`,
		};
	}
	if (password !== confirmPassword) {
		return { ok: false, error: 'Passwords do not match.' };
	}
	return { ok: true, username: trimmedUsername };
}

/**
 * Checks whether at least one administrator account is configured—either via
 * valid `ADMIN_USERNAME` + `ADMIN_PASSWORD` environment variables or an existing row in D1 `admins`.
 */
export async function ensureAdminInitialized(
	db: AdminSetupDb,
	envVars?: Record<string, unknown>
): Promise<{ initialized: boolean; hasEnvOverride: boolean }> {
	const envOverride = getEnvAdminOverride(envVars);
	if (envOverride) {
		return { initialized: true, hasEnvOverride: true };
	}
	const row = await db.prepare('SELECT COUNT(*) AS count FROM admins').bind().first();
	const count = Number(row?.count ?? row?.COUNT ?? 0);
	return {
		initialized: Number.isFinite(count) && count > 0,
		hasEnvOverride: false,
	};
}

/**
 * Atomically creates the very first administrator account in D1 when no admin exists
 * and no `ADMIN_USERNAME`/`ADMIN_PASSWORD` env override is active.
 */
export async function createInitialAdmin(
	db: AdminSetupDb,
	input: { username: string; password: string; confirmPassword: string },
	envVars?: Record<string, unknown>
): Promise<
	| { ok: true; username: string }
	| { ok: false; alreadyInitialized: boolean; error: string }
> {
	const status = await ensureAdminInitialized(db, envVars);
	if (status.initialized) {
		return {
			ok: false,
			alreadyInitialized: true,
			error: 'Administrator account has already been configured.',
		};
	}

	const validation = validateAdminSetupInput(
		input.username,
		input.password,
		input.confirmPassword
	);
	if (!validation.ok) {
		return {
			ok: false,
			alreadyInitialized: false,
			error: validation.error,
		};
	}

	const passwordHash = await bcrypt.hash(input.password, 10);
	const result = await db
		.prepare(
			'INSERT INTO admins (username, password_hash) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM admins)'
		)
		.bind(validation.username, passwordHash)
		.run();

	const changes = Number(result?.meta?.changes ?? 0);
	if (!Number.isFinite(changes) || changes < 1) {
		return {
			ok: false,
			alreadyInitialized: true,
			error: 'Administrator account has already been configured.',
		};
	}

	return { ok: true, username: validation.username };
}

/**
 * Authenticates an admin login attempt against optional `ADMIN_USERNAME`/`ADMIN_PASSWORD`
 * environment override/recovery credentials first (upserting the bcrypt hash into D1 on success),
 * falling back to D1 `admins` verification.
 */
export async function authenticateAdminLogin(
	db: AdminSetupDb,
	username: string,
	password: string,
	envVars?: Record<string, unknown>
): Promise<boolean> {
	const trimmedUsername = typeof username === 'string' ? username.trim() : '';
	if (!trimmedUsername || typeof password !== 'string' || password.length === 0) {
		return false;
	}

	const envOverride = getEnvAdminOverride(envVars);
	if (envOverride) {
		const userMatches = await timingSafeEqualStrings(trimmedUsername, envOverride.username);
		if (userMatches) {
			const passMatches = await timingSafeEqualStrings(password, envOverride.password);
			if (passMatches) {
				const newHash = await bcrypt.hash(password, 10);
				await db
					.prepare(
						'INSERT INTO admins (username, password_hash) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash'
					)
					.bind(envOverride.username, newHash)
					.run();
				return true;
			}
			await bcrypt.compare(password, DUMMY_ADMIN_BCRYPT_HASH);
			return false;
		}
	}

	const admin = await db
		.prepare('SELECT username, password_hash FROM admins WHERE username = ?')
		.bind(trimmedUsername)
		.first();

	const hash = admin && (admin.password_hash ?? admin.PASSWORD_HASH);
	const hashStr = typeof hash === 'string' ? hash : null;
	return verifyAdminCredentials(trimmedUsername, password, hashStr);
}

export type RateLimitKV = {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
};

function loginRateLimitKey(clientIp: string): string {
	const normalizedIp = clientIp.trim() || 'unknown';
	return `ratelimit:login:${normalizedIp}`;
}

/** Extracts client IP from Cloudflare or standard proxy headers. */
export function getClientIp(request: Request): string {
	const cfIp = request.headers.get('CF-Connecting-IP');
	if (cfIp && cfIp.trim().length > 0) return cfIp.trim();
	const xff = request.headers.get('X-Forwarded-For');
	if (xff && xff.trim().length > 0) return xff.split(',')[0].trim();
	return 'local';
}

/**
 * Verifies admin credentials asynchronously, always executing a cost-10 bcrypt compare
 * when a password is supplied to prevent username-enumeration timing side-channels.
 */
export async function verifyAdminCredentials(
	username: string,
	password: string,
	storedHash: string | null | undefined
): Promise<boolean> {
	const hasUsername = typeof username === 'string' && username.trim().length > 0;
	const hasPassword = typeof password === 'string' && password.length > 0;
	if (!hasUsername || !hasPassword) {
		return false;
	}
	const hasValidStoredHash =
		typeof storedHash === 'string' && storedHash.startsWith('$2') && storedHash.length >= 59;
	const targetHash = hasValidStoredHash ? storedHash : DUMMY_ADMIN_BCRYPT_HASH;
	const matches = await bcrypt.compare(password, targetHash);
	return hasValidStoredHash && matches;
}

/** Returns true if the client IP has reached LOGIN_MAX_FAILED_ATTEMPTS within the window. */
export async function checkLoginRateLimit(
	kv: RateLimitKV | undefined,
	clientIp: string
): Promise<boolean> {
	if (!kv) return false;
	try {
		const raw = await kv.get(loginRateLimitKey(clientIp));
		if (!raw) return false;
		const count = parseInt(raw, 10);
		return Number.isFinite(count) && count >= LOGIN_MAX_FAILED_ATTEMPTS;
	} catch {
		return false;
	}
}

/** Increments the failed login counter in KV with a 60s TTL. */
export async function recordFailedLoginAttempt(
	kv: RateLimitKV | undefined,
	clientIp: string
): Promise<void> {
	if (!kv) return;
	try {
		const key = loginRateLimitKey(clientIp);
		const raw = await kv.get(key);
		const current = raw ? parseInt(raw, 10) : 0;
		const next = (Number.isFinite(current) && current > 0 ? current : 0) + 1;
		await kv.put(key, String(next), { expirationTtl: LOGIN_RATE_LIMIT_WINDOW_SECONDS });
	} catch {
		// Ignore KV write throttling errors so login failure handling remains resilient
	}
}

/** Clears the failed login counter in KV after a successful login. */
export async function clearLoginRateLimit(
	kv: RateLimitKV | undefined,
	clientIp: string
): Promise<void> {
	if (!kv) return;
	try {
		await kv.delete(loginRateLimitKey(clientIp));
	} catch {
		// Ignore KV errors
	}
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * Returns true if a state-changing request carries a browser `Sec-Fetch-Site` header
 * indicating a cross-site or cross-subdomain (`same-site`) request.
 * Bearer-authenticated `/admin/api/v1/skill/*` endpoints are exempt because they do not use cookies.
 */
export function isBlockedCrossSiteMutation(
	method: string,
	pathname: string,
	secFetchSite: string | null
): boolean {
	if (!MUTATION_METHODS.has(method.toUpperCase())) return false;
	if (pathname.startsWith('/admin/api/v1/skill/')) return false;
	if (!secFetchSite) return false;
	const normalized = secFetchSite.trim().toLowerCase();
	if (!normalized) return false;
	return normalized !== 'same-origin' && normalized !== 'none';
}

export function applyAdminSecurityHeaders(response: Response): Response {
	const headers = new Headers(response.headers);
	if (!headers.has('X-Content-Type-Options')) {
		headers.set('X-Content-Type-Options', 'nosniff');
	}
	if (!headers.has('X-Frame-Options')) {
		headers.set('X-Frame-Options', 'DENY');
	}
	if (!headers.has('Referrer-Policy')) {
		headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
