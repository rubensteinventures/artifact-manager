import test from 'node:test';
import assert from 'node:assert/strict';
import {
	getBrandingConfig,
	loadBrandingConfig,
	validateBrandingFormData,
	saveBrandingSettings,
	handleBrandingAssetRequest,
	renderAccessDeniedHtml,
	sanitizeHttpUrl,
} from '../src/lib/branding.ts';

test('getBrandingConfig returns neutral defaults when env vars and dbSettings are empty or unset', () => {
	const cfg = getBrandingConfig({}, 'https://decks.example.com/admin');
	assert.equal(cfg.appName, 'Presentation Manager');
	assert.equal(cfg.orgName, 'Presentation Manager');
	assert.equal(cfg.orgUrl, null);
	assert.equal(cfg.logoUrl, null);
	assert.equal(cfg.faviconUrl, '/favicon.svg');
	assert.equal(cfg.heroTitle, 'Interactive Presentations');
	assert.equal(cfg.heroSubtitle, 'Explore shared presentations and interactive decks.');
	assert.equal(cfg.publicContentBaseUrl, 'https://decks.example.com');
	assert.equal(cfg.configuredPublicContentBaseUrl, null);
	assert.deepEqual(cfg.envOverrides, {
		appName: false,
		orgName: false,
		orgUrl: false,
		logoUrl: false,
		faviconUrl: false,
		heroTitle: false,
		heroSubtitle: false,
		publicContentBaseUrl: false,
	});
});

test('getBrandingConfig resolves D1 dbSettings when env vars are unset and lets non-empty env vars override D1', () => {
	const dbRow = {
		app_name: 'DB App Name',
		org_name: null,
		org_url: 'https://db-org.example.com',
		logo_url: '/branding/logo?v=123',
		favicon_url: '/branding/favicon?v=123',
		hero_title: 'DB Hero Title',
		hero_subtitle: 'DB Hero Subtitle',
		public_content_base_url: 'https://db-share.example.com/',
	};

	const fromDb = getBrandingConfig({}, 'https://decks.example.com/admin', dbRow);
	assert.equal(fromDb.appName, 'DB App Name');
	assert.equal(fromDb.orgName, 'DB App Name'); // defaults to resolved appName when org_name is null
	assert.equal(fromDb.orgUrl, 'https://db-org.example.com/');
	assert.equal(fromDb.logoUrl, '/branding/logo?v=123');
	assert.equal(fromDb.faviconUrl, '/branding/favicon?v=123');
	assert.equal(fromDb.heroTitle, 'DB Hero Title');
	assert.equal(fromDb.heroSubtitle, 'DB Hero Subtitle');
	assert.equal(fromDb.publicContentBaseUrl, 'https://db-share.example.com');
	assert.equal(fromDb.configuredPublicContentBaseUrl, 'https://db-share.example.com');

	const withEnvOverride = getBrandingConfig(
		{
			APP_NAME: 'Env App',
			FAVICON_URL: '/custom-env-favicon.png',
			ORG_NAME: '', // empty string does not override
		},
		'https://decks.example.com/admin',
		{ ...dbRow, org_name: 'DB Org Name' }
	);
	assert.equal(withEnvOverride.appName, 'Env App');
	assert.equal(withEnvOverride.orgName, 'DB Org Name');
	assert.equal(withEnvOverride.faviconUrl, '/custom-env-favicon.png');
	assert.equal(withEnvOverride.logoUrl, '/branding/logo?v=123');
	assert.equal(withEnvOverride.envOverrides.appName, true);
	assert.equal(withEnvOverride.envOverrides.faviconUrl, true);
	assert.equal(withEnvOverride.envOverrides.orgName, false);
	assert.equal(withEnvOverride.envOverrides.logoUrl, false);
});

