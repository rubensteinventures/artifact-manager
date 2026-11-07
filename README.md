# Presentation & Artifact Manager Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rubensteinventures/artifact-manager)

A single, white-label Cloudflare Worker application that both **serves interactive HTML presentations** from Cloudflare R2 (`/content/{slug}/*`) and provides a **full administration dashboard & automation API** (`/admin/*`) backed by Cloudflare D1, R2, and KV.

## Features

- **Public & Protected Presentation Viewer (`/content/{slug}/*`)**:
  - Streams HTML presentations and static assets directly from R2 (`content/{slug}/index.html` at the slug root).
  - Supports public access or per-presentation HTTP Basic Authentication verified against PBKDF2-SHA256 password hashes stored in Cloudflare D1.
  - Sends `X-Frame-Options: SAMEORIGIN` so presentations can embed same-origin iframes and assets.
- **Admin Dashboard (`/admin`)**:
  - Create, search, sort, rename, and delete presentations.
  - Configure visitor access controls (public mode, visitor username, and strong visitor password or one-click corporate passphrase generator).
  - Upload individual files, nested directories, or `.zip` archives (extracted client-side with automatic wrapper-folder stripping).
  - Create folders, rename files inline, delete files, and copy public URLs.
  - Protected by bcrypt administrator credentials in D1, IP-based login rate limiting in KV, cross-site mutation CSRF protection, `X-Frame-Options: DENY`, and opaque server-side sessions in Cloudflare KV (`SESSION`).
- **White-Label Branding (`/admin/setup` & `/admin/settings`, with Optional Env Overrides)**:
  - Configure application name, organization name, website URL, hero copy, public content base URL, and upload a custom project **logo** and **favicon** directly in the browser during `/admin/setup` or anytime later at `/admin/settings`—with optional environment variable overrides (`APP_NAME`, `ORG_NAME`, `ORG_URL`, `LOGO_URL`, `FAVICON_URL`, `HERO_TITLE`, `HERO_SUBTITLE`, `PUBLIC_CONTENT_BASE_URL`) when needed.
- **Bearer-Authenticated Skill API (`/admin/api/v1/skill/presentations`)**:
  - Automate creating or replacing presentations and their R2 files from CI/CD or AI coding agents using `SKILL_API_TOKEN`.

---

## Route Overview

| Path | Auth | Purpose |
|------|------|---------|
| `/` | Public | White-labeled landing page |
| `/branding/logo` & `/branding/favicon` | Public | Serves custom uploaded brand logo and favicon from R2 (`_branding/*`) |
| `/content/{slug}` & `/content/{slug}/*` | Public or Visitor Basic Auth | Serves presentation files from R2 under `content/{slug}/` |
| `/admin` | Admin Session | Presentation dashboard (create, search, sort) |
| `/admin/setup` | Public (First-Run Only) | One-time initial administrator + branding/logo/favicon setup wizard when `admins` has `0` rows (permanently locks once an admin is configured) |
| `/admin/settings` | Admin Session | Update project branding settings and upload/replace/reset custom logo & favicon |
| `/admin/login` | Public (rate-limited) | Administrator login |
| `/admin/logout` & `/admin/api/logout` | Admin Session | Ends admin session and redirects to `/admin/login` |
| `/admin/presentations/{slug}` | Admin Session | Manage presentation files, folders, and visitor credentials |
| `/admin/api/upload/{slug}` | Admin Session | Multipart file upload endpoint (up to 50 MiB per file) |
| `/admin/api/generate-passphrase` | Admin Session | Generates a 3-word corporate passphrase for visitor access |
| `/admin/api/v1/skill/presentations` | Bearer (`SKILL_API_TOKEN`) | `POST` to create a presentation and upload base64 files |
| `/admin/api/v1/skill/presentations/{slug}` | Bearer (`SKILL_API_TOKEN`) | `PUT` to replace presentation metadata and all R2 files |

---

## One-Click Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rubensteinventures/artifact-manager)

Clicking **Deploy to Cloudflare** automates the entire setup on your Cloudflare account:
1. Clones this repository into your GitHub or GitLab account.
2. Automatically provisions the D1 database (`DB`), R2 bucket (`BUCKET`), and KV namespace (`SESSION`) and wires their IDs into `wrangler.jsonc`.
3. Runs `npm run deploy` (`astro build`, remote D1 schema migrations via `wrangler d1 migrations apply DB --remote`, and `wrangler deploy`).
4. Once deployed, open `https://<your-worker>.<your-subdomain>.workers.dev/admin` in your browser—it will automatically redirect to `/admin/setup` where you can create your initial administrator username and password, configure your branding, and upload a custom logo and favicon (you can also update branding anytime later at `/admin/settings`).

