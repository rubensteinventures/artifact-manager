export type BrandingEnvOverrides = {
	appName: boolean;
	orgName: boolean;
	orgUrl: boolean;
	logoUrl: boolean;
	faviconUrl: boolean;
	heroTitle: boolean;
	heroSubtitle: boolean;
	publicContentBaseUrl: boolean;
};

export type DbBrandingSettings = {
	id?: number;
	app_name?: string | null;
	org_name?: string | null;
	org_url?: string | null;
	logo_url?: string | null;
	favicon_url?: string | null;
	hero_title?: string | null;
	hero_subtitle?: string | null;
	public_content_base_url?: string | null;
	updated_at?: string | null;
};

export type BrandingConfig = {
	appName: string;
	appVersion: string;
	orgName: string;
	orgUrl: string | null;
	logoUrl: string | null;
	faviconUrl: string;
	heroTitle: string;
	heroSubtitle: string;
	publicContentBaseUrl: string;
	configuredPublicContentBaseUrl: string | null;
	envOverrides: BrandingEnvOverrides;
};

export const DEFAULT_APP_NAME = 'Presentation Manager';
export const DEFAULT_APP_VERSION = '1.0.0';
export const DEFAULT_FAVICON_URL = '/favicon.svg';
export const DEFAULT_HERO_TITLE = 'Interactive Presentations';
export const DEFAULT_HERO_SUBTITLE = 'Explore shared presentations and interactive decks.';
export const MAX_BRANDING_ASSET_BYTES = 2 * 1024 * 1024;
export const ALLOWED_BRANDING_MIME_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'image/svg+xml',
	'image/x-icon',
	'image/vnd.microsoft.icon',
] as const;

const BRANDING_LOGO_R2_KEY = '_branding/logo';
const BRANDING_FAVICON_R2_KEY = '_branding/favicon';

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function sanitizeHttpUrl(
	raw: string | undefined | null,
	options?: { allowRootRelative?: boolean }
): string | null {
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;

	if (options?.allowRootRelative && trimmed.startsWith('/') && !trimmed.startsWith('//')) {
		if (trimmed.includes('\0') || trimmed.includes('\\')) return null;
		return trimmed;
	}

	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return null;
		}
		return parsed.toString();
	} catch {
		return null;
	}
}

function readOptionalTrimmedString(value: unknown): string | null {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed.length > 0) return trimmed;
	}
	return null;
}

