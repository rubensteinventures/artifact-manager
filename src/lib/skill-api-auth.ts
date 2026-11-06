/**
 * Bearer token auth for `/admin/api/v1/skill/*`.
 * Compare SHA-256 hashes so timingSafeEqual always uses 32-byte operands.
 */
import { timingSafeEqualBytes } from './presentation-password.ts';

async function sha256Utf8(text: string): Promise<Uint8Array> {
	const data = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return new Uint8Array(digest);
}

/** Returns true if Authorization Bearer matches SKILL_API_TOKEN. */
export async function verifySkillApiBearer(
	request: Request,
	expectedToken: string | undefined
): Promise<boolean> {
	if (expectedToken == null || expectedToken.length === 0) return false;
	const auth = request.headers.get('Authorization');
	if (auth == null || !auth.startsWith('Bearer ')) return false;
	const presented = auth.slice('Bearer '.length).trim();
	if (presented.length === 0) return false;
	const [a, b] = await Promise.all([sha256Utf8(expectedToken), sha256Utf8(presented)]);
	return timingSafeEqualBytes(a, b);
}