### Optional: Environment Variable Override & Account Recovery (`ADMIN_USERNAME` / `ADMIN_PASSWORD`)

You can also configure `ADMIN_USERNAME` and `ADMIN_PASSWORD` (at least 8 characters) as Worker variables/secrets in the Cloudflare Dashboard (**Workers & Pages → your worker → Settings → Variables and Secrets**):
- **Zero-Touch Initial Setup:** If `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set before your first visit, `/admin/setup` is skipped automatically and signing in once at `/admin/login` with those credentials hashes and saves your admin record in D1.
- **Delete After Initial Sign-In (Recommended):** Once you have signed in at `/admin/login` after initial deployment, **you can and should delete `ADMIN_USERNAME` and `ADMIN_PASSWORD`** from your Worker's Variables and Secrets. Because your bcrypt password hash is now stored in D1, those environment variables are no longer needed for normal operation.
- **Emergency Username / Password Recovery:** If you ever lose or forget your admin credentials in the future, re-add `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the Cloudflare Dashboard and sign in once at `/admin/login` to reset/upsert your bcrypt hash in D1—then delete the environment variables again once recovery is complete.

---

## Manual CLI Setup on a New Cloudflare Account

If you prefer to provision resources manually from your terminal using Wrangler instead of the Deploy to Cloudflare button, follow these steps:

### Prerequisites