test('getBrandingConfig applies custom branding vars and strips trailing slash from PUBLIC_CONTENT_BASE_URL', () => {
	const cfg = getBrandingConfig(
		{
			APP_NAME: 'Acme Decks',
			ORG_NAME: 'Acme Corp',
			ORG_URL: 'https://acme.example.com',
			LOGO_URL: '/assets/logo.svg',
			FAVICON_URL: '/assets/favicon.png',
			HERO_TITLE: 'Client Briefings',
			HERO_SUBTITLE: 'Private strategy decks.',
			PUBLIC_CONTENT_BASE_URL: 'https://share.acme.example.com/',
		},
		'https://admin.acme.example.com/admin'
	);
	assert.equal(cfg.appName, 'Acme Decks');
	assert.equal(cfg.orgName, 'Acme Corp');
	assert.equal(cfg.orgUrl, 'https://acme.example.com/');
	assert.equal(cfg.logoUrl, '/assets/logo.svg');
	assert.equal(cfg.faviconUrl, '/assets/favicon.png');
	assert.equal(cfg.publicContentBaseUrl, 'https://share.acme.example.com');
});

test('loadBrandingConfig reads singleton settings row from D1 and falls back cleanly on missing table', async () => {
	const mockDb = {
		prepare(sql) {
			assert.match(sql, /SELECT \* FROM settings WHERE id = 1/);
			return {
				async first() {
					return {
						app_name: 'Loaded From D1',
						org_name: 'D1 Org',
						org_url: 'https://d1.example.com',
						logo_url: '/branding/logo?v=99',
						favicon_url: '/branding/favicon?v=99',
						hero_title: 'D1 Hero',
						hero_subtitle: 'D1 Subtitle',
						public_content_base_url: null,
					};
				},
			};
		},
	};

	const cfg = await loadBrandingConfig({ DB: mockDb }, 'https://decks.example.com');
	assert.equal(cfg.appName, 'Loaded From D1');
	assert.equal(cfg.orgName, 'D1 Org');
	assert.equal(cfg.logoUrl, '/branding/logo?v=99');
	assert.equal(cfg.faviconUrl, '/branding/favicon?v=99');

	const failingDb = {
		prepare() {
			throw new Error('no such table: settings');
		},
	};
	const fallbackCfg = await loadBrandingConfig({ DB: failingDb }, 'https://decks.example.com');
	assert.equal(fallbackCfg.appName, 'Presentation Manager');
	assert.equal(fallbackCfg.faviconUrl, '/favicon.svg');
});

function createSettingsEnv() {
	let storedRow = null;
	const r2Objects = new Map();

	const db = {
		get row() {
			return storedRow;
		},
		prepare(sql) {
			if (/SELECT \* FROM settings WHERE id = 1/i.test(sql)) {
				return {
					async first() {
						return storedRow ? { ...storedRow } : null;
					},
				};
			}
			if (/INSERT INTO settings/i.test(sql)) {
				return {
					bind(
						appName,
						orgName,
						orgUrl,
						logoUrl,
						faviconUrl,
						heroTitle,
						heroSubtitle,
						publicContentBaseUrl,
						updatedAt
					) {
						return {
							async run() {
								storedRow = {
									id: 1,
									app_name: appName,
									org_name: orgName,
									org_url: orgUrl,
									logo_url: logoUrl,
									favicon_url: faviconUrl,
									hero_title: heroTitle,
									hero_subtitle: heroSubtitle,
									public_content_base_url: publicContentBaseUrl,
									updated_at: updatedAt,
								};
								return { meta: { changes: 1 } };
							},
						};
					},
				};
			}
			throw new Error(`Unexpected SQL: ${sql}`);
		},
	};

	const bucket = {
		objects: r2Objects,
		async put(key, body, options) {
			const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(body);
			r2Objects.set(key, {
				body: bytes,
				size: bytes.byteLength,
				httpMetadata: options?.httpMetadata ?? {},
				etag: `etag-${key}`,
			});
		},
		async get(key) {
			const obj = r2Objects.get(key);
			if (!obj) return null;
			return {
				...obj,
				body: obj.body,
			};
		},
		async head(key) {
			const obj = r2Objects.get(key);
			if (!obj) return null;
			return {
				size: obj.size,
				httpMetadata: obj.httpMetadata,
				etag: obj.etag,
			};
		},
		async delete(key) {
			r2Objects.delete(key);
		},
	};

	return { db, bucket };
}

