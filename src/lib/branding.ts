export type BrandingConfig = {
	appName: string;
	appVersion: string;
	orgName: string;
	orgUrl: string | null;
	logoUrl: string | null;
	heroTitle: string;
	heroSubtitle: string;
	publicContentBaseUrl: string;
};

export const DEFAULT_APP_NAME = 'Presentation Manager';
export const DEFAULT_APP_VERSION = '1.0.0';
export const DEFAULT_HERO_TITLE = 'Interactive Presentations';
export const DEFAULT_HERO_SUBTITLE = 'Explore shared presentations and interactive decks.';

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

function readNonEmptyString(value: unknown, fallback: string): string {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed.length > 0) return trimmed;
	}
	return fallback;
}

export function getBrandingConfig(
	env: Partial<Record<string, unknown>> | undefined,
	requestUrl?: URL | string
): BrandingConfig {
	const safeEnv = env ?? {};
	const appName = readNonEmptyString(safeEnv.APP_NAME, DEFAULT_APP_NAME);
	const orgName = readNonEmptyString(safeEnv.ORG_NAME, appName);
	const orgUrl = sanitizeHttpUrl(
		typeof safeEnv.ORG_URL === 'string' ? safeEnv.ORG_URL : null,
		{ allowRootRelative: false }
	);
	const logoUrl = sanitizeHttpUrl(
		typeof safeEnv.LOGO_URL === 'string' ? safeEnv.LOGO_URL : null,
		{ allowRootRelative: true }
	);
	const heroTitle = readNonEmptyString(safeEnv.HERO_TITLE, DEFAULT_HERO_TITLE);
	const heroSubtitle = readNonEmptyString(safeEnv.HERO_SUBTITLE, DEFAULT_HERO_SUBTITLE);

	const configuredBase = sanitizeHttpUrl(
		typeof safeEnv.PUBLIC_CONTENT_BASE_URL === 'string'
			? safeEnv.PUBLIC_CONTENT_BASE_URL
			: null,
		{ allowRootRelative: false }
	);

	let publicContentBaseUrl = '';
	if (configuredBase) {
		publicContentBaseUrl = configuredBase.replace(/\/+$/, '');
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
		heroTitle,
		heroSubtitle,
		publicContentBaseUrl,
	};
}

export function renderAccessDeniedHtml(branding: BrandingConfig): string {
	const safeAppTitle = escapeHtml(branding.appName || branding.orgName);
	const safeOrgName = escapeHtml(branding.orgName || branding.appName);
	const safeLogoUrl = branding.logoUrl ? escapeHtml(branding.logoUrl) : null;

	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