1. A [Cloudflare account](https://dash.cloudflare.com/) with Workers, D1, R2, and KV enabled.
2. [Node.js](https://nodejs.org/) 20+ installed locally.
3. Install project dependencies and authenticate Wrangler with your Cloudflare account:

```bash
npm install
npx wrangler login
```

### Step 1: Create the Cloudflare D1 Database

Create the `presentations_db` database:

```bash
npx wrangler d1 create presentations_db
```

Copy the `database_id` UUID printed in the terminal output and replace the placeholder `"00000000-0000-0000-0000-000000000000"` in [`wrangler.jsonc`](wrangler.jsonc):

```jsonc
	"d1_databases": [
		{
			"binding": "DB",
			"database_name": "presentations_db",
			"database_id": "YOUR-NEW-D1-DATABASE-UUID",
			"migrations_dir": "migrations"
		}
	],
```

### Step 2: Create the Cloudflare R2 Bucket

Create the R2 bucket used to store presentation files:

```bash
npx wrangler r2 bucket create presentation-content
```

*(If you choose a different bucket name, update `r2_buckets[0].bucket_name` in [`wrangler.jsonc`](wrangler.jsonc) to match.)*

### Step 3: Create the Cloudflare KV Namespace (Admin Sessions)

Astro Sessions and the login rate limiter use the `SESSION` KV binding. Create both the production and preview KV namespaces:

```bash
npx wrangler kv namespace create SESSION
npx wrangler kv namespace create SESSION --preview
```

Copy the `id` and `preview_id` values from the command output into [`wrangler.jsonc`](wrangler.jsonc):

```jsonc
	"kv_namespaces": [
		{
			"binding": "SESSION",
			"id": "YOUR-NEW-KV-NAMESPACE-ID",
			"preview_id": "YOUR-NEW-PREVIEW-KV-NAMESPACE-ID"
		}
	]
```

### Step 4: Apply D1 Database Migrations

Initialize the `admins`, `presentations`, and `settings` tables on your remote D1 database:

```bash
npx wrangler d1 migrations apply presentations_db --remote
```

### Step 5: Build and Deploy to Cloudflare

Build the Astro Worker bundle and deploy with Wrangler:

```bash
npm run build
npx wrangler deploy
```

#### Attaching a Custom Domain or Locking Down `workers.dev`
By default, [`wrangler.jsonc`](wrangler.jsonc) sets `"workers_dev": true` so one-click and new deployments get a live `*.workers.dev` URL out of the box. Once you attach a custom domain or route in the Cloudflare Dashboard (**Workers & Pages → your worker → Settings → Domains & Routes**), you can optionally set `"workers_dev": false` in `wrangler.jsonc` if you only want the Worker reachable via your custom domain.

### Step 6: Complete Initial Setup in the Browser (`/admin/setup`)

Open `https://<your-worker>.<your-subdomain>.workers.dev/admin` in your browser. Because the `admins` table is empty, the Worker automatically redirects to `/admin/setup`, where you can:
1. Create your initial administrator username and password (`>= 8` characters).
2. Configure your branding (`Application Name`, `Organization Name`, `Organization Website URL`, `Public Content Base URL`, `Hero Title`, and `Hero Subtitle`).
3. Upload a custom project **logo** and **favicon** (stored in R2 at `_branding/logo` and `_branding/favicon` and served via `/branding/logo` and `/branding/favicon`), or specify external/relative URLs.

Once submitted, `/admin/setup` permanently locks itself and signs you into `/admin`. You can update any branding setting or replace/reset the logo and favicon anytime later at **`/admin/settings`**.

*(Alternative CLI / Headless Admin Setup: Instead of using `/admin/setup`, you can either set `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables before your first sign-in at `/admin/login`, or manually insert a cost-10 bcrypt hash into D1 with `npx wrangler d1 execute presentations_db --remote --command "INSERT INTO admins (username, password_hash) VALUES ('admin', 'PASTE_BCRYPT_HASH_HERE');"`. See [docs/admin_setup.md](docs/admin_setup.md) for details.)*

### Optional: Branding Environment Variable Overrides

By default, no branding environment variables are required in [`wrangler.jsonc`](wrangler.jsonc)—everything is configured in the browser via `/admin/setup` and `/admin/settings`.

If you want to enforce specific branding values via infrastructure-as-code, any non-empty environment variable set in Cloudflare (**Workers & Pages → your worker → Settings → Variables and Secrets**) or `"vars"` in [`wrangler.jsonc`](wrangler.jsonc) automatically overrides the corresponding database setting (and is badged as overridden on `/admin/settings`):

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | `"Presentation Manager"` | Application title shown in the `/admin` navigation bar, browser title, and footer. |
| `ORG_NAME` | Falls back to `APP_NAME` | Organization name shown on the public `/` landing page, footer copyright, and 401 Access Denied prompt. |
| `ORG_URL` | `""` *(hidden)* | External `https://...` website link displayed in the header on `/`. |
| `LOGO_URL` | `""` *(built-in icon or uploaded logo)* | URL (`https://...` or `/path/to/logo.svg`) for your brand logo on `/`, the 401 page, and `/admin`. |
| `FAVICON_URL` | `"/favicon.svg"` *(or uploaded favicon)* | URL (`https://...` or `/path/to/favicon.png`) for the browser favicon across `/`, the 401 page, and `/admin`. |
| `HERO_TITLE` | `"Interactive Presentations"` | Main headline on the public `/` landing page. |
| `HERO_SUBTITLE` | `"Explore shared presentations and interactive decks."` | Subtitle text on the public `/` landing page. |
| `PUBLIC_CONTENT_BASE_URL` | `""` *(same origin)* | Optional base URL override for "View" and "Copy public URL" links in `/admin` (leave empty to use the Worker's own origin). |

### Optional: Configure the Skill API Secret (`SKILL_API_TOKEN`)

If you want to create or update presentations programmatically via `/admin/api/v1/skill/presentations`, set a strong secret token:

```bash
npx wrangler secret put SKILL_API_TOKEN
```

---

## Local Development

1. Apply local D1 migrations (either with the pre-seeded `testadmin` / `testpass123` account, or migrate-only to walk through the `/admin/setup` wizard in your browser):

   ```bash
   # Option A: Apply migrations only (visit /admin/setup in browser to configure admin + branding)
   npm run db:migrate:local

   # Option B: Apply migrations AND seed testadmin / testpass123
   npm run db:setup:local
   ```

2. (Optional) Create a `.dev.vars` file in the project root for local Skill API testing:

   ```ini
   SKILL_API_TOKEN=local-dev-secret-token
   ```

3. Start the local development server:

   ```bash
   npm run dev
   ```
   Or build and preview under the local Wrangler workerd runtime:
   ```bash
   npm run build && npx wrangler dev
   ```

4. Open `/admin/login` and sign in with `testadmin` / `testpass123`.

---

## Skill API (Bearer Token)

Automation tools and AI agents can create or replace presentations via Bearer-authenticated JSON endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/admin/api/v1/skill/presentations` | Create presentation + write all files to R2. |
| `PUT` | `/admin/api/v1/skill/presentations/{slug}` | Full replace: update `name` / access fields, delete every object under `content/{slug}/`, then upload the provided files. |

**Headers:**
- `Authorization: Bearer <SKILL_API_TOKEN>`
- `Content-Type: application/json`

**Example (`curl`):**

```bash
export ORIGIN='https://presentations.example.com'
export SKILL_API_TOKEN='your-secret'

curl -sS -X POST "$ORIGIN/admin/api/v1/skill/presentations" \
  -H "Authorization: Bearer $SKILL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "demo-deck",
    "name": "Demo",
    "access": { "mode": "public" },
    "files": [
      {
        "path": "index.html",
        "contentType": "text/html",
        "data": "<BASE64_ENCODED_FILE_CONTENT>"
      }
    ]
  }'
```

For full Skill API details and the bundled upload helper script, see [skills/presentations-manager/SKILL.md](skills/presentations-manager/SKILL.md) and [docs/skill-api-runbook.md](docs/skill-api-runbook.md).

## Running Tests

```bash
npm test
```
