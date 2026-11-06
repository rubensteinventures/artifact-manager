# Presentation & Artifact Manager Worker

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
- **White-Label Branding via Environment Variables**:
  - Customize application name, organization name, website URL, logo URL, hero copy, and public content base URL via standard Wrangler `vars` or Cloudflare Worker environment variables—with clean neutral defaults out of the box.
- **Bearer-Authenticated Skill API (`/admin/api/v1/skill/presentations`)**:
  - Automate creating or replacing presentations and their R2 files from CI/CD or AI coding agents using `SKILL_API_TOKEN`.

---

## Route Overview

| Path | Auth | Purpose |
|------|------|---------|
| `/` | Public | White-labeled landing page |
| `/content/{slug}` & `/content/{slug}/*` | Public or Visitor Basic Auth | Serves presentation files from R2 under `content/{slug}/` |
| `/admin` | Admin Session | Presentation dashboard (create, search, sort) |
| `/admin/login` | Public (rate-limited) | Administrator login |
| `/admin/logout` & `/admin/api/logout` | Admin Session | Ends admin session and redirects to `/admin/login` |
| `/admin/presentations/{slug}` | Admin Session | Manage presentation files, folders, and visitor credentials |
| `/admin/api/upload/{slug}` | Admin Session | Multipart file upload endpoint (up to 50 MiB per file) |
| `/admin/api/generate-passphrase` | Admin Session | Generates a 3-word corporate passphrase for visitor access |
| `/admin/api/v1/skill/presentations` | Bearer (`SKILL_API_TOKEN`) | `POST` to create a presentation and upload base64 files |
| `/admin/api/v1/skill/presentations/{slug}` | Bearer (`SKILL_API_TOKEN`) | `PUT` to replace presentation metadata and all R2 files |

---

## Setting Up on a New Cloudflare Account

Follow these steps from scratch to deploy this application to a brand-new Cloudflare account.

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

Initialize the `admins` and `presentations` tables on your remote D1 database:

```bash
npx wrangler d1 migrations apply presentations_db --remote
```

### Step 5: Create Your First Admin User

Generate a bcrypt hash (cost `10`) for your administrator password:

```bash
node -e "import('bcryptjs').then(b => console.log(b.default.hashSync('CHANGE_ME_STRONG_PASSWORD', 10)))"
```

Insert the admin record into your remote D1 database using the generated hash:

```bash
npx wrangler d1 execute presentations_db --remote --command "INSERT INTO admins (username, password_hash) VALUES ('admin', 'PASTE_BCRYPT_HASH_HERE');"
```

See [docs/admin_setup.md](docs/admin_setup.md) for additional details on managing local vs. remote admin accounts.

### Step 6: Configure Custom Branding (Optional)

All branding is controlled via environment variables under `"vars"` in [`wrangler.jsonc`](wrangler.jsonc) (or in the Cloudflare Dashboard under **Workers & Pages → your worker → Settings → Variables and Secrets**):

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | `"Presentation Manager"` | Application title shown in the `/admin` navigation bar, browser title, and footer. |
| `ORG_NAME` | Falls back to `APP_NAME` | Organization name shown on the public `/` landing page, footer copyright, and 401 Access Denied prompt. |
| `ORG_URL` | `""` *(hidden)* | External `https://...` website link displayed in the header on `/`. |
| `LOGO_URL` | `""` *(built-in icon)* | URL (`https://...` or `/path/to/logo.svg`) for your brand logo on `/`, the 401 page, and `/admin`. |
| `HERO_TITLE` | `"Interactive Presentations"` | Main headline on the public `/` landing page. |
| `HERO_SUBTITLE` | `"Explore shared presentations and interactive decks."` | Subtitle text on the public `/` landing page. |
| `PUBLIC_CONTENT_BASE_URL` | `""` *(same origin)* | Optional base URL override for "View" and "Copy public URL" links in `/admin` (leave empty to use the Worker's own origin). |

### Step 7: Configure the Skill API Secret (Optional)

If you want to create or update presentations programmatically via `/admin/api/v1/skill/presentations`, set a strong secret token:

```bash
npx wrangler secret put SKILL_API_TOKEN
```

### Step 8: Build and Deploy to Cloudflare

Build the Astro Worker bundle and deploy with Wrangler:

```bash
npm run build
npx wrangler deploy
```

#### Attaching a Domain or Enabling `workers.dev`
By default, [`wrangler.jsonc`](wrangler.jsonc) sets `"workers_dev": false` and `"preview_urls": false` so your Worker is only reachable on custom domains or routes you attach in the Cloudflare Dashboard (**Workers & Pages → your worker → Settings → Domains & Routes**). If you want to use a `*.workers.dev` subdomain instead, set `"workers_dev": true` in `wrangler.jsonc` before deploying.

---

## Local Development

1. Apply migrations and seed the local development admin (`testadmin` / `testpass123`):

   ```bash
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
        "data": "PGh0bWw+PC9odG1sPg=="
      }
    ]
  }'
```

For full Skill API details and the bundled upload helper script, see [skills/presentations-manager/SKILL.md](skills/presentations-manager/SKILL.md) and [docs/skill-api-runbook.md](docs/skill-api-runbook.md).

## Running Tests

```bash
npm test
```
