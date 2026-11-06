import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { deleteAllUnderContentPrefix, putPresentationFiles } from '@/lib/presentation-r2';
import { parseCreateSkillPresentationBody } from '@/lib/skill-presentations-payload';
import {
	httpStatusForPutFilesError,
	requireSkillJsonRequest,
	skillApiJson,
} from '@/lib/skill-api-request';

export const POST: APIRoute = async ({ request }) => {
	const gate = await requireSkillJsonRequest(request, env.SKILL_API_TOKEN);
	if (gate) return gate;

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return skillApiJson({ error: 'Invalid JSON or request body too large.' }, 400);
	}

	const parsed = await parseCreateSkillPresentationBody(raw);
	if (!parsed.ok) {
		return skillApiJson({ error: parsed.error }, 400);
	}

	const { slug, name, access, files } = parsed.value;
	const db = env.DB;
	const bucket = env.BUCKET;

	try {
		const now = new Date().toISOString();
		await db
			.prepare(
				'INSERT INTO presentations (slug, name, username, password, uploaded_at) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(slug, name, access.username, access.passwordHash, now)
			.run();
	} catch {
		return skillApiJson({ error: 'Presentation slug already exists.' }, 409);
	}

	await deleteAllUnderContentPrefix(bucket, slug);
	const putErr = await putPresentationFiles(bucket, slug, files);
	if (putErr) {
		return skillApiJson({ error: putErr.detail }, httpStatusForPutFilesError(putErr));
	}

	return skillApiJson({ ok: true, slug, name }, 201);
};
