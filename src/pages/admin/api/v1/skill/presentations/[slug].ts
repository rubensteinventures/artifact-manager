import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { deleteAllUnderContentPrefix, putPresentationFiles } from '@/lib/presentation-r2';
import { parseUpdateSkillPresentationBody } from '@/lib/skill-presentations-payload';
import {
	httpStatusForPutFilesError,
	requireSkillJsonRequest,
	skillApiJson,
} from '@/lib/skill-api-request';
import { isAllowedSlugParam } from '@/lib/slug-username';

export const PUT: APIRoute = async ({ params, request }) => {
	const gate = await requireSkillJsonRequest(request, env.SKILL_API_TOKEN);
	if (gate) return gate;

	const slug = params.slug;
	if (!isAllowedSlugParam(slug)) {
		return skillApiJson({ error: 'Invalid slug.' }, 400);
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return skillApiJson({ error: 'Invalid JSON or request body too large.' }, 400);
	}

	const parsed = await parseUpdateSkillPresentationBody(raw);
	if (!parsed.ok) {
		return skillApiJson({ error: parsed.error }, 400);
	}

	const { name, access, files } = parsed.value;
	const db = env.DB;
	const bucket = env.BUCKET;

	const existing = await db
		.prepare('SELECT slug FROM presentations WHERE slug = ?')
		.bind(slug)
		.first();
	if (!existing) {
		return skillApiJson({ error: 'Presentation not found.' }, 404);
	}

	const now = new Date().toISOString();
	await db
		.prepare(
			'UPDATE presentations SET name = ?, username = ?, password = ?, uploaded_at = ? WHERE slug = ?'
		)
		.bind(name, access.username, access.passwordHash, now, slug)
		.run();

	await deleteAllUnderContentPrefix(bucket, slug);
	const putErr = await putPresentationFiles(bucket, slug, files);
	if (putErr) {
		return skillApiJson({ error: putErr.detail }, httpStatusForPutFilesError(putErr));
	}

	return skillApiJson({ ok: true, slug, name }, 200);
};
