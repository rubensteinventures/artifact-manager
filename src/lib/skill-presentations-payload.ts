import {
	hashPresentationPassword,
	getVisitorPasswordValidationError,
} from './presentation-password.ts';
import type { SkillPresentationFileInput } from './presentation-r2.ts';
import { validatePresentationSlug, validatePublicUsername } from './slug-username.ts';

export type ResolvedSkillAccess = {
	username: string | null;
	passwordHash: string | null;
};

export type ParsedSkillPresentationBody = {
	slug: string;
	name: string;
	access: ResolvedSkillAccess;
	files: SkillPresentationFileInput[];
};

async function resolveAccess(
	access: unknown
): Promise<{ ok: true; value: ResolvedSkillAccess } | { ok: false; error: string }> {
	if (access == null || typeof access !== 'object') {
		return { ok: false, error: 'access must be an object.' };
	}
	const rec = access as Record<string, unknown>;
	const mode = rec.mode;
	if (mode === 'public') {
		return { ok: true, value: { username: null, passwordHash: null } };
	}
	if (mode === 'protected') {
		const uRaw = rec.publicUsername;
		const pRaw = rec.visitorPassword;
		const uStr = typeof uRaw === 'string' ? uRaw : '';
		const pStr = typeof pRaw === 'string' ? pRaw : '';
		const uCheck = validatePublicUsername(uStr);
		if (!uCheck.ok) return { ok: false, error: uCheck.error };
		if (uCheck.username === null) {
			return { ok: false, error: 'publicUsername is required when access.mode is "protected".' };
		}
		const pwdErr = getVisitorPasswordValidationError(pStr);
		if (pwdErr) return { ok: false, error: pwdErr };
		const passwordHash = await hashPresentationPassword(pStr);
		return { ok: true, value: { username: uCheck.username, passwordHash } };
	}
	return { ok: false, error: 'access.mode must be "public" or "protected".' };
}

function parseFiles(
	raw: unknown
): { ok: true; files: SkillPresentationFileInput[] } | { ok: false; error: string } {
	if (!Array.isArray(raw)) return { ok: false, error: 'files must be an array.' };
	const files: SkillPresentationFileInput[] = [];
	for (const item of raw) {
		if (item == null || typeof item !== 'object') {
			return { ok: false, error: 'Each files[] entry must be an object.' };
		}
		const o = item as Record<string, unknown>;
		const path = o.path;
		const data = o.data;
		if (typeof path !== 'string' || typeof data !== 'string') {
			return { ok: false, error: 'Each file requires string path and string data (base64).' };
		}
		const ct = o.contentType;
		if (ct != null && typeof ct !== 'string') {
			return { ok: false, error: 'contentType must be a string when provided.' };
		}
		files.push({
			path,
			data,
			contentType: typeof ct === 'string' ? ct : undefined,
		});
	}
	return { ok: true, files };
}

export async function parseCreateSkillPresentationBody(
	raw: unknown
): Promise<{ ok: true; value: ParsedSkillPresentationBody } | { ok: false; error: string }> {
	if (raw == null || typeof raw !== 'object') {
		return { ok: false, error: 'JSON body must be an object.' };
	}
	const body = raw as Record<string, unknown>;
	const slugRaw = body.slug;
	const nameRaw = body.name;
	if (typeof slugRaw !== 'string') return { ok: false, error: 'slug must be a string.' };
	if (typeof nameRaw !== 'string') return { ok: false, error: 'name must be a string.' };
	const slugCheck = validatePresentationSlug(slugRaw);
	if (!slugCheck.ok) return { ok: false, error: slugCheck.error };
	const name = nameRaw.trim();
	if (!name) return { ok: false, error: 'name must be non-empty.' };

	const accessResult = await resolveAccess(body.access);
	if (!accessResult.ok) return accessResult;

	const filesResult = parseFiles(body.files ?? []);
	if (!filesResult.ok) return filesResult;

	return {
		ok: true,
		value: {
			slug: slugCheck.slug,
			name,
			access: accessResult.value,
			files: filesResult.files,
		},
	};
}

export async function parseUpdateSkillPresentationBody(
	raw: unknown
): Promise<
	{ ok: true; value: Omit<ParsedSkillPresentationBody, 'slug'> } | { ok: false; error: string }
> {
	if (raw == null || typeof raw !== 'object') {
		return { ok: false, error: 'JSON body must be an object.' };
	}
	const body = raw as Record<string, unknown>;
	const nameRaw = body.name;
	if (typeof nameRaw !== 'string') return { ok: false, error: 'name must be a string.' };
	const name = nameRaw.trim();
	if (!name) return { ok: false, error: 'name must be non-empty.' };

	const accessResult = await resolveAccess(body.access);
	if (!accessResult.ok) return accessResult;

	const filesResult = parseFiles(body.files ?? []);
	if (!filesResult.ok) return filesResult;

	return {
		ok: true,
		value: {
			name,
			access: accessResult.value,
			files: filesResult.files,
		},
	};
}
