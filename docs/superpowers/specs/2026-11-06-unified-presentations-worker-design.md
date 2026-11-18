# Unified Presentations & Admin Cloudflare Worker — Design Document

## 1. Intent and Why

Today, hosting and administering HTML presentations on Cloudflare requires two separate Worker applications that share the same D1 database and R2 bucket:
1. `presentations-worker`: Serves R2 files under `/content/{slug}/*` with per-presentation HTTP Basic Authentication backed by D1, plus a public landing page at `/`.
2. `presentations-manager-worker`: Provides an Astro SSR + Starwind UI admin dashboard, R2 file/folder/ZIP upload manager, visitor credential configuration, and a Bearer-authenticated Skill API.

The goal of this project is to combine all functionality from both applications into a **single, white-labeled Cloudflare Worker application** in `artifact-manager` that can be shared publicly and open-sourced. All company-specific branding, logos, and URLs are removed from source code and replaced by standard Cloudflare Worker environment variables (`vars` in `wrangler.jsonc` or dashboard variables) with clean, neutral defaults when unset.

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Single Worker Deployment:** Serve both the public viewer (`/`, `/content/{slug}/*`) and the administration application (`/admin/*`) from one Astro (`@astrojs/cloudflare`) Worker.
- **Complete Feature Parity:**
  - Public landing page at `/`.
  - Direct R2 content streaming at `/content/{slug}` and `/content/{slug}/*` (resolving `/content/{slug}` and `/content/{slug}/` to `content/{slug}/index.html`), with `Content-Type` inference, `Cache-Control`, and quoted `ETag` pass-through.
  - Per-presentation HTTP Basic Auth (`WWW-Authenticate: Basic realm="Protected Content"`) using timing-safe username comparison and PBKDF2-SHA256 (100k iterations) password verification against D1, or public access when `username` and `password` are `NULL`.
  - Admin authentication at `/admin/login` using bcrypt password hashes stored in D1 (`admins` table), constant-time dummy hash fallback for unknown usernames, IP-based login rate limiting via KV, and opaque server-side sessions via Astro Sessions (`SESSION` KV binding).
  - Admin dashboard at `/admin` with presentation creation, client-side search filtering, column sorting, and relative timestamp formatting.
  - Presentation management at `/admin/presentations/{slug}` with display name editing, public/protected access controls, visitor password validation + corporate passphrase generation, R2 file listing, folder creation, inline file renaming, public file URL copying, single/multi-file/folder drag-and-drop uploads, client-side ZIP extraction (JSZip 3.10.2 with SRI, stripping single top-level wrapper folders and skipping dot-files/`README.md`), and optional prompt to rename uploaded `.html` files to `index.html`.
  - Bearer-authenticated Skill API (`POST /admin/api/v1/skill/presentations` and `PUT /admin/api/v1/skill/presentations/{slug}`) plus updated agent skill documentation and helper script (`skills/presentations-manager/`).
- **White-Label Configuration:** Drive all branding (app name, organization name, website link, logo URL, hero text, and optional public content base URL override) through Worker environment variables with neutral defaults.
- **New Cloudflare Account Onboarding Documentation:** Provide a complete, step-by-step `README.md` (plus supporting docs in `docs/admin_setup.md`, `docs/skill-api-runbook.md`, and `seed/README.md`) walking an operator through provisioning D1, R2, and KV on a brand-new Cloudflare account, configuring `wrangler.jsonc`, applying D1 migrations, creating the first admin user, setting branding variables and `SKILL_API_TOKEN`, and deploying.
- **Comprehensive Automated Tests:** Port and unify the test suites from both workers (`middleware` R2/Basic Auth tests and `security` admin/path/CSRF/rate-limit tests) using Node's built-in test runner (`node --test`).

### Non-Goals
- Preserving the legacy `/generate-hash` standalone form from `presentations-worker` (superseded by the `/admin/presentations/{slug}` visitor password form and PBKDF2 hashing utility).
- Maintaining React as a separate dependency solely for the static `/` landing page.

