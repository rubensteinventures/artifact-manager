# First-Run Branding Setup, `/admin/settings`, and Unified Initial Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all D1 schema tables (`admins`, `presentations`, `settings`) into a single `migrations/0001_init.sql`, remove default `"vars"` from `wrangler.jsonc`, and allow administrators to configure branding settings and upload a custom logo and favicon during `/admin/setup` or at `/admin/settings` while preserving environment variable overrides.

**Architecture:** Store branding text and URLs in a singleton D1 `settings` row (`id = 1`) and store uploaded logo/favicon binaries in R2 (`BUCKET`) under keys `_branding/logo` and `_branding/favicon`, served at `/branding/logo` and `/branding/favicon`. Resolve branding on every page using strict precedence: non-empty environment variable (`APP_NAME`, `ORG_NAME`, `ORG_URL`, `LOGO_URL`, `FAVICON_URL`, `HERO_TITLE`, `HERO_SUBTITLE`, `PUBLIC_CONTENT_BASE_URL`) → D1 `settings` row → built-in defaults (`Presentation Manager`, `/favicon.svg`, etc.).

**Tech Stack:** Astro 6 (SSR on Cloudflare Workers), Cloudflare D1 (SQLite), Cloudflare R2, TypeScript, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-06-branding-setup-and-settings-design.md`

## Global Constraints

- Single D1 migration `migrations/0001_init.sql` defining `admins`, `presentations` (with `uploaded_at TEXT`), and `settings` (`id INTEGER PRIMARY KEY CHECK (id = 1)`); `migrations/0002_add_uploaded_at.sql` must be removed.
- Remove `"vars"` from `wrangler.jsonc` so database-saved settings are not masked by hardcoded strings in `wrangler.jsonc`.
- Precedence for every branding field: **Non-empty Environment Variable** → **D1 `settings` row (`id = 1`)** → **Built-in Default**.
- Uploaded logo and favicon files (`logo_file`, `favicon_file`) must be `<= 2 * 1024 * 1024` bytes (`2 MiB`) and restricted to allowed image MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`, `image/x-icon`, `image/vnd.microsoft.icon`.
- `/branding/logo` and `/branding/favicon` responses must include `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `X-Content-Type-Options: nosniff`, and `Cache-Control: public, max-age=3600`.
- Starwind Astro components must use `class="..."` (never `className="..."`).

## Review Focus

- Empty file inputs (`size === 0` when a browser submits `<input type="file">` with no file selected) must be ignored rather than treated as an invalid upload or overwriting existing R2 assets.
- Unsafe URL schemes (`javascript:`, `data:`, `//evil.example.com`) submitted via `org_url`, `logo_url`, `favicon_url`, or `public_content_base_url` in `/admin/setup` or `/admin/settings` must be rejected with a clear validation error before saving to D1.
- Uploaded SVG logos/favicons served from `/branding/logo` or `/branding/favicon` must include `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` and `X-Content-Type-Options: nosniff` so embedded scripts cannot execute if opened directly.
- When `ORG_NAME` is not set in either env vars or D1 `settings`, `orgName` must default to the resolved `appName` (including a D1-configured `app_name`).
- Clearing a custom logo (`clear_logo=1`) or favicon (`clear_favicon=1`) in `/admin/settings` must delete the R2 object (`_branding/logo` or `_branding/favicon`) and set the D1 column (`logo_url` or `favicon_url`) to `NULL`.

---

### Task 1: Collapse D1 Migrations into `0001_init.sql` and Remove `wrangler.jsonc` Default `"vars"`

**Files:**
- Modify: `migrations/0001_init.sql`
- Delete: `migrations/0002_add_uploaded_at.sql`
- Modify: `wrangler.jsonc`
- Test: `tests/config.test.mjs`

**Interfaces:**
- Consumes: none
- Produces:
  - `migrations/0001_init.sql` with tables `admins`, `presentations` (including `uploaded_at TEXT`), and `settings` (`id INTEGER PRIMARY KEY CHECK (id = 1)`, `app_name`, `org_name`, `org_url`, `logo_url`, `favicon_url`, `hero_title`, `hero_subtitle`, `public_content_base_url`, `updated_at`)
  - `wrangler.jsonc` without `"vars"`

- [ ] **Step 1: Update `tests/config.test.mjs` with failing assertions for single migration and `"vars"` removal**

