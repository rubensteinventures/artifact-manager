const ALLOWED_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Safe relative path for R2 keys under a fixed prefix (no .., no absolute). */
export function normalizeContentRelativePath(raw: string): string | null {
	const t = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '');
	if (!t || t.includes('\0')) return null;
	const segments = t.split('/').filter(Boolean);
	for (const seg of segments) {
		if (seg === '.' || seg === '..') return null;
	}
	return segments.join('/');
}

/**
 * Validates that an R2 object key belongs strictly under `content/{slug}/`
 * as either a normalized file key or a normalized folder marker (`.../`) and is not the root prefix itself.
 */
export function isValidPresentationObjectKey(slug: string, key: string): boolean {
	if (!slug || !ALLOWED_SLUG_RE.test(slug)) return false;
	if (!key || typeof key !== 'string' || key.includes('\0')) return false;
	const expectedPrefix = `content/${slug}/`;
	if (!key.startsWith(expectedPrefix)) return false;
	const suffix = key.slice(expectedPrefix.length);
	if (!suffix) return false;
	if (suffix.endsWith('/')) {
		const folderPath = suffix.slice(0, -1);
		if (!folderPath || folderPath.endsWith('/')) return false;
		const norm = normalizeContentRelativePath(folderPath);
		return norm !== null && norm === folderPath;
	}
	const norm = normalizeContentRelativePath(suffix);
	return norm !== null && norm === suffix;
}