test('saveBrandingSettings uploads logo and favicon to R2, ignores 0-byte file inputs, and supports clearing', async () => {
	const { db, bucket } = createSettingsEnv();

	const form1 = new FormData();
	form1.set('app_name', 'Studio Decks');
	form1.set('org_name', 'Studio Labs');
	form1.set('org_url', 'https://studiolabs.example.com');
	form1.set('hero_title', 'Interactive Briefings');
	form1.set('hero_subtitle', 'Custom subtitle.');
	form1.set('public_content_base_url', 'https://decks.studiolabs.example.com/');
	form1.set('logo_file', new File(['<svg>logo</svg>'], 'logo.svg', { type: 'image/svg+xml' }));
	form1.set('favicon_file', new File(['png-bytes'], 'favicon.png', { type: 'image/png' }));

	const res1 = await saveBrandingSettings(db, bucket, form1);
	assert.equal(res1.ok, true);
	assert.equal(db.row.app_name, 'Studio Decks');
	assert.equal(db.row.org_name, 'Studio Labs');
	assert.equal(db.row.org_url, 'https://studiolabs.example.com/');
	assert.match(db.row.logo_url, /^\/branding\/logo\?v=\d+$/);
	assert.match(db.row.favicon_url, /^\/branding\/favicon\?v=\d+$/);
	assert.equal(bucket.objects.get('_branding/logo').httpMetadata.contentType, 'image/svg+xml');
	assert.equal(bucket.objects.get('_branding/favicon').httpMetadata.contentType, 'image/png');

	// Submitting again with empty 0-byte File inputs preserves the existing uploaded logo_url & favicon_url
	const savedLogoUrl = db.row.logo_url;
	const savedFaviconUrl = db.row.favicon_url;
	const form2 = new FormData();
	form2.set('app_name', 'Studio Decks Updated');
	form2.set('logo_file', new File([], '', { type: 'application/octet-stream' }));
	form2.set('favicon_file', new File([], '', { type: 'application/octet-stream' }));

	const res2 = await saveBrandingSettings(db, bucket, form2);
	assert.equal(res2.ok, true);
	assert.equal(db.row.app_name, 'Studio Decks Updated');
	assert.equal(db.row.logo_url, savedLogoUrl);
	assert.equal(db.row.favicon_url, savedFaviconUrl);

	// Clearing logo and favicon removes R2 keys and sets database columns to null
	const form3 = new FormData();
	form3.set('app_name', 'Studio Decks Updated');
	form3.set('clear_logo', '1');
	form3.set('clear_favicon', '1');

	const res3 = await saveBrandingSettings(db, bucket, form3);
	assert.equal(res3.ok, true);
	assert.equal(db.row.logo_url, null);
	assert.equal(db.row.favicon_url, null);
	assert.equal(bucket.objects.has('_branding/logo'), false);
	assert.equal(bucket.objects.has('_branding/favicon'), false);
});

test('validateBrandingFormData validates URLs, MIME types, file sizes, and bucket availability before admin creation', () => {
	const validForm = new FormData();
	validForm.set('org_url', 'https://example.com');
	validForm.set('public_content_base_url', 'https://decks.example.com/');
	validForm.set('logo_url', '/assets/logo.svg');
	validForm.set('favicon_url', 'https://example.com/favicon.png');
	validForm.set('logo_file', new File(['<svg></svg>'], 'logo.svg', { type: 'image/svg+xml' }));
	assert.deepEqual(validateBrandingFormData(validForm, true), { ok: true });

	const missingBucketRes = validateBrandingFormData(validForm, false);
	assert.equal(missingBucketRes.ok, false);
	assert.match(missingBucketRes.error, /Storage bucket is not configured/i);

	const badForm = new FormData();
	badForm.set('org_url', 'javascript:alert(1)');
	assert.equal(validateBrandingFormData(badForm, true).ok, false);
});

