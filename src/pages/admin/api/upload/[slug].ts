import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { ADMIN_UPLOAD_MAX_BYTES } from '@/lib/presentation-r2';
import { normalizeContentRelativePath } from '@/lib/r2-path';
import { isAllowedSlugParam } from '@/lib/slug-username';

export const POST: APIRoute = async ({ params, request, session }) => {
	const adminUsername = await session?.get('adminUsername');
	if (!adminUsername || typeof adminUsername !== 'string') {
		return new Response('Unauthorized', { status: 401 });
	}

	const { slug } = params;
	if (!isAllowedSlugParam(slug)) {
		return new Response('Invalid slug', { status: 400 });
	}

	const contentLengthHeader = request.headers.get('Content-Length');
	if (contentLengthHeader) {
		const declaredLength = parseInt(contentLengthHeader, 10);
		if (
			Number.isFinite(declaredLength) &&
			declaredLength > ADMIN_UPLOAD_MAX_BYTES + 1024 * 1024
		) {
			return new Response('File too large (max 50 MiB).', { status: 413 });
		}
	}

	const formData = await request.formData();
	const file = formData.get('file') as Blob;
	const pathRaw = formData.get('path');

	if (!file || pathRaw == null || typeof pathRaw !== 'string') {
		return new Response('Missing file or path', { status: 400 });
	}

	if (file.size > ADMIN_UPLOAD_MAX_BYTES) {
		return new Response('File too large (max 50 MiB).', { status: 413 });
	}

	const path = normalizeContentRelativePath(pathRaw);
	if (path === null) {
		return new Response('Invalid path', { status: 400 });
	}

	const bucket = env.BUCKET;
	const key = `content/${slug}/${path}`;

	await bucket.put(key, file);

	const now = new Date().toISOString();
	const db = env.DB;
	await db
		.prepare('UPDATE presentations SET uploaded_at = ? WHERE slug = ?')
		.bind(now, slug)
		.run();

	return new Response('Uploaded', { status: 200 });
};