```js
test('wrangler.jsonc configures DB, BUCKET, and SESSION without hardcoded vars block', () => {
	const raw = fs.readFileSync(path.join(rootDir, 'wrangler.jsonc'), 'utf8');
	assert.match(raw, /"binding":\s*"DB"/);
	assert.match(raw, /"binding":\s*"BUCKET"/);
	assert.match(raw, /"binding":\s*"SESSION"/);
	assert.match(raw, /"workers_dev":\s*true/);
	assert.doesNotMatch(raw, /"vars"\s*:/);
	assert.doesNotMatch(raw, /YOUR_PREVIEW_KV_NAMESPACE_ID/);
	assert.doesNotMatch(raw, /SESSION_SECRET/);
	assert.doesNotMatch(raw, /single-page-application/);
	assert.doesNotMatch(raw, /911d2b94-2e1e-420b/);
	assert.doesNotMatch(raw, /2ef80afa62094235/);
	assert.doesNotMatch(raw, /innovaitionpartners/i);
});

test('single D1 migration 0001_init.sql defines admins, presentations (with uploaded_at), and settings tables', () => {
	const migrationsDir = path.join(rootDir, 'migrations');
	const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
	assert.deepEqual(files, ['0001_init.sql']);

	const m1 = fs.readFileSync(path.join(migrationsDir, '0001_init.sql'), 'utf8');
	assert.match(m1, /CREATE TABLE IF NOT EXISTS admins/);
	assert.match(m1, /CREATE TABLE IF NOT EXISTS presentations/);
	assert.match(m1, /uploaded_at TEXT/);
	assert.match(m1, /CREATE TABLE IF NOT EXISTS settings/);
	assert.match(m1, /favicon_url TEXT/);
});
```

- [ ] **Step 2: Run `node --test tests/config.test.mjs` to verify it fails**

Run: `node --test tests/config.test.mjs`
Expected: FAIL (`"vars"` still present in `wrangler.jsonc` and `0002_add_uploaded_at.sql` still exists)

- [ ] **Step 3: Collapse migrations into `migrations/0001_init.sql`, delete `migrations/0002_add_uploaded_at.sql`, and remove `"vars"` from `wrangler.jsonc`**

Update `migrations/0001_init.sql` to match the spec's exact schema (`admins`, `presentations` with `uploaded_at TEXT`, and `settings` with `id INTEGER PRIMARY KEY CHECK (id = 1)`), remove `migrations/0002_add_uploaded_at.sql`, and remove the `"vars"` block from `wrangler.jsonc`.

- [ ] **Step 4: Run `node --test tests/config.test.mjs` to verify it passes**

