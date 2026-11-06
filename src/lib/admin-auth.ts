import bcrypt from 'bcryptjs';

/**
 * Precomputed cost-10 bcrypt hash used when an admin username does not exist in D1,
 * ensuring login attempts for unknown users still incur full bcrypt verification time.
 */
export const DUMMY_ADMIN_BCRYPT_HASH =
	'$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
export const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60;

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