export function getBrandingConfig(
	env: Partial<Record<string, unknown>> | undefined,
	requestUrl?: URL | string,
	dbSettings?: DbBrandingSettings | null
): BrandingConfig {
	const safeEnv = env ?? {};
	const safeDb = dbSettings ?? {};

	const envAppName = readOptionalTrimmedString(safeEnv.APP_NAME);
	const dbAppName = readOptionalTrimmedString(safeDb.app_name);
	const appName = envAppName ?? dbAppName ?? DEFAULT_APP_NAME;

	const envOrgName = readOptionalTrimmedString(safeEnv.ORG_NAME);
	const dbOrgName = readOptionalTrimmedString(safeDb.org_name);
	const orgName = envOrgName ?? dbOrgName ?? appName;

	const envOrgUrl = sanitizeHttpUrl(
		typeof safeEnv.ORG_URL === 'string' ? safeEnv.ORG_URL : null,
		{ allowRootRelative: false }
	);
	const dbOrgUrl = sanitizeHttpUrl(
		typeof safeDb.org_url === 'string' ? safeDb.org_url : null,
		{ allowRootRelative: false }
	);
	const orgUrl = envOrgUrl ?? dbOrgUrl ?? null;

	const envLogoUrl = sanitizeHttpUrl(
		typeof safeEnv.LOGO_URL === 'string' ? safeEnv.LOGO_URL : null,
		{ allowRootRelative: true }
	);
	const dbLogoUrl = sanitizeHttpUrl(
		typeof safeDb.logo_url === 'string' ? safeDb.logo_url : null,
		{ allowRootRelative: true }
	);
	const logoUrl = envLogoUrl ?? dbLogoUrl ?? null;

	const envFaviconUrl = sanitizeHttpUrl(
		typeof safeEnv.FAVICON_URL === 'string' ? safeEnv.FAVICON_URL : null,
		{ allowRootRelative: true }
	);
	const dbFaviconUrl = sanitizeHttpUrl(
		typeof safeDb.favicon_url === 'string' ? safeDb.favicon_url : null,
		{ allowRootRelative: true }
	);
	const faviconUrl = envFaviconUrl ?? dbFaviconUrl ?? DEFAULT_FAVICON_URL;

	const envHeroTitle = readOptionalTrimmedString(safeEnv.HERO_TITLE);
	const dbHeroTitle = readOptionalTrimmedString(safeDb.hero_title);
	const heroTitle = envHeroTitle ?? dbHeroTitle ?? DEFAULT_HERO_TITLE;

	const envHeroSubtitle = readOptionalTrimmedString(safeEnv.HERO_SUBTITLE);
	const dbHeroSubtitle = readOptionalTrimmedString(safeDb.hero_subtitle);
	const heroSubtitle = envHeroSubtitle ?? dbHeroSubtitle ?? DEFAULT_HERO_SUBTITLE;

	const envBase = sanitizeHttpUrl(
		typeof safeEnv.PUBLIC_CONTENT_BASE_URL === 'string'
			? safeEnv.PUBLIC_CONTENT_BASE_URL
			: null,
		{ allowRootRelative: false }
	);
	const dbBase = sanitizeHttpUrl(
		typeof safeDb.public_content_base_url === 'string'
			? safeDb.public_content_base_url
			: null,
		{ allowRootRelative: false }
	);
	const rawConfiguredBase = envBase ?? dbBase ?? null;
	const configuredPublicContentBaseUrl = rawConfiguredBase
		? rawConfiguredBase.replace(/\/+$/, '')
		: null;

	let publicContentBaseUrl = '';
	if (configuredPublicContentBaseUrl) {
		publicContentBaseUrl = configuredPublicContentBaseUrl;
	} else if (requestUrl) {
		try {
			const parsed =
				requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl));
			publicContentBaseUrl = parsed.origin.replace(/\/+$/, '');
		} catch {
			publicContentBaseUrl = '';
		}
	}

	return {
		appName,
		appVersion: DEFAULT_APP_VERSION,
		orgName,
		orgUrl,
		logoUrl,
		faviconUrl,
		heroTitle,
		heroSubtitle,
		publicContentBaseUrl,
		configuredPublicContentBaseUrl,
		envOverrides: {
			appName: envAppName !== null,
			orgName: envOrgName !== null,
			orgUrl: envOrgUrl !== null,
			logoUrl: envLogoUrl !== null,
			faviconUrl: envFaviconUrl !== null,
			heroTitle: envHeroTitle !== null,
			heroSubtitle: envHeroSubtitle !== null,
			publicContentBaseUrl: envBase !== null,
		},
	};
}

export async function loadBrandingConfig(
	env: (Partial<Record<string, unknown>> & { DB?: D1Database }) | undefined,
	requestUrl?: URL | string
): Promise<BrandingConfig> {
	let dbRow: DbBrandingSettings | null = null;
	if (env?.DB && typeof env.DB.prepare === 'function') {
		try {
			dbRow = await env.DB.prepare('SELECT * FROM settings WHERE id = 1').first<DbBrandingSettings>();
		} catch {
			dbRow = null;
		}
	}
	return getBrandingConfig(env, requestUrl, dbRow);
}

function extractUploadedFile(entry: FormDataEntryValue | null): File | null {
	if (entry && typeof entry === 'object' && 'size' in entry && 'arrayBuffer' in entry) {
		const f = entry as File;
		if (f.size > 0) return f;
	}
	return null;
}

function validateBrandingFile(
	file: File,
	label: string
): { ok: true; contentType: string } | { ok: false; error: string } {
	if (file.size > MAX_BRANDING_ASSET_BYTES) {
		return { ok: false, error: `${label} file must be 2 MB or smaller.` };
	}
	const contentType = (file.type || '').toLowerCase().trim();
	if (
		!(ALLOWED_BRANDING_MIME_TYPES as readonly string[]).includes(contentType)
	) {
		return {
			ok: false,
			error: `${label} file must be a PNG, JPEG, WebP, GIF, SVG, or ICO image.`,
		};
	}
	return { ok: true, contentType };
}

