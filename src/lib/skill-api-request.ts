import type { PutFilesError } from './presentation-r2.ts';
import { verifySkillApiBearer } from './skill-api-auth.ts';

export function skillApiJson(data: unknown, status: number): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
}

export async function requireSkillJsonRequest(
	request: Request,
	skillApiToken: string | undefined
): Promise<Response | null> {
	if (skillApiToken == null || skillApiToken === '') {
		return skillApiJson({ error: 'Skill API is not configured (missing SKILL_API_TOKEN).' }, 503);
	}
	if (!(await verifySkillApiBearer(request, skillApiToken))) {
		return skillApiJson({ error: 'Unauthorized.' }, 401);
	}
	const ct = request.headers.get('Content-Type');
	if (!ct || !ct.toLowerCase().startsWith('application/json')) {
		return skillApiJson({ error: 'Content-Type must be application/json.' }, 415);
	}
	return null;
}

export function httpStatusForPutFilesError(err: PutFilesError): number {
	if (err.kind === 'file_too_large') return 413;
	return 400;
}
