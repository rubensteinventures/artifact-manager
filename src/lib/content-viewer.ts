import { getBrandingConfig, renderAccessDeniedHtml } from './branding.ts';
import {
	parseBasicAuth,
	timingSafeEqualStrings,
	verifyPresentationPassword,
} from './presentation-password.ts';

const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function inferContentType(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	const types: Record<string, string> = {
		html: 'text/html',
		htm: 'text/html',
		css: 'text/css',
		js: 'application/javascript',
		mjs: 'application/javascript',
		json: 'application/json',
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		svg: 'image/svg+xml',
		webp: 'image/webp',
		ico: 'image/x-icon',
		woff: 'font/woff',
		woff2: 'font/woff2',
		ttf: 'font/ttf',
		pdf: 'application/pdf',
	};
	return types[ext] ?? 'application/octet-stream';
}

export function isSafeContentPath(pathname: string, slug: string): boolean {
	if (!SLUG_PATTERN.test(slug)) {
		return false;
	}
	try {
		const decoded = decodeURIComponent(pathname);
		if (decoded.includes('\0') || decoded.includes('\\') || decoded.includes('..')) {
			return false;
		}
		const segments = decoded.split('/').filter(Boolean);
		if (segments[0] !== 'content' || segments[1] !== slug) {
			return false;
		}
		return segments.every((seg) => seg !== '.' && seg !== '..');
	} catch {
		return false;
	}
}

export function applyViewerSecurityHeaders(response: Response): Response {
	const headers = new Headers(response.headers);
	if (!headers.has('X-Content-Type-Options')) {
		headers.set('X-Content-Type-Options', 'nosniff');
	}
	if (!headers.has('X-Frame-Options')) {
		headers.set('X-Frame-Options', 'SAMEORIGIN');
	}
	if (!headers.has('Referrer-Policy')) {
		headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function unauthorizedResponse(accessDeniedHtml: string): Response {
	return new Response(accessDeniedHtml, {
		status: 401,
		headers: {
			'WWW-Authenticate': 'Basic realm="Protected Content"',
			'Content-Type': 'text/html; charset=utf-8',
		},
	});
}

export async function handleContentRequest(
	request: Request,
	env: { DB: D1Database; BUCKET: R2Bucket } & Record<string, unknown>
): Promise<Response> {
	const url = new URL(request.url);
	const contentMatch = url.pathname.match(/^\/content\/([^/]+)/);
	const slug = contentMatch ? contentMatch[1] : null;

	if (!slug || !isSafeContentPath(url.pathname, slug)) {
		return new Response('Invalid path', { status: 400 });
	}

	const branding = getBrandingConfig(env, url);
	const accessDeniedHtml = renderAccessDeniedHtml(branding);

	let presentation: { username: string | null; password: string | null } | null = null;
	try {
		presentation = await env.DB.prepare(
			'SELECT username, password FROM presentations WHERE slug = ?'
		)
			.bind(slug)
			.first<{ username: string | null; password: string | null }>();
	} catch {
		return new Response('Service Unavailable', { status: 503 });
	}

	if (!presentation) {
		return unauthorizedResponse(accessDeniedHtml);
	}

	const hasUsername =
		typeof presentation.username === 'string' && presentation.username.trim().length > 0;
	const hasPassword =
		typeof presentation.password === 'string' && presentation.password.length > 0;

	if (hasUsername || hasPassword) {
		if (!hasUsername || !hasPassword || !presentation.username || !presentation.password) {
			return unauthorizedResponse(accessDeniedHtml);
		}

		const parsedAuth = parseBasicAuth(request.headers.get('Authorization'));
		if (!parsedAuth) {
			return unauthorizedResponse(accessDeniedHtml);
		}

		const [isUsernameValid, isPasswordValid] = await Promise.all([
			timingSafeEqualStrings(parsedAuth.username, presentation.username),
			verifyPresentationPassword(parsedAuth.password, presentation.password),
		]);

		if (!isUsernameValid || !isPasswordValid) {
			return unauthorizedResponse(accessDeniedHtml);
		}
	}

	const isSlugRoot = /^\/content\/[^/]+\/?$/.test(url.pathname);
	const r2Key = isSlugRoot ? `content/${slug}/index.html` : url.pathname.slice(1);
	if (
		!r2Key ||
		r2Key.includes('..') ||
		r2Key.startsWith('/') ||
		!r2Key.startsWith(`content/${slug}/`)
	) {
		return new Response('Invalid key', { status: 400 });
	}

	const object = await env.BUCKET.get(r2Key);
	if (!object) {
		return new Response('Not Found', { status: 404 });
	}

	const headers = new Headers();
	if (object.httpMetadata?.contentType) {
		headers.set('Content-Type', object.httpMetadata.contentType);
	} else {
		headers.set('Content-Type', inferContentType(r2Key));
	}
	if (object.httpMetadata?.cacheControl) {
		headers.set('Cache-Control', object.httpMetadata.cacheControl);
	}
	if (object.httpEtag) {
		headers.set('ETag', object.httpEtag);
	} else if (object.etag) {
		headers.set('ETag', `"${object.etag.replace(/^"|"$/g, '')}"`);
	}

	return new Response(object.body, { headers });
}