export async function saveBrandingSettings(
	db: D1Database,
	bucket: R2Bucket | undefined,
	formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
	let existing: DbBrandingSettings | null = null;
	try {
		existing = await db.prepare('SELECT * FROM settings WHERE id = 1').first<DbBrandingSettings>();
	} catch {
		existing = null;
	}

	const appName = readOptionalTrimmedString(formData.get('app_name'));
	const orgName = readOptionalTrimmedString(formData.get('org_name'));
	const heroTitle = readOptionalTrimmedString(formData.get('hero_title'));
	const heroSubtitle = readOptionalTrimmedString(formData.get('hero_subtitle'));

	const rawOrgUrl = readOptionalTrimmedString(formData.get('org_url'));
	let orgUrl: string | null = null;
	if (rawOrgUrl) {
		orgUrl = sanitizeHttpUrl(rawOrgUrl, { allowRootRelative: false });
		if (!orgUrl) {
			return {
				ok: false,
				error: 'Organization URL must be a valid http:// or https:// URL.',
			};
		}
	}

	const rawPublicBase = readOptionalTrimmedString(formData.get('public_content_base_url'));
	let publicContentBaseUrl: string | null = null;
	if (rawPublicBase) {
		const sanitizedBase = sanitizeHttpUrl(rawPublicBase, { allowRootRelative: false });
		if (!sanitizedBase) {
			return {
				ok: false,
				error: 'Public Content Base URL must be a valid http:// or https:// URL.',
			};
		}
		publicContentBaseUrl = sanitizedBase.replace(/\/+$/, '');
	}

	const hasLogoUrlField = formData.has('logo_url');
	const rawLogoUrl = readOptionalTrimmedString(formData.get('logo_url'));
	let logoUrl: string | null = existing?.logo_url ?? null;
	if (hasLogoUrlField) {
		if (rawLogoUrl) {
			const sanitizedLogo = sanitizeHttpUrl(rawLogoUrl, { allowRootRelative: true });
			if (!sanitizedLogo) {
				return {
					ok: false,
					error: 'Logo URL must be a valid http(s):// URL or root-relative path starting with /.',
				};
			}
			logoUrl = sanitizedLogo;
		} else {
			logoUrl = null;
		}
	}

	const hasFaviconUrlField = formData.has('favicon_url');
	const rawFaviconUrl = readOptionalTrimmedString(formData.get('favicon_url'));
	let faviconUrl: string | null = existing?.favicon_url ?? null;
	if (hasFaviconUrlField) {
		if (rawFaviconUrl) {
			const sanitizedFavicon = sanitizeHttpUrl(rawFaviconUrl, { allowRootRelative: true });
			if (!sanitizedFavicon) {
				return {
					ok: false,
					error: 'Favicon URL must be a valid http(s):// URL or root-relative path starting with /.',
				};
			}
			faviconUrl = sanitizedFavicon;
		} else {
			faviconUrl = null;
		}
	}

	const logoFile = extractUploadedFile(formData.get('logo_file'));
	if (logoFile) {
		const check = validateBrandingFile(logoFile, 'Logo');
		if (!check.ok) return check;
		if (!bucket) {
			return { ok: false, error: 'Storage bucket is not configured for file uploads.' };
		}
		const bytes = await logoFile.arrayBuffer();
		await bucket.put(BRANDING_LOGO_R2_KEY, bytes, {
			httpMetadata: { contentType: check.contentType },
		});
		logoUrl = `/branding/logo?v=${Date.now()}`;
	} else if (formData.get('clear_logo') === '1') {
		if (bucket) {
			try {
				await bucket.delete(BRANDING_LOGO_R2_KEY);
			} catch {
				// Ignore missing key on delete
			}
		}
		logoUrl = null;
	}

	const faviconFile = extractUploadedFile(formData.get('favicon_file'));
	if (faviconFile) {
		const check = validateBrandingFile(faviconFile, 'Favicon');
		if (!check.ok) return check;
		if (!bucket) {
			return { ok: false, error: 'Storage bucket is not configured for file uploads.' };
		}
		const bytes = await faviconFile.arrayBuffer();
		await bucket.put(BRANDING_FAVICON_R2_KEY, bytes, {
			httpMetadata: { contentType: check.contentType },
		});
		faviconUrl = `/branding/favicon?v=${Date.now()}`;
	} else if (formData.get('clear_favicon') === '1') {
		if (bucket) {
			try {
				await bucket.delete(BRANDING_FAVICON_R2_KEY);
			} catch {
				// Ignore missing key on delete
			}
		}
		faviconUrl = null;
	}

	const updatedAt = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO settings (
				id,
				app_name,
				org_name,
				org_url,
				logo_url,
				favicon_url,
				hero_title,
				hero_subtitle,
				public_content_base_url,
				updated_at
			) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				app_name = excluded.app_name,
				org_name = excluded.org_name,
				org_url = excluded.org_url,
				logo_url = excluded.logo_url,
				favicon_url = excluded.favicon_url,
				hero_title = excluded.hero_title,
				hero_subtitle = excluded.hero_subtitle,
				public_content_base_url = excluded.public_content_base_url,
				updated_at = excluded.updated_at`
		)
		.bind(
			appName,
			orgName,
			orgUrl,
			logoUrl,
			faviconUrl,
			heroTitle,
			heroSubtitle,
			publicContentBaseUrl,
			updatedAt
		)
		.run();

	return { ok: true };
}

export async function handleBrandingAssetRequest(
	request: Request,
	env: { BUCKET?: R2Bucket }
): Promise<Response> {
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		return new Response('Method Not Allowed', { status: 405 });
	}
	if (!env.BUCKET) {
		return new Response('Not Found', { status: 404 });
	}

	const url = new URL(request.url);
	let r2Key: string | null = null;
	if (url.pathname === '/branding/logo') {
		r2Key = BRANDING_LOGO_R2_KEY;
	} else if (url.pathname === '/branding/favicon') {
		r2Key = BRANDING_FAVICON_R2_KEY;
	} else {
		return new Response('Not Found', { status: 404 });
	}

	const object = await env.BUCKET.get(r2Key);
	if (!object) {
		return new Response('Not Found', { status: 404 });
	}

	const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
	if (!(ALLOWED_BRANDING_MIME_TYPES as readonly string[]).includes(contentType)) {
		return new Response('Not Found', { status: 404 });
	}

	const headers = new Headers({
		'Content-Type': contentType,
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
		'Cache-Control': 'public, max-age=3600',
	});

	if (request.method === 'HEAD') {
		return new Response(null, { status: 200, headers });
	}

	return new Response(object.body, { status: 200, headers });
}

export function renderAccessDeniedHtml(branding: BrandingConfig): string {
	const safeAppTitle = escapeHtml(branding.appName || branding.orgName);
	const safeOrgName = escapeHtml(branding.orgName || branding.appName);
	const safeLogoUrl = branding.logoUrl ? escapeHtml(branding.logoUrl) : null;
	const safeFaviconUrl = escapeHtml(branding.faviconUrl || DEFAULT_FAVICON_URL);

	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="${safeFaviconUrl}">
    <title>Access Denied | ${safeAppTitle}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            text-align: center;
        }
        .container {
            max-width: 480px;
            padding: 2.5rem 2rem;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 0.75rem;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.07);
        }
        h1 {
            font-size: 2rem;
            font-weight: 700;
            margin: 0 0 0.75rem;
            color: #0f172a;
        }
        p {
            font-size: 1rem;
            line-height: 1.6;
            color: #475569;
            margin: 0.5rem 0;
        }
        .logo {
            height: 40px;
            width: auto;
            margin-bottom: 1.5rem;
        }
        .brand-text {
            color: #1d4ed8;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        ${safeLogoUrl ? `<img src="${safeLogoUrl}" alt="${safeOrgName}" class="logo">` : ''}
        <h1>Access Denied</h1>
        <p>You do not have permission to access this presentation.</p>
        <p>Please reach out to your <span class="brand-text">${safeOrgName}</span> administrator for credentials.</p>
    </div>
</body>
</html>`;
}