Run: `node --test tests/config.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit Task 1**

```bash
git add migrations/ wrangler.jsonc tests/config.test.mjs
git commit -m "feat: consolidate D1 schema into 0001_init.sql and remove default vars from wrangler.jsonc"
```

---

### Task 2: D1 Branding Settings, Precedence, R2 Logo/Favicon Upload, and `/branding/*` Asset Handler

**Files:**
- Modify: `src/lib/branding.ts`
- Modify: `src/lib/content-viewer.ts`
- Test: `tests/branding.test.mjs`

**Interfaces:**
- Consumes: `settings` table schema from Task 1 (`app_name`, `org_name`, `org_url`, `logo_url`, `favicon_url`, `hero_title`, `hero_subtitle`, `public_content_base_url`, `updated_at`)
- Produces in `src/lib/branding.ts`:
  - `DEFAULT_FAVICON_URL = '/favicon.svg'`
  - `MAX_BRANDING_ASSET_BYTES = 2 * 1024 * 1024`
  - `ALLOWED_BRANDING_MIME_TYPES: readonly string[]`
  - `DbBrandingSettings` type (`app_name?: string | null`, `org_name?: string | null`, `org_url?: string | null`, `logo_url?: string | null`, `favicon_url?: string | null`, `hero_title?: string | null`, `hero_subtitle?: string | null`, `public_content_base_url?: string | null`, `updated_at?: string | null`)
  - `BrandingEnvOverrides` type (`appName: boolean`, `orgName: boolean`, `orgUrl: boolean`, `logoUrl: boolean`, `faviconUrl: boolean`, `heroTitle: boolean`, `heroSubtitle: boolean`, `publicContentBaseUrl: boolean`)
  - `BrandingConfig` extended with `faviconUrl: string`, `configuredPublicContentBaseUrl: string | null`, and `envOverrides: BrandingEnvOverrides`
  - `getBrandingConfig(env?: Partial<Record<string, unknown>>, requestUrl?: URL | string, dbSettings?: DbBrandingSettings | null): BrandingConfig`
  - `loadBrandingConfig(env?: Partial<Record<string, unknown>> & { DB?: D1Database }, requestUrl?: URL | string): Promise<BrandingConfig>`
  - `saveBrandingSettings(db: D1Database, bucket: R2Bucket | undefined, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`
  - `handleBrandingAssetRequest(request: Request, env: { BUCKET?: R2Bucket }): Promise<Response>`

- [ ] **Step 1: Add failing tests in `tests/branding.test.mjs` for precedence, uploads, clearing, URL validation, and `/branding/*` serving**

Add tests in `tests/branding.test.mjs` verifying:
1. `getBrandingConfig` defaults `faviconUrl` to `'/favicon.svg'`, resolves `dbSettings` when `env` vars are unset, defaults `orgName` to D1 `app_name` when `org_name` is unset, and lets non-empty `env` vars override `dbSettings` with accurate `envOverrides` booleans.
2. `loadBrandingConfig` reads `SELECT * FROM settings WHERE id = 1` from `env.DB` and falls back cleanly if `env.DB` is missing or throws.
3. `saveBrandingSettings` validates text/URLs (rejecting `javascript:` or invalid URLs), ignores empty 0-byte `File` inputs, rejects oversized (`> 2 MiB`) or disallowed MIME type uploads (e.g. `text/html`), stores valid `logo_file` and `favicon_file` in `BUCKET` at `_branding/logo` and `_branding/favicon` with `httpMetadata.contentType`, sets `/branding/logo?v=...` and `/branding/favicon?v=...` in D1 `settings`, and supports `clear_logo='1'` / `clear_favicon='1'` (deleting from R2 and clearing the URL in D1).
4. `handleBrandingAssetRequest` serves `GET` and `HEAD` for `/branding/logo` and `/branding/favicon` with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `X-Content-Type-Options: nosniff`, and `Cache-Control: public, max-age=3600`, returns `405` for `POST`, and returns `404` when absent.
5. `renderAccessDeniedHtml` includes `<link rel="icon" href="...">` with the escaped `branding.faviconUrl`.

- [ ] **Step 2: Run `node --test tests/branding.test.mjs` to verify it fails**

Run: `node --test tests/branding.test.mjs`
Expected: FAIL (`loadBrandingConfig`, `saveBrandingSettings`, `handleBrandingAssetRequest`, and `faviconUrl` not implemented yet)

- [ ] **Step 3: Implement `loadBrandingConfig`, `saveBrandingSettings`, `handleBrandingAssetRequest`, and `faviconUrl` in `src/lib/branding.ts` and update `src/lib/content-viewer.ts` to call `await loadBrandingConfig(env, url)`**

In `src/lib/branding.ts`:
- Resolve each field in order: `env` (if non-empty and valid) → `dbSettings` (if non-empty and valid) → built-in default (`DEFAULT_APP_NAME`, `appName` for `orgName`, `null` for `orgUrl`/`logoUrl`, `DEFAULT_FAVICON_URL = '/favicon.svg'` for `faviconUrl`, `DEFAULT_HERO_TITLE`, `DEFAULT_HERO_SUBTITLE`, request origin for `publicContentBaseUrl`).
- In `saveBrandingSettings(db, bucket, formData)`:
  - Read existing row `SELECT * FROM settings WHERE id = 1` so existing `logo_url` and `favicon_url` are preserved when neither a new file nor a new URL nor a clear flag is submitted.
  - Validate `org_url` and `public_content_base_url` with `sanitizeHttpUrl(..., { allowRootRelative: false })` when non-empty; return `{ ok: false, error: '...' }` if invalid.
  - Validate `logo_url` and `favicon_url` (when provided as text inputs) with `sanitizeHttpUrl(..., { allowRootRelative: true })`; return `{ ok: false, error: '...' }` if invalid.
  - For `logo_file` and `favicon_file`: if `entry instanceof File && entry.size > 0`, verify `entry.size <= MAX_BRANDING_ASSET_BYTES` (`2 * 1024 * 1024`) and `ALLOWED_BRANDING_MIME_TYPES.includes(entry.type)` (`image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`, `image/x-icon`, `image/vnd.microsoft.icon`), write `await entry.arrayBuffer()` to `bucket.put('_branding/logo' | '_branding/favicon', buffer, { httpMetadata: { contentType: entry.type } })`, and set `logoUrl = '/branding/logo?v=' + Date.now()` (or `faviconUrl = '/branding/favicon?v=' + Date.now()`).
  - If `formData.get('clear_logo') === '1'` (and no new `logo_file` was uploaded), delete `_branding/logo` from `bucket` and set `logoUrl = null`. Same for `clear_favicon === '1'` (`_branding/favicon`, `faviconUrl = null`).
  - Upsert into `settings` (`id = 1`) using `INSERT INTO settings (...) VALUES (1, ...) ON CONFLICT(id) DO UPDATE SET ...`.
- In `src/lib/content-viewer.ts`, replace `getBrandingConfig(env, url)` with `await loadBrandingConfig(env, url)`.

- [ ] **Step 4: Run `node --test tests/branding.test.mjs tests/content-viewer.test.mjs` to verify tests pass**

Run: `node --test tests/branding.test.mjs tests/content-viewer.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/branding.ts src/lib/content-viewer.ts tests/branding.test.mjs
git commit -m "feat: add D1 branding settings, R2 logo/favicon uploads, and /branding asset handler"
```

---

### Task 3: Wire `/branding/*` in Middleware, Expand `/admin/setup`, Add `/admin/settings`, and Update Pages & Docs

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/layouts/AdminLayout.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/admin/index.astro`
- Modify: `src/pages/admin/presentations/[slug].astro`
- Modify: `src/pages/admin/setup.astro`
- Create: `src/pages/admin/settings.astro`
- Modify: `README.md`
- Modify: `docs/admin_setup.md`
- Test: `tests/admin-pages.test.mjs`, `tests/zero-branding-and-docs.test.mjs`

**Interfaces:**
- Consumes from Task 2 (`src/lib/branding.ts`):
  - `loadBrandingConfig(env, requestUrl)`
  - `saveBrandingSettings(db, bucket, formData)`
  - `handleBrandingAssetRequest(request, env)`
- Produces:
  - Middleware route for `/branding/logo` and `/branding/favicon`
  - Expanded `/admin/setup` page (`src/pages/admin/setup.astro`) with multipart form for initial admin + branding settings + logo/favicon upload
  - New `/admin/settings` page (`src/pages/admin/settings.astro`) for logged-in admins to update branding settings and upload/clear logo & favicon
  - Updated `AdminLayout.astro` with `branding.faviconUrl` and `/admin/settings` link in the navbar

- [ ] **Step 1: Add failing assertions in `tests/admin-pages.test.mjs` and `tests/zero-branding-and-docs.test.mjs`**

Update `tests/admin-pages.test.mjs` to assert:
- `src/middleware.ts` routes `/branding/logo` and `/branding/favicon` via `handleBrandingAssetRequest`.
- `src/layouts/AdminLayout.astro`, `src/pages/index.astro`, `src/pages/admin/index.astro`, and `src/pages/admin/presentations/[slug].astro` use `loadBrandingConfig`.
- `src/layouts/AdminLayout.astro` links to `/admin/settings` and binds `href={branding.faviconUrl}`.
- `src/pages/admin/setup.astro` uses `enctype="multipart/form-data"`, `saveBrandingSettings`, `name="logo_file"`, `name="favicon_file"`, and contains no `className="`.
- `src/pages/admin/settings.astro` exists, uses `enctype="multipart/form-data"`, `loadBrandingConfig`, `saveBrandingSettings`, `name="logo_file"`, `name="favicon_file"`, `name="clear_logo"`, `name="clear_favicon"`, `envOverrides`, and contains no `className="`.
Update `tests/zero-branding-and-docs.test.mjs` to assert `README.md` documents `/admin/settings` and `FAVICON_URL`.

- [ ] **Step 2: Run `node --test tests/admin-pages.test.mjs tests/zero-branding-and-docs.test.mjs` to verify failure**

Run: `node --test tests/admin-pages.test.mjs tests/zero-branding-and-docs.test.mjs`
Expected: FAIL (`src/pages/admin/settings.astro` does not exist yet and pages still call `getBrandingConfig`)

- [ ] **Step 3: Update `src/middleware.ts`, `AdminLayout.astro`, `index.astro`, `admin/index.astro`, `admin/presentations/[slug].astro`, `admin/setup.astro`, create `admin/settings.astro`, and update `README.md` & `docs/admin_setup.md`**

- In `src/middleware.ts`: intercept `pathname === '/branding/logo' || pathname === '/branding/favicon'` and return `applyViewerSecurityHeaders(await handleBrandingAssetRequest(context.request, env as unknown as { BUCKET: R2Bucket }))`.
- In `src/layouts/AdminLayout.astro` and `src/pages/index.astro`: use `await loadBrandingConfig(env as unknown as Record<string, unknown>, Astro.url)` and set `<link rel="icon" href={branding.faviconUrl} />` and `<link rel="apple-touch-icon" href={branding.faviconUrl} />`. In `AdminLayout.astro`, add `<a href="/admin/settings">Settings</a>` in the logged-in navbar.
- In `src/pages/admin/index.astro` and `src/pages/admin/presentations/[slug].astro`: replace `getBrandingConfig(...)` with `await loadBrandingConfig(...)`.
- In `src/pages/admin/setup.astro`:
  - Load `const branding = await loadBrandingConfig(envRecord, Astro.url);`
  - Change `<form method="POST" enctype="multipart/form-data">`
  - Include Administrator Account inputs (`username`, `password`, `confirm_password`) and Branding & Appearance inputs (`app_name`, `org_name`, `org_url`, `hero_title`, `hero_subtitle`, `public_content_base_url`, `logo_file`, `logo_url`, `favicon_file`, `favicon_url`).
  - On `POST`: validate branding uploads/URLs via `saveBrandingSettings(env.DB, env.BUCKET, formData)` only after `createInitialAdmin` succeeds (or validate branding inputs first so a bad file/URL doesn't create the admin and lock setup before branding is saved! Wait: validating/saving branding settings *before* `createInitialAdmin` or only calling `createInitialAdmin` after branding validation passes ensures if the user uploads an invalid 5MB logo on `/admin/setup`, they get a validation error on `/admin/setup` instead of creating the admin and locking themselves out of `/admin/setup`). Specifically: validate password/username and branding inputs first; or run `saveBrandingSettings` after `createInitialAdmin`? Even better: export `validateBrandingFormData(formData)` or run `saveBrandingSettings` before `createInitialAdmin` only after checking username/password, OR if `saveBrandingSettings` runs after `createInitialAdmin`, the user is already logged in (`Astro.session?.set('adminUsername', result.username)`) so if `saveBrandingSettings` fails or succeeds they are logged in. Waiting to call `createInitialAdmin` until `saveBrandingSettings` succeeds (or validating before) means `/admin/setup` can re-render the form with the error message! Let's make sure on `/admin/setup`, we validate the admin fields (`getInitialAdminValidationError`) AND `saveBrandingSettings` so any error re-renders `/admin/setup` cleanly before committing the admin row.
- Create `src/pages/admin/settings.astro`:
  - Uses `Layout` (`AdminLayout.astro`), loads `branding = await loadBrandingConfig(envRecord, Astro.url)`.
  - Handles `POST` (`enctype="multipart/form-data"`) via `saveBrandingSettings(env.DB, env.BUCKET, formData)`, then reloads `branding` and shows a success alert or error alert.
  - Displays badges next to any field where `branding.envOverrides[field]` is `true` explaining that the Worker environment variable currently overrides the database setting.
  - Displays current logo and favicon previews with checkboxes/buttons to reset (`clear_logo`, `clear_favicon`) or upload replacements (`logo_file`, `favicon_file`).
- Update `README.md` and `docs/admin_setup.md` to document the expanded `/admin/setup` wizard, `/admin/settings` page, single `0001_init.sql` migration, and optional `FAVICON_URL` override.

- [ ] **Step 4: Run full test suite and Astro production build**

Run: `npm test && npm run build`
Expected: PASS (all tests pass and `astro build` succeeds with exit code 0)

- [ ] **Step 5: Commit Task 3**

```bash
git add src/middleware.ts src/layouts/AdminLayout.astro src/pages/index.astro src/pages/admin/index.astro src/pages/admin/presentations/\[slug\].astro src/pages/admin/setup.astro src/pages/admin/settings.astro README.md docs/admin_setup.md tests/admin-pages.test.mjs tests/zero-branding-and-docs.test.mjs
git commit -m "feat: expand /admin/setup with branding and uploads and add /admin/settings page"
```