### Anti-Goals
- **Zero Proprietary Leakage:** The codebase, configuration files, tests, seed files, skills, and README must contain **no** references to legacy organization names, internal domains, third-party CDN URLs, or real production Cloudflare resource IDs (D1 `database_id` or KV namespace `id`/`preview_id` must use clearly marked placeholders in `wrangler.jsonc`).
- **No Frame-Breaking on Presentations:** `/content/*` and `/` must use `X-Frame-Options: SAMEORIGIN` so presentations can embed same-origin iframes/assets, whereas `/admin/*` must enforce `X-Frame-Options: DENY`.
- **No Auth Cross-Contamination:** Unauthenticated requests to `/` or `/content/*` must never redirect to `/admin/login`, and `/content/*` must never fall through to static asset serving.

## 3. Constraints & Infrastructure Bindings

### Runtime & Stack
- **Platform:** Cloudflare Workers (`compatibility_date: "2025-04-01"`, `compatibility_flags: ["nodejs_compat"]`).
- **Framework:** Astro 7 (`output: 'server'`) with `@astrojs/cloudflare` adapter and Tailwind CSS v4 (`@tailwindcss/vite`).
- **UI Components:** Starwind UI components (`src/components/starwind/*`) + `lucide-astro` icons.

### Cloudflare Bindings (`wrangler.jsonc`)
| Binding | Type | Purpose |
|---|---|---|
| `DB` | D1 Database | Stores `admins` (`username`, `password_hash`) and `presentations` (`slug`, `name`, `username`, `password`, `uploaded_at`). |
| `BUCKET` | R2 Bucket | Stores presentation files under `content/{slug}/...` (replaces `PRESENTATION_CONTENT` from `presentations-worker` so both viewer and admin use a single binding name `BUCKET`). |
| `SESSION` | KV Namespace | Stores Astro server-side admin sessions (`astro-session` cookie) and IP-based login rate-limit counters (`ratelimit:login:{ip}`). |
| `SKILL_API_TOKEN` | Secret (optional) | Bearer token authenticating `/admin/api/v1/skill/presentations/*`. Set via `wrangler secret put SKILL_API_TOKEN` or `.dev.vars`. |

### Branding & URL Environment Variables (`vars` in `wrangler.jsonc` / Worker Config)
All branding variables are optional strings on `env`. A centralized helper `getBrandingConfig(env, requestUrl)` in `src/lib/branding.ts` resolves them with safe, trimmed fallbacks:

| Variable | Default (when unset or empty) | Where Used |
|---|---|---|
| `APP_NAME` | `"Presentation Manager"` | Admin navbar title, `<title>` tags, admin footer, fallback brand name on `/` and 401 page if `ORG_NAME` is unset. |
| `ORG_NAME` | `""` (falls back to `APP_NAME` where a label is needed) | Public `/` header/footer copyright and 401 Access Denied page contact copy. |
| `ORG_URL` | `""` | Optional external "Website" link in the public `/` header. Omitted if empty or not a valid `http:`/`https:` URL. |
| `LOGO_URL` | `""` | Optional logo `<img>` URL in the public `/` header, 401 Access Denied page, and admin navbar. When empty, UI renders the built-in `Projector` icon and text title. |
| `HERO_TITLE` | `"Interactive Presentations"` | Main `<h1>` heading on the public `/` landing page. |
| `HERO_SUBTITLE` | `"Explore shared presentations and interactive decks."` | Subtitle paragraph on the public `/` landing page. |
| `PUBLIC_CONTENT_BASE_URL` | `""` (resolves to `requestUrl.origin`, stripped of trailing slash) | Base URL used in `/admin` and `/admin/presentations/{slug}` for "View" links and "Copy public URL" buttons. |

## 4. Approaches Considered

### Approach 1: Unified Astro SSR Worker (Chosen)
Build the entire application inside a single Astro (`@astrojs/cloudflare`) Worker:
- `src/middleware.ts` handles security headers, CSRF checks, `/content/*` R2 streaming + Basic Auth, and `/admin/*` session gating.
- `src/pages/index.astro` renders the public landing page using SSR and branding vars.
- `src/pages/admin/*` and `src/pages/admin/api/*` serve all admin pages and API endpoints.
- **Why chosen:** Single build pipeline (`astro build`), zero unnecessary React client bundle on `/`, unified TypeScript library modules (`presentation-password.ts`, `r2-path.ts`, `branding.ts`), and straightforward open-source setup.

### Approach 2: Custom Worker Router + Dual Frontend (Rejected)
Maintain a separate Vite + React build for `/` alongside Astro for `/admin/*`, stitched together with a custom Worker entrypoint.
- **Why rejected:** `/` is a static landing page with no client-side state; maintaining two frontend frameworks adds build complexity and dependencies with no user benefit.

