# Unified Presentations & Admin Cloudflare Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single, white-label, open-source-ready Cloudflare Worker application in `/Users/jaron/src/rubensteinventures/artifact-manager` that combines the public R2 presentation viewer (`/`, `/content/{slug}/*`) and the Astro + Starwind admin application (`/admin/*`, `/admin/api/*`).

**Architecture:** A single Astro 7 server-rendered Cloudflare Worker (`@astrojs/cloudflare`) backed by D1 (`DB`), R2 (`BUCKET`), and KV (`SESSION`). `src/middleware.ts` intercepts `/content/*` requests to enforce optional per-presentation HTTP Basic Auth against D1 and stream files from R2 with `X-Frame-Options: SAMEORIGIN`, renders the white-labeled landing page at `/`, and enforces KV-backed admin sessions, CSRF guards, and `X-Frame-Options: DENY` across `/admin/*`.

**Tech Stack:** TypeScript, Astro 7 (`@astrojs/cloudflare` v14), Tailwind CSS v4 (`@tailwindcss/vite`), Starwind UI, `lucide-astro`, `bcryptjs`, `jszip` 3.10.2, Cloudflare Workers (D1, R2, KV), Node.js built-in test runner (`node --test`).

**Spec:** `/Users/jaron/src/rubensteinventures/artifact-manager/docs/superpowers/specs/2026-11-06-unified-presentations-worker-design.md`

## Global Constraints

