import { normalizeContentRelativePath } from './r2-path.ts';

/** Guardrails for Skill API JSON payloads (Worker request body limits still apply). */
export const SKILL_API_MAX_FILES = 200;
export const SKILL_API_MAX_DECODED_BYTES_PER_FILE = 15 * 1024 * 1024;

/** Maximum single-file upload size via the admin multipart endpoint (50 MiB). */
export const ADMIN_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export type SkillPresentationFileInput = {
	path: string;
	contentType?: string;
	data: string;
};

function contentPrefix(slug: string): string {
	return `content/${slug}/`;
}

/** List all keys under `content/{slug}/` and delete (paginated). */
export async function deleteAllUnderContentPrefix(bucket: R2Bucket, slug: string): Promise<void> {
	const prefix = contentPrefix(slug);
	let cursor: string | undefined;
	for (;;) {
		const page = await bucket.list({ prefix, cursor });
		for (const obj of page.objects) {
			await bucket.delete(obj.key);
		}
		if (!page.truncated) break;
		cursor = page.cursor;
	}
}

function decodeBase64File(
	data: string,
	maxBytes: number
): { ok: true; bytes: Uint8Array } | { ok: false; reason: 'invalid' | 'too_large' } {
	const t = data.trim();
	if (t.length === 0) return { ok: true, bytes: new Uint8Array(0) };
	try {
		const binary = atob(t);
		if (binary.length > maxBytes) return { ok: false, reason: 'too_large' };
		const out = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			out[i] = binary.charCodeAt(i);
		}
		return { ok: true, bytes: out };
	} catch {
		return { ok: false, reason: 'invalid' };
	}
}

export type PutFilesError = { kind: 'bad_path' | 'bad_base64' | 'too_many_files' | 'file_too_large'; detail: string };

/** Validates paths, decodes base64, writes to R2. Caller must clear prefix first for full replace. */
export async function putPresentationFiles(
	bucket: R2Bucket,
	slug: string,
	files: SkillPresentationFileInput[]
): Promise<PutFilesError | null> {
	if (files.length > SKILL_API_MAX_FILES) {
		return {
			kind: 'too_many_files',
			detail: `At most ${SKILL_API_MAX_FILES} files per request.`,
		};
	}
	const base = contentPrefix(slug);
	for (const f of files) {
		const rel = normalizeContentRelativePath(f.path);
		if (rel === null) {
			return { kind: 'bad_path', detail: `Invalid path: ${JSON.stringify(f.path)}` };
		}
		const decoded = decodeBase64File(f.data, SKILL_API_MAX_DECODED_BYTES_PER_FILE);
		if (!decoded.ok) {
			return {
				kind: decoded.reason === 'too_large' ? 'file_too_large' : 'bad_base64',
				detail:
					decoded.reason === 'too_large'
						? `Decoded file exceeds ${SKILL_API_MAX_DECODED_BYTES_PER_FILE} bytes for path ${JSON.stringify(rel)}.`
						: `Invalid base64 for path ${JSON.stringify(rel)}.`,
			};
		}
		const key = `${base}${rel}`;
		const httpMetadata =
			typeof f.contentType === 'string' && f.contentType.trim().length > 0
				? { contentType: f.contentType.trim() }
				: undefined;
		await bucket.put(key, decoded.bytes, httpMetadata ? { httpMetadata } : undefined);
	}
	return null;
}