## 5. Detailed Design (The How)

### 5.1 URL Route Map

| Path | Method(s) | Auth | Frame Header | Description |
|---|---|---|---|---|
| `/` | `GET` | Public | `SAMEORIGIN` | Branded public landing page (`src/pages/index.astro`). |
| `/content/{slug}` | `GET`, `HEAD` | Public or D1 Basic Auth | `SAMEORIGIN` | Resolves `content/{slug}/index.html` from R2 `BUCKET`. |
| `/content/{slug}/*` | `GET`, `HEAD` | Public or D1 Basic Auth | `SAMEORIGIN` | Resolves `content/{slug}/{path}` from R2 `BUCKET`. |
| `/admin` | `GET`, `POST` | Admin KV Session | `DENY` | Admin dashboard (`src/pages/admin/index.astro`). |
| `/admin/login` | `GET`, `POST` | Public (rate-limited) | `DENY` | Admin login page (`src/pages/admin/login.astro`). Redirects to `/admin` if already logged in. |
| `/admin/logout` | `POST` | Admin KV Session | `DENY` | Destroys session and redirects to `/admin/login` (`src/pages/admin/logout.ts`). |
| `/admin/presentations/{slug}` | `GET`, `POST` | Admin KV Session | `DENY` | Presentation settings & R2 file manager (`src/pages/admin/presentations/[slug].astro`). |
| `/admin/api/logout` | `POST` | Admin KV Session | `DENY` | Alias/endpoint for logout (`src/pages/admin/api/logout.ts`), destroys session and redirects to `/admin/login`. |
| `/admin/api/generate-passphrase` | `GET` | Admin KV Session | `DENY` | Returns `{ passphrase }` (`src/pages/admin/api/generate-passphrase.ts`). |
| `/admin/api/upload/{slug}` | `POST` | Admin KV Session | `DENY` | Multipart R2 file upload up to 50 MiB (`src/pages/admin/api/upload/[slug].ts`). |
| `/admin/api/v1/skill/presentations` | `POST` | Bearer `SKILL_API_TOKEN` | `DENY` | Create presentation & upload base64 files (`src/pages/admin/api/v1/skill/presentations/index.ts`). |
| `/admin/api/v1/skill/presentations/{slug}` | `PUT` | Bearer `SKILL_API_TOKEN` | `DENY` | Full replace of presentation metadata & R2 files (`src/pages/admin/api/v1/skill/presentations/[slug].ts`). |

### 5.2 Middleware & Request Pipeline (`src/middleware.ts` + `src/lib/content-viewer.ts`)
1. **Content Viewer Interception (`/content/*`):**
   - If `pathname === '/content'` or `pathname.startsWith('/content/')`, `src/middleware.ts` delegates immediately to `handleContentRequest(context.request, env)` in `src/lib/content-viewer.ts` and wraps the response with viewer security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`).
   - `handleContentRequest` validates the slug and path (`isSafeContentPath` — rejecting `..`, `\`, `\0`, percent-encoded traversal, or invalid slug characters, returning `400 Invalid path` before touching D1 or R2).
   - Queries `env.DB.prepare("SELECT username, password FROM presentations WHERE slug = ?").bind(slug).first()`. If D1 throws, returns `503 Service Unavailable`.
   - If the presentation row does not exist in D1, or if `username` and `password` are set and the `Authorization: Basic ...` header is missing or fails `timingSafeEqualStrings(username)` + `verifyPresentationPassword(password, storedHash)`, returns `401` with `WWW-Authenticate: Basic realm="Protected Content"` and the white-labeled Access Denied HTML page (`renderAccessDeniedHtml(branding)`).
   - Note on partial protection state (`username` set in D1, `password` is `NULL` or empty — shown as "Needs password" in the admin UI): treated as locked (`401`) until either a password is set or the username is cleared to make it public, preventing accidental exposure of a presentation while an admin is mid-setup.
   - Fetches the object from `env.BUCKET.get(r2Key)` where `r2Key` is `content/${slug}/index.html` for `/content/${slug}` or `/content/${slug}/`, and `pathname.slice(1)` (decoded/validated) otherwise.
   - Returns `200` with `object.body`, `Content-Type` (from `object.httpMetadata.contentType` or `inferContentType(r2Key)`), `Cache-Control` (if present), and quoted `ETag` (`object.httpEtag` or quoted `object.etag`), or `404 Not Found` if the key does not exist in R2.
2. **Public Root (`/` and static public assets like `/favicon.svg`):**
   - Requests outside `/admin` and `/content` pass through `await next()` and receive `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.