- Zero references anywhere in the repository to `InnovAItion Partners`, `Rubenstein Ventures`, `innovaitionpartners.com`, `hubspotusercontent`, or private Cloudflare UUIDs (`911d2b94-2e1e-420b-aef0-ec16bdac5a15`, `2ef80afa62094235a683a4eaf59ffa01`, `674f4ecd29424e74ae471f8cfe7a1df2`).
- R2 bucket binding is `BUCKET`; D1 database binding is `DB`; KV session namespace binding is `SESSION`; Skill API secret is `SKILL_API_TOKEN`.
- Branding variables in `env` (`APP_NAME`, `ORG_NAME`, `ORG_URL`, `LOGO_URL`, `HERO_TITLE`, `HERO_SUBTITLE`, `PUBLIC_CONTENT_BASE_URL`) are optional and fall back to clean neutral defaults when unset or empty.
- Public routes (`/`, `/content/*`) must set `X-Frame-Options: SAMEORIGIN`; Admin routes (`/admin`, `/admin/*`) must set `X-Frame-Options: DENY`. Both set `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
- Never add `Co-Authored-By` trailers to git commit messages.

## Review Focus

- **Unsafe URL schemes or unescaped HTML in branding variables:** If `ORG_URL` or `LOGO_URL` is set to `javascript:alert(1)` or `ORG_NAME` / `APP_NAME` contains `<script>`, `getBrandingConfig` must reject unsafe URL schemes and `renderAccessDeniedHtml` must HTML-escape all interpolated strings (tested in Task 2).
- **Partial protection state ("Needs password" in D1 where `username` is non-empty and `password` is `NULL` or `""`):** Requests to `/content/{slug}/*` must return `401` with `WWW-Authenticate: Basic realm="Protected Content"` rather than treating the presentation as public (tested in Task 3).
- **Percent-encoded path traversal and Basic Auth edge cases on `/content/{slug}/*`:** Traversal attempts like `/content/deck/..%2fsecret/index.html` must return `400` before querying D1 or R2; malformed Base64 in `Authorization: Basic` must return `401` without throwing; visitor passwords containing colons (`p@ss:word:1!`) must authenticate via RFC 7617 first-colon split (tested in Task 3).
- **Cross-site CSRF mutation blocking on `/admin/*` vs Bearer Skill API exemption:** Browser mutations (`POST`, `PUT`, `DELETE`, `PATCH`) with `Sec-Fetch-Site: cross-site` or `same-site` to `/admin/*` and `/admin/api/*` must return `403`, except `/admin/api/v1/skill/*` which uses Bearer token auth (tested in Task 4).
- **Admin vs Public route isolation in unified middleware:** Unauthenticated requests to `/` or `/content/*` must never redirect to `/admin/login` and must return `X-Frame-Options: SAMEORIGIN`, while unauthenticated requests to `/admin` or `/admin/presentations/{slug}` must redirect (`302`) to `/admin/login` with `X-Frame-Options: DENY` (tested in Task 4).

---

### Task 1: Project Scaffolding, Wrangler & Astro Config, Starwind UI Components, and D1 Migrations

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `astro.config.mjs`
- Create: `wrangler.jsonc`
- Create: `.gitignore`
- Create: `starwind.config.json`
- Create: `src/env.d.ts`
- Create: `src/shims/fsevents-stub.js`
- Create: `src/styles/global.css`
- Create: `src/styles/starwind.css`
- Create: `public/favicon.svg`
- Create: `src/components/starwind/alert/Alert.astro`, `AlertDescription.astro`, `AlertTitle.astro`, `index.ts`
- Create: `src/components/starwind/button/Button.astro`, `index.ts`
- Create: `src/components/starwind/card/Card.astro`, `CardAction.astro`, `CardContent.astro`, `CardDescription.astro`, `CardFooter.astro`, `CardHeader.astro`, `CardTitle.astro`, `index.ts`
- Create: `src/components/starwind/checkbox/Checkbox.astro`, `index.ts`
- Create: `src/components/starwind/input/Input.astro`, `index.ts`
- Create: `src/components/starwind/table/Table.astro`, `TableBody.astro`, `TableCaption.astro`, `TableCell.astro`, `TableFoot.astro`, `TableHead.astro`, `TableHeader.astro`, `TableRow.astro`, `index.ts`
- Create: `migrations/0001_init.sql`
- Create: `migrations/0002_add_uploaded_at.sql`
- Create: `seed/local.sql`
- Create: `seed/README.md`
- Test: `tests/config.test.mjs`

**Interfaces:**
- Produces:
  - `Env` interface in `src/env.d.ts`:
    ```ts
    declare module 'cloudflare:workers' {
      interface Env {
        DB: D1Database;
        BUCKET: R2Bucket;
        SESSION: KVNamespace;
        SKILL_API_TOKEN?: string;
        APP_NAME?: string;
        ORG_NAME?: string;
        ORG_URL?: string;
        LOGO_URL?: string;
        HERO_TITLE?: string;
        HERO_SUBTITLE?: string;
        PUBLIC_CONTENT_BASE_URL?: string;
      }
    }
    ```
  - `package.json` scripts: `dev`, `build`, `preview`, `test` (`node --test tests/*.test.mjs`), `generate-types`, `db:migrate:local`, `db:seed:local`, `db:setup:local`.

- [ ] **Step 1: Initialize git repository (if not initialized) and write the failing configuration test in `tests/config.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('wrangler.jsonc configures DB, BUCKET, SESSION, and branding vars with safe placeholders', () => {
	const raw = fs.readFileSync(path.join(rootDir, 'wrangler.jsonc'), 'utf8');
	assert.match(raw, /"binding":\s*"DB"/);
	assert.match(raw, /"binding":\s*"BUCKET"/);
	assert.match(raw, /"binding":\s*"SESSION"/);
	assert.match(raw, /"APP_NAME"/);
	assert.doesNotMatch(raw, /SESSION_SECRET/);
	assert.doesNotMatch(raw, /single-page-application/);
	assert.doesNotMatch(raw, /911d2b94-2e1e-420b-aef0-ec16bdac5a15/);
	assert.doesNotMatch(raw, /2ef80afa62094235a683a4eaf59ffa01/);
	assert.doesNotMatch(raw, /innovaitionpartners/i);
});

test('D1 migrations define admins and presentations tables with uploaded_at', () => {
	const m1 = fs.readFileSync(path.join(rootDir, 'migrations/0001_init.sql'), 'utf8');
	const m2 = fs.readFileSync(path.join(rootDir, 'migrations/0002_add_uploaded_at.sql'), 'utf8');
	assert.match(m1, /CREATE TABLE IF NOT EXISTS admins/);
	assert.match(m1, /CREATE TABLE IF NOT EXISTS presentations/);
	assert.match(m2, /ALTER TABLE presentations ADD COLUMN uploaded_at TEXT/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/config.test.mjs`
Expected: FAIL with `ENOENT: no such file or directory, open '.../wrangler.jsonc'`

- [ ] **Step 3: Create scaffolding files, copy Starwind UI components/styles/migrations/seed from `presentations-manager-worker`, configure `wrangler.jsonc` with placeholder IDs (`00000000-0000-0000-0000-000000000000` for D1 and `YOUR_KV_NAMESPACE_ID` / `YOUR_PREVIEW_KV_NAMESPACE_ID` for KV) and documented `vars`, and run `npm install`**

In `wrangler.jsonc`, set `"name": "artifact-manager"`, `"compatibility_date": "2025-04-01"`, `"compatibility_flags": ["nodejs_compat"]`, `"workers_dev": false`, `"preview_urls": false`, bindings `DB`, `BUCKET`, `SESSION`, and default `vars`:
```jsonc
	"vars": {
		"APP_NAME": "Presentation Manager",
		"ORG_NAME": "",
		"ORG_URL": "",
		"LOGO_URL": "",
		"HERO_TITLE": "Interactive Presentations",
		"HERO_SUBTITLE": "Explore shared presentations and interactive decks.",
		"PUBLIC_CONTENT_BASE_URL": ""
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/config.test.mjs`
Expected: PASS (2 tests passing)

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json astro.config.mjs wrangler.jsonc starwind.config.json public/ src/env.d.ts src/shims/ src/styles/ src/components/ migrations/ seed/ tests/config.test.mjs
git commit -m "chore: scaffold unified Astro Cloudflare Worker project and migrations"
```

---

### Task 2: White-Label Branding Configuration & Core Crypto/Path Libraries

**Files:**
- Create: `src/lib/branding.ts`
- Create: `src/lib/r2-path.ts`
- Create: `src/lib/slug-username.ts`
- Create: `src/lib/corporate-passphrase.ts`
- Create: `src/lib/presentation-password.ts`
- Create: `src/lib/presentation-r2.ts`
- Test: `tests/branding.test.mjs`
- Test: `tests/crypto-and-paths.test.mjs`

**Interfaces:**
- Consumes: `Env` from `src/env.d.ts`, `package.json` (`version`).
- Produces:
  - `src/lib/branding.ts`:
    - `export type BrandingConfig = { appName: string; appVersion: string; orgName: string; orgUrl: string | null; logoUrl: string | null; heroTitle: string; heroSubtitle: string; publicContentBaseUrl: string; }`
    - `export function escapeHtml(str: string): string`
    - `export function sanitizeHttpUrl(raw: string | undefined | null, options?: { allowRootRelative?: boolean }): string | null`
    - `export function getBrandingConfig(env: Partial<Record<string, unknown>> | undefined, requestUrl?: URL | string): BrandingConfig`
    - `export function renderAccessDeniedHtml(branding: BrandingConfig): string`
  - `src/lib/presentation-password.ts`:
    - `export const VISITOR_PASSWORD_MIN_LENGTH = 12`
    - `export const MAX_PASSWORD_LENGTH = 256`
    - `export const VISITOR_PASSWORD_REQUIREMENTS_SUMMARY: string`
    - `export function isCorporatePassphraseVisitorPassword(password: string): boolean`
    - `export function getVisitorPasswordValidationError(password: string): string | null`
    - `export function isPbkdf2PresentationHash(stored: string): boolean`
    - `export function hashPresentationPassword(password: string): Promise<string>`
    - `export function verifyPresentationPassword(password: string, storedHash: string): Promise<boolean>`
    - `export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean`
    - `export function timingSafeEqualStrings(a: string, b: string): Promise<boolean>`
    - `export function parseBasicAuth(authHeader: string | null): { username: string; password: string } | null`
  - `src/lib/r2-path.ts`:
    - `export function normalizeContentRelativePath(raw: string): string | null`
    - `export function isValidPresentationObjectKey(slug: string, key: string): boolean`
  - `src/lib/slug-username.ts`:
    - `export function validatePresentationSlug(raw: string): SlugValidation`
    - `export function validatePublicUsername(raw: string): PublicUsernameValidation`
    - `export function isAllowedSlugParam(slug: string | undefined): boolean`
  - `src/lib/corporate-passphrase.ts`:
    - `export function generateCorporatePassphrase(): string`
  - `src/lib/presentation-r2.ts`:
    - `export const SKILL_API_MAX_FILES = 200`
    - `export const SKILL_API_MAX_DECODED_BYTES_PER_FILE = 15 * 1024 * 1024`
    - `export const ADMIN_UPLOAD_MAX_BYTES = 50 * 1024 * 1024`
    - `export function deleteAllUnderContentPrefix(bucket: R2Bucket, slug: string): Promise<void>`
    - `export function putPresentationFiles(bucket: R2Bucket, slug: string, files: SkillPresentationFileInput[]): Promise<PutFilesError | null>`

- [ ] **Step 1: Write the failing tests in `tests/branding.test.mjs` and `tests/crypto-and-paths.test.mjs`**

```javascript
// tests/branding.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBrandingConfig, renderAccessDeniedHtml, sanitizeHttpUrl } from '../src/lib/branding.ts';

test('getBrandingConfig returns neutral defaults when env vars are empty or unset', () => {
	const cfg = getBrandingConfig({}, 'https://decks.example.com/admin');
	assert.equal(cfg.appName, 'Presentation Manager');
	assert.equal(cfg.orgName, 'Presentation Manager');
	assert.equal(cfg.orgUrl, null);
	assert.equal(cfg.logoUrl, null);
	assert.equal(cfg.heroTitle, 'Interactive Presentations');
	assert.equal(cfg.heroSubtitle, 'Explore shared presentations and interactive decks.');
	assert.equal(cfg.publicContentBaseUrl, 'https://decks.example.com');
});

test('getBrandingConfig applies custom branding vars and strips trailing slash from PUBLIC_CONTENT_BASE_URL', () => {
	const cfg = getBrandingConfig(
		{
			APP_NAME: 'Acme Decks',
			ORG_NAME: 'Acme Corp',
			ORG_URL: 'https://acme.example.com',
			LOGO_URL: '/assets/logo.svg',
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
	assert.equal(cfg.publicContentBaseUrl, 'https://share.acme.example.com');
});

test('sanitizeHttpUrl and renderAccessDeniedHtml block javascript: URLs and escape HTML injection', () => {
	assert.equal(sanitizeHttpUrl('javascript:alert(1)'), null);
	assert.equal(sanitizeHttpUrl('data:text/html,<script>alert(1)</script>'), null);
	assert.equal(sanitizeHttpUrl('/logo.svg', { allowRootRelative: false }), null);
	assert.equal(sanitizeHttpUrl('/logo.svg', { allowRootRelative: true }), '/logo.svg');
	assert.equal(sanitizeHttpUrl('//evil.example.com/logo.svg', { allowRootRelative: true }), null);

	const cfg = getBrandingConfig({
		APP_NAME: '<script>alert("xss")</script>',
		ORG_NAME: 'Bad "Org" & Co <img src=x onerror=alert(1)>',
		LOGO_URL: 'javascript:alert(1)',
	});
	const html = renderAccessDeniedHtml(cfg);
	assert.doesNotMatch(html, /<script>/);
	assert.doesNotMatch(html, /javascript:/);
	assert.match(html, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);
	assert.match(html, /Bad &quot;Org&quot; &amp; Co/);
});
```

```javascript
// tests/crypto-and-paths.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
	hashPresentationPassword,
	verifyPresentationPassword,
	parseBasicAuth,
	timingSafeEqualStrings,
	getVisitorPasswordValidationError,
} from '../src/lib/presentation-password.ts';
import { normalizeContentRelativePath, isValidPresentationObjectKey } from '../src/lib/r2-path.ts';
import { generateCorporatePassphrase } from '../src/lib/corporate-passphrase.ts';

test('hashPresentationPassword and verifyPresentationPassword round-trip passwords including colons', async () => {
	const pw = 'p@ss:word:with:colons:123A';
	const hash = await hashPresentationPassword(pw);
	assert.equal(await verifyPresentationPassword(pw, hash), true);
	assert.equal(await verifyPresentationPassword('wrong-password', hash), false);
	assert.equal(await verifyPresentationPassword('a'.repeat(257), hash), false);
	assert.equal(await verifyPresentationPassword(pw, 'malformed-hash'), false);
	assert.equal(await verifyPresentationPassword(pw, '100000.c2FsdA==.c2hvcnQ='), false);
});

test('parseBasicAuth splits on first colon per RFC 7617 and rejects invalid base64', () => {
	const header = `Basic ${btoa('client-user:p@ss:word:123')}`;
	assert.deepEqual(parseBasicAuth(header), {
		username: 'client-user',
		password: 'p@ss:word:123',
	});
	assert.equal(parseBasicAuth('Basic !!!not-base64!!!'), null);
	assert.equal(parseBasicAuth('Bearer token'), null);
	assert.equal(parseBasicAuth(null), null);
});

test('generated corporate passphrase passes visitor password validation', () => {
	const phrase = generateCorporatePassphrase();
	assert.equal(getVisitorPasswordValidationError(phrase), null);
});

test('isValidPresentationObjectKey validates file and folder keys strictly under content/{slug}/', () => {
	assert.equal(isValidPresentationObjectKey('q1-deck', 'content/q1-deck/index.html'), true);
	assert.equal(isValidPresentationObjectKey('q1-deck', 'content/q1-deck/assets/icons/'), true);
	assert.equal(isValidPresentationObjectKey('q1-deck', 'content/other-deck/index.html'), false);
	assert.equal(isValidPresentationObjectKey('q1-deck', 'content/q1-deck/'), false);
	assert.equal(isValidPresentationObjectKey('q1-deck', 'content/q1-deck/../other/index.html'), false);
	assert.equal(normalizeContentRelativePath('../secret'), null);
});

test('timingSafeEqualStrings matches identical strings and rejects different strings', async () => {
	assert.equal(await timingSafeEqualStrings('acme-client', 'acme-client'), true);
	assert.equal(await timingSafeEqualStrings('acme-client', 'other-client'), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/branding.test.mjs tests/crypto-and-paths.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/branding.ts`

- [ ] **Step 3: Implement `src/lib/branding.ts`, `src/lib/presentation-password.ts`, `src/lib/r2-path.ts`, `src/lib/slug-username.ts`, `src/lib/corporate-passphrase.ts`, and `src/lib/presentation-r2.ts`**

In `src/lib/branding.ts`:
- Read `pkg.version` from `../../package.json` with `with { type: 'json' }` (or standard import supported by both Node 22+ and Vite). To ensure Node's native TS runner (`node --test`) works without import attribute issues, read `APP_VERSION = '1.0.0'` or load `package.json` via `createRequire` / constant synced with `package.json`.
- Implement `escapeHtml`, `sanitizeHttpUrl` (accepting only `http:` / `https:` via `new URL()`, plus single-slash root-relative `/path` when `allowRootRelative: true` and `!raw.startsWith('//')`), `getBrandingConfig`, and `renderAccessDeniedHtml(branding)` with clean neutral styling (system/Inter stack, optional `<img class="logo">` when `branding.logoUrl` is set, and escaped `branding.orgName` / `branding.appName`).
- In `src/lib/presentation-r2.ts`, use relative import `./r2-path.ts` (or `./r2-path`) so Node's native test runner can execute modules directly without needing Vite's `@/` alias resolver. Use relative `./...` imports across `src/lib/*.ts` for the same reason.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/branding.test.mjs tests/crypto-and-paths.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/branding.ts src/lib/presentation-password.ts src/lib/r2-path.ts src/lib/slug-username.ts src/lib/corporate-passphrase.ts src/lib/presentation-r2.ts tests/branding.test.mjs tests/crypto-and-paths.test.mjs
git commit -m "feat: add white-label branding helper and unified crypto/path libraries"
```

---

### Task 3: Public R2 Content Viewer (`src/lib/content-viewer.ts`) and Public Landing Page (`src/pages/index.astro`)

**Files:**
- Create: `src/lib/content-viewer.ts`
- Create: `src/pages/index.astro`
- Test: `tests/content-viewer.test.mjs`

**Interfaces:**
- Consumes:
  - `getBrandingConfig`, `renderAccessDeniedHtml` from `src/lib/branding.ts`
  - `parseBasicAuth`, `timingSafeEqualStrings`, `verifyPresentationPassword` from `src/lib/presentation-password.ts`
- Produces:
  - `src/lib/content-viewer.ts`:
    - `export function inferContentType(path: string): string`
    - `export function isSafeContentPath(pathname: string, slug: string): boolean`
    - `export function applyViewerSecurityHeaders(response: Response): Response`
    - `export function handleContentRequest(request: Request, env: { DB: D1Database; BUCKET: R2Bucket } & Record<string, unknown>): Promise<Response>`

- [ ] **Step 1: Write the failing test in `tests/content-viewer.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleContentRequest, applyViewerSecurityHeaders } from '../src/lib/content-viewer.ts';
import { hashPresentationPassword } from '../src/lib/presentation-password.ts';

function createMockEnv(options = {}) {
	const presentations = options.presentations ?? {};
	const r2Objects = options.r2Objects ?? {};
	return {
		...(options.vars ?? {}),
		DB: {
			prepare() {
				return {
					bind(slug) {
						return {
							async first() {
								if (options.throwDbError) {
									throw new Error('D1 connection timeout');
								}
								return presentations[slug] ?? null;
							},
						};
					},
				};
			},
		},
		BUCKET: {
			async get(key) {
				options.onR2Get?.(key);
				const obj = r2Objects[key];
				if (!obj) return null;
				return {
					body: obj.body,
					httpMetadata: obj.httpMetadata,
					etag: obj.etag,
					httpEtag: obj.httpEtag,
				};
			},
		},
	};
}

test('serves public presentation at /content/{slug}/ from R2 index.html with SAMEORIGIN and quoted ETag', async () => {
	const env = createMockEnv({
		presentations: {
			'demo-deck': { username: null, password: null },
		},
		r2Objects: {
			'content/demo-deck/index.html': {
				body: '<html>Public Deck</html>',
				httpMetadata: { contentType: 'text/html' },
				etag: 'raw-etag',
				httpEtag: '"raw-etag"',
			},
		},
	});

	const rawRes = await handleContentRequest(
		new Request('https://decks.example.com/content/demo-deck/'),
		env
	);
	const res = applyViewerSecurityHeaders(rawRes);
	assert.equal(res.status, 200);
	assert.equal(await res.text(), '<html>Public Deck</html>');
	assert.equal(res.headers.get('ETag'), '"raw-etag"');
	assert.equal(res.headers.get('X-Frame-Options'), 'SAMEORIGIN');
	assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
	assert.equal(res.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
});

test('authenticates protected presentation with Basic Auth (including colons in password) and rejects bad credentials', async () => {
	const pw = 'p@ss:word:with:colons!1A';
	const storedHash = await hashPresentationPassword(pw);
	const env = createMockEnv({
		vars: { ORG_NAME: 'Acme Studio' },
		presentations: {
			secret: { username: 'client', password: storedHash },
		},
		r2Objects: {
			'content/secret/index.html': {
				body: '<html>Secret Deck</html>',
				httpMetadata: { contentType: 'text/html' },
			},
		},
	});

	const unauthRes = await handleContentRequest(
		new Request('https://decks.example.com/content/secret/index.html'),
		env
	);
	assert.equal(unauthRes.status, 401);
	assert.equal(unauthRes.headers.get('WWW-Authenticate'), 'Basic realm="Protected Content"');
	const unauthHtml = await unauthRes.text();
	assert.match(unauthHtml, /Acme Studio/);
	assert.doesNotMatch(unauthHtml, /InnovAItion/i);

	const badBase64Res = await handleContentRequest(
		new Request('https://decks.example.com/content/secret/index.html', {
			headers: { Authorization: 'Basic !!!invalid!!!' },
		}),
		env
	);
	assert.equal(badBase64Res.status, 401);

	const okRes = await handleContentRequest(
		new Request('https://decks.example.com/content/secret/index.html', {
			headers: { Authorization: `Basic ${btoa(`client:${pw}`)}` },
		}),
		env
	);
	assert.equal(okRes.status, 200);
	assert.equal(await okRes.text(), '<html>Secret Deck</html>');
});

test('locks presentation (401) when username is set in D1 but password is null or empty ("Needs password" state)', async () => {
	const env = createMockEnv({
		presentations: {
			halfsetup: { username: 'client', password: null },
		},
		r2Objects: {
			'content/halfsetup/index.html': { body: '<html>Should Not Leak</html>' },
		},
	});

	const res = await handleContentRequest(
		new Request('https://decks.example.com/content/halfsetup/index.html'),
		env
	);
	assert.equal(res.status, 401);
	assert.equal(res.headers.get('WWW-Authenticate'), 'Basic realm="Protected Content"');
});

test('rejects percent-encoded path traversal with 400 before querying R2 and returns 503 on D1 error', async () => {
	let r2Queried = false;
	const env = createMockEnv({
		presentations: {
			publicdeck: { username: null, password: null },
		},
		onR2Get() {
			r2Queried = true;
		},
	});

	const traversalRes = await handleContentRequest(
		new Request('https://decks.example.com/content/publicdeck/..%2fsecret/index.html'),
		env
	);
	assert.equal(traversalRes.status, 400);
	assert.equal(r2Queried, false);

	const dbErrEnv = createMockEnv({ throwDbError: true });
	const dbErrRes = await handleContentRequest(
		new Request('https://decks.example.com/content/publicdeck/index.html'),
		dbErrEnv
	);
	assert.equal(dbErrRes.status, 503);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/content-viewer.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/content-viewer.ts`

- [ ] **Step 3: Implement `src/lib/content-viewer.ts` and `src/pages/index.astro`**

In `src/lib/content-viewer.ts`:
- Implement `inferContentType`, `isSafeContentPath`, `applyViewerSecurityHeaders` (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`), and `handleContentRequest(request, env)`.
- In `handleContentRequest`:
  - Validate slug and path via `isSafeContentPath` first; return `400 Invalid path` if invalid.
  - Query `env.DB.prepare('SELECT username, password FROM presentations WHERE slug = ?').bind(slug).first()`; return `503 Service Unavailable` on D1 exception.
  - If `!presentation`, return `401` with `WWW-Authenticate: Basic realm="Protected Content"` and `renderAccessDeniedHtml(branding)`.
  - If `presentation.username` is non-empty (`presentation.username.trim().length > 0`) or `presentation.password` is non-empty:
    - If `!presentation.username || !presentation.password`, return `401` (protects the "Needs password" partial state).
    - Otherwise parse Basic Auth and verify `timingSafeEqualStrings(parsedAuth.username, presentation.username)` and `verifyPresentationPassword(parsedAuth.password, presentation.password)`. On failure, return `401` with `WWW-Authenticate: Basic realm="Protected Content"` and `renderAccessDeniedHtml(branding)`.
  - Resolve `r2Key` (`content/${slug}/index.html` when `/^\/content\/[^/]+\/?$/` matches, else `url.pathname.slice(1)`), fetch from `env.BUCKET.get(r2Key)`, and return `200` with `Content-Type`, `Cache-Control`, and quoted `ETag`, or `404 Not Found`.

In `src/pages/index.astro`:
- Import `{ env } from 'cloudflare:workers'`, `../styles/global.css`, `{ Projector } from 'lucide-astro'`, and `{ getBrandingConfig } from '@/lib/branding'`.
- Render a clean, responsive white-label landing page with:
  - Header showing `branding.logoUrl` `<img>` if set (else `<Projector>` icon + `branding.orgName`), plus optional `<a href={branding.orgUrl}>Website</a>` when `branding.orgUrl` is present.
  - Hero section displaying `branding.heroTitle` and `branding.heroSubtitle`.
  - Footer displaying `© {new Date().getFullYear()} {branding.orgName}. All rights reserved.`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/content-viewer.test.mjs`
Expected: PASS (4 tests passing)

- [ ] **Step 5: Commit**

```bash
git add src/lib/content-viewer.ts src/pages/index.astro tests/content-viewer.test.mjs
git commit -m "feat: add R2 content viewer handler and white-label public landing page"
```

---

### Task 4: Admin Auth, Skill API Libraries, Unified Middleware (`src/middleware.ts`), and Admin API Routes

**Files:**
- Create: `src/lib/admin-auth.ts`
- Create: `src/lib/skill-api-auth.ts`
- Create: `src/lib/skill-api-request.ts`
- Create: `src/lib/skill-presentations-payload.ts`
- Create: `src/middleware.ts`
- Create: `src/pages/admin/logout.ts`
- Create: `src/pages/admin/api/logout.ts`
- Create: `src/pages/admin/api/generate-passphrase.ts`
- Create: `src/pages/admin/api/upload/[slug].ts`
- Create: `src/pages/admin/api/v1/skill/presentations/index.ts`
- Create: `src/pages/admin/api/v1/skill/presentations/[slug].ts`
- Test: `tests/security.test.mjs`

**Interfaces:**
- Consumes: `src/lib/content-viewer.ts`, `src/lib/presentation-r2.ts`, `src/lib/presentation-password.ts`, `src/lib/r2-path.ts`, `src/lib/slug-username.ts`, `src/lib/corporate-passphrase.ts`.
- Produces:
  - `src/lib/admin-auth.ts`:
    - `export function verifyAdminCredentials(username: string, password: string, storedHash: string | null | undefined): Promise<boolean>`
    - `export function checkLoginRateLimit(kv: RateLimitKV | undefined, clientIp: string): Promise<boolean>`
    - `export function recordFailedLoginAttempt(kv: RateLimitKV | undefined, clientIp: string): Promise<void>`
    - `export function clearLoginRateLimit(kv: RateLimitKV | undefined, clientIp: string): Promise<void>`
    - `export function isBlockedCrossSiteMutation(method: string, pathname: string, secFetchSite: string | null): boolean` (exempts `/admin/api/v1/skill/`)
    - `export function applyAdminSecurityHeaders(response: Response): Response` (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`)
  - `src/middleware.ts`:
    - `export const onRequest = defineMiddleware(async (context, next) => ...)`

- [ ] **Step 1: Write the failing test in `tests/security.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	verifyAdminCredentials,
	checkLoginRateLimit,
	recordFailedLoginAttempt,
	clearLoginRateLimit,
	LOGIN_MAX_FAILED_ATTEMPTS,
	isBlockedCrossSiteMutation,
	applyAdminSecurityHeaders,
} from '../src/lib/admin-auth.ts';
import { verifySkillApiBearer } from '../src/lib/skill-api-auth.ts';
import { parseCreateSkillPresentationBody } from '../src/lib/skill-presentations-payload.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('verifyAdminCredentials performs async bcrypt comparison including dummy hash fallback for unknown users', async () => {
	const knownHash = '$2b$10$5lT6NLQxxB8OOC6uYU/3AeF1Q1/VWyzC.w0DX8Q/iujyBb6GrT8oy';
	assert.equal(await verifyAdminCredentials('testadmin', 'testpass123', knownHash), true);
	assert.equal(await verifyAdminCredentials('testadmin', 'wrongpass', knownHash), false);
	assert.equal(await verifyAdminCredentials('unknown-user', 'testpass123', null), false);
	assert.equal(await verifyAdminCredentials('', 'testpass123', knownHash), false);
	assert.equal(await verifyAdminCredentials('testadmin', '', knownHash), false);
});

test('KV login rate limiter blocks after LOGIN_MAX_FAILED_ATTEMPTS and clears on success', async () => {
	const store = new Map();
	const mockKv = {
		async get(key) {
			return store.get(key) ?? null;
		},
		async put(key, value) {
			store.set(key, value);
		},
		async delete(key) {
			store.delete(key);
		},
	};

	const ip = '203.0.113.42';
	for (let i = 0; i < LOGIN_MAX_FAILED_ATTEMPTS; i++) {
		assert.equal(await checkLoginRateLimit(mockKv, ip), false);
		await recordFailedLoginAttempt(mockKv, ip);
	}
	assert.equal(await checkLoginRateLimit(mockKv, ip), true);

	await clearLoginRateLimit(mockKv, ip);
	assert.equal(await checkLoginRateLimit(mockKv, ip), false);
});

test('isBlockedCrossSiteMutation blocks cross-site and sibling-subdomain mutations on /admin/* while exempting /admin/api/v1/skill/*', () => {
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/presentations/q1', 'cross-site'), true);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/presentations/q1', 'same-site'), true);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/api/upload/q1', 'same-site'), true);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/api/logout', 'cross-site'), true);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/logout', 'cross-site'), true);

	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/presentations/q1', 'same-origin'), false);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/presentations/q1', 'none'), false);
	assert.equal(isBlockedCrossSiteMutation('POST', '/admin/presentations/q1', null), false);
	assert.equal(isBlockedCrossSiteMutation('GET', '/admin/presentations/q1', 'cross-site'), false);
	assert.equal(
		isBlockedCrossSiteMutation('POST', '/admin/api/v1/skill/presentations', 'cross-site'),
		false
	);
	assert.equal(
		isBlockedCrossSiteMutation('PUT', '/admin/api/v1/skill/presentations/q1', 'cross-site'),
		false
	);
});

test('applyAdminSecurityHeaders sets X-Frame-Options: DENY, nosniff, and strict-origin-when-cross-origin', () => {
	const res = applyAdminSecurityHeaders(new Response('ok'));
	assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
	assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
	assert.equal(res.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
});

test('verifySkillApiBearer and parseCreateSkillPresentationBody validate Bearer token and payload', async () => {
	const req = new Request('https://example.com/admin/api/v1/skill/presentations', {
		headers: { Authorization: 'Bearer secret-token-123' },
	});
	assert.equal(await verifySkillApiBearer(req, 'secret-token-123'), true);
	assert.equal(await verifySkillApiBearer(req, 'wrong-token'), false);
	assert.equal(await verifySkillApiBearer(req, undefined), false);

	const parsed = await parseCreateSkillPresentationBody({
		slug: 'demo-deck',
		name: 'Demo Deck',
		access: { mode: 'public' },
		files: [{ path: 'index.html', data: btoa('<html></html>'), contentType: 'text/html' }],
	});
	assert.equal(parsed.ok, true);
});

test('middleware.ts routes /content/* to content-viewer with SAMEORIGIN and gates /admin/* with DENY and /admin/login redirects', () => {
	const middlewareSrc = fs.readFileSync(path.join(rootDir, 'src/middleware.ts'), 'utf8');
	assert.match(middlewareSrc, /handleContentRequest/);
	assert.match(middlewareSrc, /applyViewerSecurityHeaders/);
	assert.match(middlewareSrc, /applyAdminSecurityHeaders/);
	assert.match(middlewareSrc, /\/admin\/login/);
	assert.match(middlewareSrc, /\/admin\/api\//);

	const uploadSrc = fs.readFileSync(
		path.join(rootDir, 'src/pages/admin/api/upload/[slug].ts'),
		'utf8'
	);
	assert.match(uploadSrc, /ADMIN_UPLOAD_MAX_BYTES/);
	assert.match(uploadSrc, /status:\s*413/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/security.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/admin-auth.ts`

- [ ] **Step 3: Implement `src/lib/admin-auth.ts`, `src/lib/skill-api-auth.ts`, `src/lib/skill-api-request.ts`, `src/lib/skill-presentations-payload.ts`, `src/middleware.ts`, and the `/admin/api/*` + `/admin/logout` endpoints**

Key implementation details:
- In `src/lib/admin-auth.ts`:
  - `isBlockedCrossSiteMutation` exempts `pathname.startsWith('/admin/api/v1/skill/')`.
  - Export `applyAdminSecurityHeaders(response: Response): Response` setting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- In `src/middleware.ts`:
  - Import `env` from `cloudflare:workers`, `defineMiddleware` from `astro:middleware`, `handleContentRequest` and `applyViewerSecurityHeaders` from `@/lib/content-viewer`, and `isBlockedCrossSiteMutation` and `applyAdminSecurityHeaders` from `@/lib/admin-auth`.
  - If `pathname === '/content' || pathname.startsWith('/content/')`: return `applyViewerSecurityHeaders(await handleContentRequest(context.request, env as any))`.
  - If `pathname === '/admin' || pathname.startsWith('/admin/')`:
    - Normalize trailing slash for `/admin/` -> treat `/admin` and `/admin/` as the dashboard, `/admin/login` and `/admin/login/` as login.
    - Check `isBlockedCrossSiteMutation(context.request.method, pathname, context.request.headers.get('Sec-Fetch-Site'))`; if blocked, return `applyAdminSecurityHeaders(new Response('Forbidden: cross-origin request blocked.', { status: 403 }))`.
    - If `pathname.startsWith('/admin/api/')`: return `applyAdminSecurityHeaders(await next())`.
    - Check `const adminUsername = await context.session?.get('adminUsername')`.
    - Dual logout support: if `pathname === '/admin/logout'` and `context.request.method === 'POST'`, let it proceed to `src/pages/admin/logout.ts` (or if unauthenticated, redirect to `/admin/login`).
    - If `(!adminUsername || typeof adminUsername !== 'string') && pathname !== '/admin/login'`: return `applyAdminSecurityHeaders(context.redirect('/admin/login'))`.
    - If `adminUsername && pathname === '/admin/login'`: return `applyAdminSecurityHeaders(context.redirect('/admin'))`.
    - Return `applyAdminSecurityHeaders(await next())`.
  - For all other routes (`/`, `/favicon.svg`, Astro client assets): return `applyViewerSecurityHeaders(await next())`.
- In `src/pages/admin/logout.ts` and `src/pages/admin/api/logout.ts`:
  - Destroy session (`session?.destroy()`) and `return redirect('/admin/login')`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/security.test.mjs`
Expected: PASS (6 tests passing)

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-auth.ts src/lib/skill-api-auth.ts src/lib/skill-api-request.ts src/lib/skill-presentations-payload.ts src/middleware.ts src/pages/admin/logout.ts src/pages/admin/api/ tests/security.test.mjs
git commit -m "feat: add unified middleware, admin auth, and /admin/api endpoints"
```

---

### Task 5: Admin UI Layout & Pages (`AdminLayout.astro`, `/admin/login`, `/admin`, `/admin/presentations/[slug]`)

**Files:**
- Create: `src/layouts/AdminLayout.astro`
- Create: `src/pages/admin/login.astro`
- Create: `src/pages/admin/index.astro`
- Create: `src/pages/admin/presentations/[slug].astro`
- Test: `tests/admin-pages.test.mjs`

**Interfaces:**
- Consumes: `getBrandingConfig` from `@/lib/branding`, `validatePresentationSlug`, `validatePublicUsername`, `isAllowedSlugParam` from `@/lib/slug-username`, `hashPresentationPassword`, `isPbkdf2PresentationHash`, `getVisitorPasswordValidationError`, `VISITOR_PASSWORD_MIN_LENGTH`, `VISITOR_PASSWORD_REQUIREMENTS_SUMMARY` from `@/lib/presentation-password`, `deleteAllUnderContentPrefix` from `@/lib/presentation-r2`, `normalizeContentRelativePath`, `isValidPresentationObjectKey` from `@/lib/r2-path`, `verifyAdminCredentials`, `checkLoginRateLimit`, `recordFailedLoginAttempt`, `clearLoginRateLimit`, `getClientIp` from `@/lib/admin-auth`.
- Produces:
  - Server-rendered Astro pages for `/admin`, `/admin/login`, and `/admin/presentations/[slug]`.

- [ ] **Step 1: Write the failing test in `tests/admin-pages.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('AdminLayout, login, dashboard, and presentation detail pages use /admin/* routes and getBrandingConfig', () => {
	const layout = fs.readFileSync(path.join(rootDir, 'src/layouts/AdminLayout.astro'), 'utf8');
	assert.match(layout, /href="\/admin"/);
	assert.match(layout, /action="\/admin\/api\/logout"/);
	assert.match(layout, /getBrandingConfig/);

	const login = fs.readFileSync(path.join(rootDir, 'src/pages/admin/login.astro'), 'utf8');
	assert.match(login, /Astro\.redirect\('\/admin'\)/);

	const dashboard = fs.readFileSync(path.join(rootDir, 'src/pages/admin/index.astro'), 'utf8');
	assert.match(dashboard, /Astro\.redirect\(`\/admin\/presentations\/\$\{slugCheck\.slug\}`\)/);
	assert.match(dashboard, /href=\{`\/admin\/presentations\/\$\{p\.slug\}`\}/);
	assert.match(dashboard, /getBrandingConfig/);

	const slugPage = fs.readFileSync(
		path.join(rootDir, 'src/pages/admin/presentations/[slug].astro'),
		'utf8'
	);
	assert.match(slugPage, /Astro\.redirect\('\/admin'\)/);
	assert.match(slugPage, /Astro\.redirect\(`\/admin\/presentations\/\$\{slug\}`\)/);
	assert.match(slugPage, /href="\/admin"/);
	assert.match(slugPage, /fetch\(`\/admin\/api\/upload\/\$\{slug\}`/);
	assert.match(slugPage, /fetch\('\/admin\/api\/generate-passphrase'\)/);
	assert.match(
		slugPage,
		/src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/3\.10\.2\/jszip\.min\.js"/
	);
	assert.match(
		slugPage,
		/integrity="sha512-\/ICos1xr6gGjsbC2d7Z6D0hmKAnNbkCv5Pp803Q75xgHowbEcgI4CVOHMHUux\/ZorCuod6dzuJOjfNoCKV0tRw=="/
	);
	assert.match(slugPage, /crossorigin="anonymous"/);
	assert.match(slugPage, /referrerpolicy="no-referrer"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/admin-pages.test.mjs`
Expected: FAIL with `ENOENT: no such file or directory, open '.../src/layouts/AdminLayout.astro'`

- [ ] **Step 3: Implement `src/layouts/AdminLayout.astro`, `src/pages/admin/login.astro`, `src/pages/admin/index.astro`, and `src/pages/admin/presentations/[slug].astro`**

Key updates from `presentations-manager-worker`:
- `src/layouts/AdminLayout.astro`:
  - Call `const branding = getBrandingConfig(env as unknown as Record<string, unknown>, Astro.url);`.
  - Navbar brand link points to `href="/admin"`. If `branding.logoUrl` is set, render `<img src={branding.logoUrl} alt={branding.appName} class="h-8 w-auto shrink-0" />`, else `<Projector class="h-8 w-8 shrink-0 text-slate-900" aria-hidden="true" />`, alongside `<span>{branding.appName}</span>`.
  - Logout form posts to `action="/admin/api/logout"`.
  - Footer renders `{branding.appName} · v{branding.appVersion}`.
- `src/pages/admin/login.astro`:
  - On valid login, `return Astro.redirect('/admin')`.
- `src/pages/admin/index.astro`:
  - Call `const branding = getBrandingConfig(env as unknown as Record<string, unknown>, Astro.url);`.
  - On presentation creation, `return Astro.redirect(\`/admin/presentations/\${slugCheck.slug}\`)`.
  - Manage button links to `href={\`/admin/presentations/\${p.slug}\`}`.
  - View button links to `href={\`\${branding.publicContentBaseUrl}/content/\${p.slug}/\`}`.
- `src/pages/admin/presentations/[slug].astro`:
  - Call `const branding = getBrandingConfig(env as unknown as Record<string, unknown>, Astro.url);`.
  - Redirect invalid/missing slug or deleted presentation to `Astro.redirect('/admin')`.
  - Redirect all form updates to `Astro.redirect(\`/admin/presentations/\${slug}\`)`.
  - Back button links to `href="/admin"`.
  - `publicPresentationViewUrl` and `publicFileUrl` use `branding.publicContentBaseUrl`.
  - Client-side `uploadFile` posts to `/admin/api/upload/${slug}`.
  - Client-side `generateVisitorPassphrase` fetches `/admin/api/generate-passphrase`.

- [ ] **Step 4: Run test and Astro build to verify everything compiles and passes**

Run: `node --test tests/admin-pages.test.mjs && npm run build`
Expected: PASS and `astro build` completes with exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/AdminLayout.astro src/pages/admin/login.astro src/pages/admin/index.astro src/pages/admin/presentations/ tests/admin-pages.test.mjs
git commit -m "feat: add white-labeled /admin layout, login, dashboard, and presentation manager pages"
```

---

### Task 6: Operational Scripts, Bundled Agent Skill, New Cloudflare Account Setup Documentation, and Zero-Branding Verification

**Files:**
- Create: `scripts/backfill-presentation-dates.js`
- Create: `skills/presentations-manager/SKILL.md`
- Create: `skills/presentations-manager/scripts/update_presentation.js`
- Create: `docs/admin_setup.md`
- Create: `docs/skill-api-runbook.md`
- Create: `README.md`
- Test: `tests/zero-branding-and-docs.test.mjs`

**Interfaces:**
- Produces:
  - `skills/presentations-manager/scripts/update_presentation.js` calling `${ORIGIN}/admin/api/v1/skill/presentations/${slug}`
  - Complete operator and new-Cloudflare-account onboarding documentation in `README.md`, `docs/admin_setup.md`, and `docs/skill-api-runbook.md`.

- [ ] **Step 1: Write the failing test in `tests/zero-branding-and-docs.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.astro', '.wrangler']);

function walkFiles(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (IGNORED_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walkFiles(full, out);
		} else {
			out.push(full);
		}
	}
	return out;
}

test('entire repository contains zero proprietary branding or legacy Cloudflare resource IDs', () => {
	const forbiddenPatterns = [
		/innovaition/i,
		/rubenstein/i,
		/hubspotusercontent/i,
		/49211790/,
		/911d2b94-2e1e-420b-aef0-ec16bdac5a15/,
		/2ef80afa62094235a683a4eaf59ffa01/,
		/674f4ecd29424e74ae471f8cfe7a1df2/,
	];

	const allFiles = walkFiles(rootDir).filter(
		(f) => !f.endsWith('tests/zero-branding-and-docs.test.mjs') && !f.endsWith('tests/config.test.mjs') && !f.includes('docs/superpowers/')
	);

	for (const file of allFiles) {
		const content = fs.readFileSync(file, 'utf8');
		for (const pattern of forbiddenPatterns) {
			assert.doesNotMatch(
				content,
				pattern,
				`Forbidden pattern ${pattern} found in ${path.relative(rootDir, file)}`
			);
		}
	}
});

test('README.md documents new Cloudflare account setup, branding variables, and /admin/api/v1/skill paths', () => {
	const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
	assert.match(readme, /wrangler d1 create/);
	assert.match(readme, /wrangler r2 bucket create/);
	assert.match(readme, /wrangler kv namespace create/);
	assert.match(readme, /wrangler d1 migrations apply/);
	assert.match(readme, /APP_NAME/);
	assert.match(readme, /ORG_NAME/);
	assert.match(readme, /LOGO_URL/);
	assert.match(readme, /PUBLIC_CONTENT_BASE_URL/);
	assert.match(readme, /\/admin\/api\/v1\/skill\/presentations/);

	const skillScript = fs.readFileSync(
		path.join(rootDir, 'skills/presentations-manager/scripts/update_presentation.js'),
		'utf8'
	);
	assert.match(skillScript, /\/admin\/api\/v1\/skill\/presentations\//);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/zero-branding-and-docs.test.mjs`
Expected: FAIL with `ENOENT: no such file or directory, open '.../README.md'`

- [ ] **Step 3: Create `scripts/backfill-presentation-dates.js`, `skills/presentations-manager/SKILL.md`, `skills/presentations-manager/scripts/update_presentation.js`, `docs/admin_setup.md`, `docs/skill-api-runbook.md`, and `README.md`**

Ensure `README.md` includes a comprehensive **Setting Up on a New Cloudflare Account** section covering:
1. Prerequisites & installing dependencies (`npm install`, `npx wrangler login`).
2. Step 1: Create the Cloudflare D1 Database (`npx wrangler d1 create presentations_db`) and copy `database_id` into `wrangler.jsonc`.
3. Step 2: Create the Cloudflare R2 Bucket (`npx wrangler r2 bucket create presentation-content`) and confirm `bucket_name` in `wrangler.jsonc`.
4. Step 3: Create the Cloudflare KV Namespace for Admin Sessions (`npx wrangler kv namespace create SESSION` and `npx wrangler kv namespace create SESSION --preview`) and copy `id` and `preview_id` into `wrangler.jsonc`.
5. Step 4: Apply Database Migrations (`npx wrangler d1 migrations apply presentations_db --remote` for production, or `npm run db:setup:local` for local development).
6. Step 5: Create Your First Admin Account (generating a bcrypt cost-10 hash and inserting into `admins` in D1).
7. Step 6: Configure Branding & Environment Variables (`APP_NAME`, `ORG_NAME`, `ORG_URL`, `LOGO_URL`, `HERO_TITLE`, `HERO_SUBTITLE`, `PUBLIC_CONTENT_BASE_URL` in `wrangler.jsonc` `vars` or the Cloudflare dashboard).
8. Step 7: Optional Skill API Token (`npx wrangler secret put SKILL_API_TOKEN` or `.dev.vars`) and usage of `POST /admin/api/v1/skill/presentations` and `PUT /admin/api/v1/skill/presentations/{slug}`.
9. Step 8: Deploy & Attach a Custom Domain / Route (`npm run build && npx wrangler deploy`).

- [ ] **Step 4: Run the full test suite and production build**

Run: `npm test && npm run build`
Expected: All test files pass with 0 failures and `astro build` succeeds.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/admin_setup.md docs/skill-api-runbook.md scripts/ skills/ tests/zero-branding-and-docs.test.mjs
git commit -m "docs: add new Cloudflare account setup guide, white-label skill docs, and branding audit tests"
```
