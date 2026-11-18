/** Slug (presentation directory) and public visitor username: `a-z`, `0-9`, `-`; no leading/trailing or doubled hyphens. */

const SLUG_OR_USERNAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugValidation = { ok: true; slug: string } | { ok: false; error: string };

export type PublicUsernameValidation =
	| { ok: true; username: string | null }
	| { ok: false; error: string };

export function validatePresentationSlug(raw: string): SlugValidation {
	const s = raw.trim().toLowerCase();
	if (!s) return { ok: false, error: 'Slug is required.' };
	if (!SLUG_OR_USERNAME.test(s)) {
		return {
			ok: false,
			error: 'Slug may only use lowercase letters, numbers, and hyphens (e.g. q1-marketing).',
		};
	}
	return { ok: true, slug: s };
}

/** Empty input means clear username (public access). */
export function validatePublicUsername(raw: string): PublicUsernameValidation {
	const t = raw.trim();
	if (!t) return { ok: true, username: null };
	const s = t.toLowerCase();
	if (!SLUG_OR_USERNAME.test(s)) {
		return {
			ok: false,
			error: 'Username may only use lowercase letters, numbers, and hyphens (e.g. acme-team).',
		};
	}
	return { ok: true, username: s };
}

/** For URL params and R2 prefixes: reject unsafe or disallowed slug strings. */
export function isAllowedSlugParam(slug: string | undefined): boolean {
	if (slug == null || slug.length === 0) return false;
	return SLUG_OR_USERNAME.test(slug);
}