3. **Admin Scope (`/admin` and `/admin/*`):**
   - Applies `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.
   - **CSRF Protection (`isBlockedCrossSiteMutation`):** Blocks state-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`) when `Sec-Fetch-Site` is present and not `'same-origin'` or `'none'`, **except** Bearer-authenticated `/admin/api/v1/skill/*` endpoints which do not use cookies. Returns `403 Forbidden: cross-origin request blocked.`.
   - **Admin API Routes (`/admin/api/*`):** Pass through to the route handler (which enforces either `session.get('adminUsername')` or `SKILL_API_TOKEN` Bearer auth).
   - **Admin Pages & `/admin/logout`:** Checks `const adminUsername = await context.session?.get('adminUsername')`.
     - If unauthenticated and `pathname !== '/admin/login'`, redirects (`302`) to `/admin/login`.
     - If authenticated and `pathname === '/admin/login'`, redirects (`302`) to `/admin`.

### 5.3 Shared Password & Crypto Module (`src/lib/presentation-password.ts`)
Combines the hashing and password-policy functions from `presentations-manager-worker` with the constant-time verification and Basic Auth parsing functions from `presentations-worker`:
- `hashPresentationPassword(password: string): Promise<string>` — PBKDF2-SHA256, 100,000 iterations, 16-byte random salt, 256-bit key, formatted as `${iterations}.${saltBase64}.${hashBase64}`.
- `verifyPresentationPassword(password: string, storedHash: string): Promise<boolean>` — Enforces `MAX_PASSWORD_LENGTH = 256`, `MAX_PBKDF2_ITERATIONS = 1_000_000`, validates 32-byte expected hash and non-empty salt, derives bits, and compares with `timingSafeEqualBytes`.
- `timingSafeEqualStrings(a: string, b: string): Promise<boolean>` — SHA-256 digest comparison via `timingSafeEqualBytes` plus length check.
- `parseBasicAuth(authHeader: string | null): { username: string; password: string } | null` — RFC 7617 first-colon split so passwords containing colons work properly.

### 5.4 White-Label Branding & HTML Escape Safety (`src/lib/branding.ts`)
- Reads `APP_NAME`, `ORG_NAME`, `ORG_URL`, `LOGO_URL`, `HERO_TITLE`, `HERO_SUBTITLE`, and `PUBLIC_CONTENT_BASE_URL` from `env`.
- Validates URL variables (`ORG_URL`, `LOGO_URL`, `PUBLIC_CONTENT_BASE_URL`) so only safe `http://`, `https://`, or root-relative `/...` URLs (for `LOGO_URL`) are rendered.
- Escapes all dynamic strings in `renderAccessDeniedHtml(branding)` to prevent HTML/attribute injection if an operator sets special characters in `vars`.

### 5.5 D1 Schema, Migrations, Seed, and Helper Scripts
- `migrations/0001_init.sql`: Creates `admins` (`username TEXT PRIMARY KEY, password_hash TEXT NOT NULL`) and `presentations` (`slug TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT, password TEXT`).
- `migrations/0002_add_uploaded_at.sql`: `ALTER TABLE presentations ADD COLUMN uploaded_at TEXT;`.
- `seed/local.sql` & `seed/README.md`: Local-only test admin (`testadmin` / `testpass123`) for `npm run db:setup:local`.
- `scripts/backfill-presentation-dates.js`: Retained and updated so the R2 bucket name can be overridden via `R2_BUCKET_NAME` env var (defaulting to `presentation-content`).
- `skills/presentations-manager/SKILL.md` & `skills/presentations-manager/scripts/update_presentation.js`: Updated to remove company names and target `{ORIGIN}/admin/api/v1/skill/presentations` and `{ORIGIN}/admin/api/v1/skill/presentations/{slug}`.

## 6. What Is Left to the Builder
- Exact file layout of unit/integration tests under `tests/` (as long as `npm test` runs all tests via `node --test` and covers all middleware, security, branding, and route behaviors).
- Minor Tailwind styling details on the neutral public landing page (`src/pages/index.astro`) and 401 Access Denied page, provided they use clean slate/indigo/blue utility classes with no proprietary colors or external font/logo dependencies required to look good out of the box.
