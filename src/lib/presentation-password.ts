/**
 * PBKDF2 password format and Basic Auth helpers for `presentations.password`.
 * Stored shape: `${iterations}.${saltBase64}.${hashBase64}` (100k iterations, SHA-256, 256-bit derived key).
 */

const PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 1_000_000;

/** Minimum length for new visitor passwords set in the admin UI. */
export const VISITOR_PASSWORD_MIN_LENGTH = 12;

/** Maximum accepted visitor password length during Basic Auth verification. */
export const MAX_PASSWORD_LENGTH = 256;

/** Three lowercase letter segments (generated corporate words), each at least 4 characters. */
const CORPORATE_PASSPHRASE_RE = /^[a-z]{4,}-[a-z]{4,}-[a-z]{4,}$/;

/** Minimum length for the hyphenated corporate passphrase form (three words + two hyphens). */
const CORPORATE_PASSPHRASE_MIN_LENGTH = 14;

export function isCorporatePassphraseVisitorPassword(password: string): boolean {
	return password.length >= CORPORATE_PASSPHRASE_MIN_LENGTH && CORPORATE_PASSPHRASE_RE.test(password);
}

/** Short description for labels and placeholders. */
export const VISITOR_PASSWORD_REQUIREMENTS_SUMMARY =
	'At least 12 characters with uppercase, lowercase, a number, and a symbol — or a generated passphrase of three hyphen-separated lowercase words.';

/**
 * Returns an error message if `password` does not meet visitor-password policy, or `null` if valid.
 */
export function getVisitorPasswordValidationError(password: string): string | null {
	if (isCorporatePassphraseVisitorPassword(password)) {
		return null;
	}
	if (password.length < VISITOR_PASSWORD_MIN_LENGTH) {
		return `Password must be at least ${VISITOR_PASSWORD_MIN_LENGTH} characters long.`;
	}
	if (!/[a-z]/.test(password)) {
		return 'Password must include at least one lowercase letter.';
	}
	if (!/[A-Z]/.test(password)) {
		return 'Password must include at least one uppercase letter.';
	}
	if (!/[0-9]/.test(password)) {
		return 'Password must include at least one number.';
	}
	if (!/[^A-Za-z0-9]/.test(password)) {
		return 'Password must include at least one symbol (for example !, @, #, or %).';
	}
	return null;
}

export function isPbkdf2PresentationHash(stored: string): boolean {
	const parts = stored.split('.');
	if (parts.length !== 3) return false;
	const n = parseInt(parts[0], 10);
	return Number.isFinite(n) && n > 0 && parts[1].length > 0 && parts[2].length > 0;
}

export async function hashPresentationPassword(password: string): Promise<string> {
	const iterations = PBKDF2_ITERATIONS;
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const encoder = new TextEncoder();

	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(password),
		{ name: 'PBKDF2' },
		false,
		['deriveBits']
	);

	const hash = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt,
			iterations,
			hash: 'SHA-256',
		},
		keyMaterial,
		256
	);

	const saltBase64 = btoa(String.fromCharCode(...salt));
	const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(hash)));

	return `${iterations}.${saltBase64}.${hashBase64}`;
}

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) {
		return false;
	}
	const subtle = crypto.subtle as SubtleCrypto & {
		timingSafeEqual?: (left: BufferSource, right: BufferSource) => boolean;
	};
	if (typeof subtle.timingSafeEqual === 'function') {
		return subtle.timingSafeEqual(a, b);
	}
	let diff = 0;
	for (let i = 0; i < a.byteLength; i++) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}

export async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const [digestA, digestB] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(a)),
		crypto.subtle.digest('SHA-256', encoder.encode(b)),
	]);
	const equalDigest = timingSafeEqualBytes(new Uint8Array(digestA), new Uint8Array(digestB));
	return equalDigest && a.length === b.length;
}

export function parseBasicAuth(
	authHeader: string | null
): { username: string; password: string } | null {
	if (!authHeader || !authHeader.startsWith('Basic ')) {
		return null;
	}
	const base64Credentials = authHeader.slice(6).trim();
	if (!base64Credentials) {
		return null;
	}
	try {
		const credentials = atob(base64Credentials);
		const colonIndex = credentials.indexOf(':');
		if (colonIndex === -1) {
			return null;
		}
		return {
			username: credentials.slice(0, colonIndex),
			password: credentials.slice(colonIndex + 1),
		};
	} catch {
		return null;
	}
}

export async function verifyPresentationPassword(
	password: string,
	storedHash: string
): Promise<boolean> {
	if (password.length > MAX_PASSWORD_LENGTH) {
		return false;
	}
	const parts = storedHash.split('.');
	if (parts.length !== 3) return false;

	const [iterationsStr, saltBase64, hashBase64] = parts;
	const iterations = Number(iterationsStr);
	if (!Number.isInteger(iterations) || iterations <= 0 || iterations > MAX_PBKDF2_ITERATIONS) {
		return false;
	}

	try {
		const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));
		const expectedHash = Uint8Array.from(atob(hashBase64), (c) => c.charCodeAt(0));
		if (salt.byteLength === 0 || expectedHash.byteLength !== 32) {
			return false;
		}

		const encoder = new TextEncoder();
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			encoder.encode(password),
			{ name: 'PBKDF2' },
			false,
			['deriveBits']
		);

		const derivedBits = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt,
				iterations,
				hash: 'SHA-256',
			},
			keyMaterial,
			256
		);

		const derivedHash = new Uint8Array(derivedBits);
		return timingSafeEqualBytes(derivedHash, expectedHash);
	} catch {
		return false;
	}
}