test('saveBrandingSettings rejects unsafe URLs, oversized files, and non-image MIME types', async () => {
	const { db, bucket } = createSettingsEnv();

	const badUrlForm = new FormData();
	badUrlForm.set('org_url', 'javascript:alert(1)');
	const badUrlRes = await saveBrandingSettings(db, bucket, badUrlForm);
	assert.equal(badUrlRes.ok, false);
	assert.match(badUrlRes.error, /Organization URL/i);

	const badMimeForm = new FormData();
	badMimeForm.set('logo_file', new File(['<html></html>'], 'evil.html', { type: 'text/html' }));
	const badMimeRes = await saveBrandingSettings(db, bucket, badMimeForm);
	assert.equal(badMimeRes.ok, false);
	assert.match(badMimeRes.error, /Logo file must be a PNG, JPEG, WebP, GIF, SVG, or ICO image/i);

	const oversizedBytes = new Uint8Array(2 * 1024 * 1024 + 1);
	const bigForm = new FormData();
	bigForm.set('favicon_file', new File([oversizedBytes], 'huge.png', { type: 'image/png' }));
	const bigRes = await saveBrandingSettings(db, bucket, bigForm);
	assert.equal(bigRes.ok, false);
	assert.match(bigRes.error, /2 MB/i);
});

test('handleBrandingAssetRequest serves /branding/logo and /branding/favicon with CSP and nosniff headers', async () => {
	const { db, bucket } = createSettingsEnv();
	const form = new FormData();
	form.set('logo_file', new File(['<svg>brand</svg>'], 'logo.svg', { type: 'image/svg+xml' }));
	await saveBrandingSettings(db, bucket, form);

	const getRes = await handleBrandingAssetRequest(
		new Request('https://decks.example.com/branding/logo?v=123', { method: 'GET' }),
		{ BUCKET: bucket }
	);
	assert.equal(getRes.status, 200);
	assert.equal(getRes.headers.get('Content-Type'), 'image/svg+xml');
	assert.equal(getRes.headers.get('X-Content-Type-Options'), 'nosniff');
	assert.equal(
		getRes.headers.get('Content-Security-Policy'),
		"default-src 'none'; style-src 'unsafe-inline'"
	);
	assert.equal(getRes.headers.get('Cache-Control'), 'public, max-age=3600');
	assert.equal(await getRes.text(), '<svg>brand</svg>');

	const headRes = await handleBrandingAssetRequest(
		new Request('https://decks.example.com/branding/logo', { method: 'HEAD' }),
		{ BUCKET: bucket }
	);
	assert.equal(headRes.status, 200);
	assert.equal(await headRes.text(), '');

	const missingRes = await handleBrandingAssetRequest(
		new Request('https://decks.example.com/branding/favicon', { method: 'GET' }),
		{ BUCKET: bucket }
	);
	assert.equal(missingRes.status, 404);

	const postRes = await handleBrandingAssetRequest(
		new Request('https://decks.example.com/branding/logo', { method: 'POST' }),
		{ BUCKET: bucket }
	);
	assert.equal(postRes.status, 405);
});

test('sanitizeHttpUrl and renderAccessDeniedHtml block javascript: URLs, escape HTML injection, and render faviconUrl', () => {
	assert.equal(sanitizeHttpUrl('javascript:alert(1)'), null);
	assert.equal(sanitizeHttpUrl('data:text/html,<script>alert(1)</script>'), null);
	assert.equal(sanitizeHttpUrl('/logo.svg', { allowRootRelative: false }), null);
	assert.equal(sanitizeHttpUrl('/logo.svg', { allowRootRelative: true }), '/logo.svg');
	assert.equal(sanitizeHttpUrl('//evil.example.com/logo.svg', { allowRootRelative: true }), null);

	const cfg = getBrandingConfig({
		APP_NAME: '<script>alert("xss")</script>',
		ORG_NAME: 'Bad "Org" & Co <img src=x onerror=alert(1)>',
		LOGO_URL: 'javascript:alert(1)',
		FAVICON_URL: '/branding/favicon?v=42',
	});
	const html = renderAccessDeniedHtml(cfg);
	assert.doesNotMatch(html, /<script>/);
	assert.doesNotMatch(html, /javascript:/);
	assert.match(html, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);
	assert.match(html, /Bad &quot;Org&quot; &amp; Co/);
	assert.match(html, /<link rel="icon" href="\/branding\/favicon\?v=42">/);
});
