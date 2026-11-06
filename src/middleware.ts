import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';
import { applyAdminSecurityHeaders, isBlockedCrossSiteMutation } from '@/lib/admin-auth';
import { applyViewerSecurityHeaders, handleContentRequest } from '@/lib/content-viewer';

/**
 * Unified request middleware:
 * - `/content/*` streams presentation files from R2 with optional per-presentation D1 Basic Auth (`X-Frame-Options: SAMEORIGIN`).
 * - `/admin` and `/admin/*` enforce CSRF checks, `X-Frame-Options: DENY`, and KV-backed admin sessions.
 * - `/` and public assets pass through with `X-Frame-Options: SAMEORIGIN`.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;

	if (pathname === '/content' || pathname.startsWith('/content/')) {
		const response = await handleContentRequest(
			context.request,
			env as unknown as { DB: D1Database; BUCKET: R2Bucket } & Record<string, unknown>
		);
		return applyViewerSecurityHeaders(response);
	}

	if (pathname === '/admin' || pathname.startsWith('/admin/')) {
		const normalizedPath =
			pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
		const secFetchSite = context.request.headers.get('Sec-Fetch-Site');

		if (isBlockedCrossSiteMutation(context.request.method, normalizedPath, secFetchSite)) {
			return applyAdminSecurityHeaders(
				new Response('Forbidden: cross-origin request blocked.', { status: 403 })
			);
		}

		if (normalizedPath.startsWith('/admin/api/')) {
			return applyAdminSecurityHeaders(await next());
		}

		const adminUsername = await context.session?.get('adminUsername');

		if (
			(!adminUsername || typeof adminUsername !== 'string') &&
			normalizedPath !== '/admin/login'
		) {
			return applyAdminSecurityHeaders(context.redirect('/admin/login'));
		}

		if (adminUsername && normalizedPath === '/admin/login') {
			return applyAdminSecurityHeaders(context.redirect('/admin'));
		}

		return applyAdminSecurityHeaders(await next());
	}

	return applyViewerSecurityHeaders(await next());
});
