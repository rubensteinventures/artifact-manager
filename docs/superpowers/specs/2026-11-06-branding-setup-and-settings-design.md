# First-Run Branding Setup, `/admin/settings`, and Unified Initial Migration — Short Design

## 1. Intent and Why
Allow administrators deploying the Worker (including via the one-click **Deploy to Cloudflare** button) to configure all branding parameters (`appName`, `orgName`, `orgUrl`, `heroTitle`, `heroSubtitle`, `publicContentBaseUrl`) and upload a custom project **logo** and **favicon** directly in the browser during `/admin/setup`—and update them anytime later at `/admin/settings`—without needing environment variables in `wrangler.jsonc`. Environment variables still override database settings whenever explicitly set. Because there is no active production database yet, all D1 schema definitions are consolidated into a single `migrations/0001_init.sql`.

## 2. Goals, Non-Goals, and Anti-Goals
- **Goals:**
  - Collapse `migrations/0001_init.sql` and `migrations/0002_add_uploaded_at.sql` into a single `migrations/0001_init.sql` defining `admins`, `presentations` (including `uploaded_at`), and `settings`.
  - Remove unnecessary default `"vars"` from `wrangler.jsonc` so database-configured values are not masked by hardcoded `wrangler.jsonc` strings.
  - Expand `/admin/setup` to accept optional branding fields + custom logo/favicon file uploads (or URLs) alongside initial admin account creation.
  - Add `/admin/settings` (linked from the `/admin` navbar) so logged-in admins can update branding text, URLs, logo, and favicon (or reset logo/favicon to defaults) at any time.
  - Serve uploaded logo and favicon assets from R2 (`BUCKET`) under keys `_branding/logo` and `_branding/favicon` via public GET/HEAD routes `/branding/logo` and `/branding/favicon`.
  - Apply precedence on every page (`/`, `/admin/*`, and the 401 Access Denied page): **Non-empty Environment Variable** (`APP_NAME`, `ORG_NAME`, `ORG_URL`, `LOGO_URL`, `FAVICON_URL`, `HERO_TITLE`, `HERO_SUBTITLE`, `PUBLIC_CONTENT_BASE_URL`) → **D1 `settings` table** → **Built-in Default** (`Presentation Manager`, `/favicon.svg`, etc.).
- **Non-Goals:** Multi-tenant branding per presentation (branding is project-wide).
- **Anti-Goals:** Never allow unauthenticated users to modify settings once an admin exists, and never allow SVG/HTML script execution via arbitrary MIME types on `/branding/*` (restrict uploads to safe image MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`, `image/x-icon`, `image/vnd.microsoft.icon`, ≤ 2 MiB, served with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` and `X-Content-Type-Options: nosniff`).

## 3. Constraints
- **Single Migration (`migrations/0001_init.sql`):**
  ```sql
  CREATE TABLE IF NOT EXISTS admins (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS presentations (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT,
      password TEXT,
      uploaded_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      app_name TEXT,
      org_name TEXT,
      org_url TEXT,
      logo_url TEXT,
      favicon_url TEXT,
      hero_title TEXT,
      hero_subtitle TEXT,
      public_content_base_url TEXT,
      updated_at TEXT
  );
  ```
- **Uploaded Asset Limits & Keys:** Max `2 MiB` per logo/favicon upload; stored in R2 (`BUCKET`) at `_branding/logo` and `_branding/favicon` with `httpMetadata.contentType`; saved in `settings.logo_url` / `settings.favicon_url` as `/branding/logo?v=<timestamp>` and `/branding/favicon?v=<timestamp>` for automatic cache-busting.

## 4. Approaches Considered
1. **D1 `settings` table for metadata + R2 `_branding/*` for uploaded logo/favicon (Chosen):** Immediate strong consistency on settings updates, clean browser caching for favicons/logos, and zero HTML payload bloat.
2. **Base64 Data URLs in D1 (Rejected):** Bloats HTML responses on every request and weakens browser favicon caching.
3. **KV Namespace Storage (Rejected):** Eventual consistency causes up to 60s of stale branding after saving.

## 5. Design Summary
- **`src/lib/branding.ts`:**
  - Add `faviconUrl: string` (default `'/favicon.svg'`) and `envOverrides: Record<string, boolean>` to `BrandingConfig`.
  - Keep synchronous `getBrandingConfig(env, requestUrl, dbSettings?)` and add async helper `loadBrandingConfig(env, requestUrl)` that reads the `id = 1` row from D1 `settings` (gracefully falling back to empty if the table isn't queried or on error) and merges with `env` using `Env Var > D1 settings > Default`.
  - Add `saveBrandingSettings(db, bucket, formData)` to handle text/URL fields, optional `logo_file` / `favicon_file` R2 uploads (`_branding/logo`, `_branding/favicon`), and optional `clear_logo` / `clear_favicon` flags.
- **`src/middleware.ts`:**
  - Intercept `GET` / `HEAD` `/branding/logo` and `/branding/favicon` to stream `_branding/logo` and `_branding/favicon` from `env.BUCKET` with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, and `Cache-Control: public, max-age=3600`.
- **Pages & Layouts:**
  - Update `src/layouts/AdminLayout.astro`, `src/pages/index.astro`, and `renderAccessDeniedHtml` in `src/lib/branding.ts` to use `branding.faviconUrl` in `<link rel="icon">` and `<link rel="apple-touch-icon">`, and add a **Settings** link (`/admin/settings`) in the `AdminLayout.astro` navbar when logged in.
  - Expand `src/pages/admin/setup.astro` (`enctype="multipart/form-data"`) to include the branding configuration and logo/favicon upload fields alongside the initial admin username/password.
  - Create `src/pages/admin/settings.astro` (`enctype="multipart/form-data"`) showing current values, indicating which fields are currently overridden by environment variables, and allowing admins to upload/replace/remove the custom logo and favicon.
