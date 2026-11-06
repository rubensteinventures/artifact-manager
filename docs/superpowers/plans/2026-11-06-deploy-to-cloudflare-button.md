# Deploy to Cloudflare Button & First-Run Admin Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable one-click "Deploy to Cloudflare" button support with automatic remote D1 migrations, `workers.dev` URLs out of the box, a zero-CLI first-run `/admin/setup` web screen, and an `ADMIN_USERNAME` / `ADMIN_PASSWORD` environment-variable override that works for both initial bootstrap and account recovery.

**Architecture:** We update `package.json` and `wrangler.jsonc` so Cloudflare Workers Builds automatically provisions `DB` (D1), `BUCKET` (R2), and `SESSION` (KV), applies D1 migrations against the `DB` binding during deploy, and exposes a live `*.workers.dev` URL immediately. In `src/lib/admin-auth.ts`, `src/middleware.ts`, `src/pages/admin/setup.astro`, and `src/pages/admin/login.astro`, we implement first-run admin bootstrap and recovery: when `admins` has 0 rows and no env override is configured, unauthenticated requests to `/admin*` redirect to `/admin/setup` for one-time setup. Whenever valid `ADMIN_USERNAME` + `ADMIN_PASSWORD` (`>= 8` chars) env vars are configured, `/admin/setup` is skipped and logging in at `/admin/login` with matching env credentials verifies in constant time and upserts the bcrypt hash into D1 (`ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`) so credentials persist in D1 even after the recovery env vars are removed.

**Tech Stack:** Cloudflare Workers, Astro 7 SSR (`@astrojs/cloudflare`), Cloudflare D1 (SQLite), Cloudflare R2, Cloudflare KV, `bcryptjs`, Starwind UI, Node.js test runner (`node --test`).

**Spec:** User requirements from conversation (Deploy to Cloudflare button reference + Option A `/admin/setup` + Option B `ADMIN_USERNAME` / `ADMIN_PASSWORD` override for both initial bootstrap and account recovery).

## Global Constraints

- `wrangler d1 migrations apply` in `package.json` `db:migrate:remote` MUST reference the binding name `DB` rather than `presentations_db` so Deploy Button users who customize the database name still succeed.
- `wrangler.jsonc` MUST set `"workers_dev": true` and omit invalid non-hex `"preview_id"` placeholders on `kv_namespaces` so automated provisioning succeeds cleanly.
- If `ADMIN_USERNAME` (matching `ADMIN_USERNAME_REGEX`) and `ADMIN_PASSWORD` (`8..128` chars) environment variables are set, `/admin/setup` MUST be considered initialized/locked, and logging in at `/admin/login` with those credentials MUST verify and upsert `(username, password_hash)` into D1 `admins` (`INSERT INTO admins (username, password_hash) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`).
- Once at least 1 row exists in `admins` (or valid `ADMIN_USERNAME` + `ADMIN_PASSWORD` env vars are set), `/admin/setup` (`GET` and `POST`) MUST be locked and redirect to `/admin/login` (or `/admin` if authenticated).
- Initial admin insertion on `/admin/setup` MUST use an atomic conditional SQL statement (`INSERT INTO admins (username, password_hash) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM admins)`) to prevent concurrent race conditions from creating multiple admin accounts via `/admin/setup`.
- Starwind Astro components in `src/pages/admin/setup.astro` MUST use `class="..."` (never `className="..."`).

## Review Focus

1. **Concurrent `POST /admin/setup` race condition:** Two simultaneous `POST /admin/setup` requests when `admins` is empty must result in at most one admin row created (`WHERE NOT EXISTS (SELECT 1 FROM admins)`), with the second request seeing 0 rows changed and redirecting/failing as already initialized.
2. **`ADMIN_USERNAME` / `ADMIN_PASSWORD` override with short/empty values:** Whitespace-only `ADMIN_USERNAME` or empty/under-8-character `ADMIN_PASSWORD` must be ignored and must not bypass `/admin/setup` or allow weak env login.
3. **Account recovery when an admin already exists in D1:** When `admins` already has an admin with an old password, setting valid `ADMIN_USERNAME` + `ADMIN_PASSWORD` in `env` and logging in at `/admin/login` must succeed, update the bcrypt hash in D1 via `ON CONFLICT(username) DO UPDATE`, and allow subsequent logins from D1 even after `ADMIN_USERNAME` / `ADMIN_PASSWORD` are removed from `env`.
4. **Direct navigation to `/admin/setup` after setup is complete:** Visiting `GET /admin/setup` or submitting `POST /admin/setup` when `admins` already has `>= 1` row (or valid env override is set) must never render the form or insert a user, redirecting instead to `/admin/login`.
5. **Cross-site `POST /admin/setup` CSRF attempt:** `isBlockedCrossSiteMutation('POST', '/admin/setup', 'cross-site')` must return `true` so cross-origin sites cannot hijack first-run setup.

---

### Task 1: First-Run Admin Bootstrap & Env-Var Override/Recovery Helpers (`src/lib/admin-auth.ts`)

**Files:**
- Modify: `src/lib/admin-auth.ts`
- Modify: `tests/security.test.mjs`

**Interfaces:**
- Consumes: `bcryptjs`, Web Crypto `crypto.subtle`
- Produces:
  - `getEnvAdminOverride(envVars?: Record<string, unknown>): { username: string; password: string } | null`
  - `validateAdminSetupInput(username: string, password: string, confirmPassword: string): { ok: true; username: string } | { ok: false; error: string }`
  - `ensureAdminInitialized(db: D1Database, envVars?: Record<string, unknown>): Promise<{ initialized: boolean; hasEnvOverride: boolean }>`
  - `createInitialAdmin(db: D1Database, input: { username: string; password: string; confirmPassword: string }, envVars?: Record<string, unknown>): Promise<{ ok: true; username: string } | { ok: false; alreadyInitialized: boolean; error: string }>`
  - `authenticateAdminLogin(db: D1Database, username: string, password: string, envVars?: Record<string, unknown>): Promise<boolean>`

- [ ] **Step 1: Write the failing unit tests in `tests/security.test.mjs`**

Add tests in `tests/security.test.mjs` covering:
1. `validateAdminSetupInput` rejects empty username, invalid username characters (`admin user!`), password `< 8` chars, password `> 128` chars, and mismatched `confirmPassword`, and accepts valid inputs (`admin`, `StrongPass123!`, `StrongPass123!`).
2. `ensureAdminInitialized` returns `{ initialized: false, hasEnvOverride: false }` when `admins` table is empty and no valid env vars are set, and returns `{ initialized: true, hasEnvOverride: true }` when valid `ADMIN_USERNAME` + `ADMIN_PASSWORD` (`>= 8` chars) are set (while ignoring short/empty env vars).
3. `createInitialAdmin` inserts the first admin atomically when `admins` is empty, and rejects a second `createInitialAdmin` call with `{ ok: false, alreadyInitialized: true }` once initialized (or when `ADMIN_USERNAME` + `ADMIN_PASSWORD` env override is present).
4. `authenticateAdminLogin` authenticates against D1 `admins`, and when `ADMIN_USERNAME` + `ADMIN_PASSWORD` env vars are provided, overrides/recovers an existing admin's lost password (or creates a new recovery admin) by upserting the new bcrypt hash into D1 so subsequent logins succeed even after `ADMIN_USERNAME` / `ADMIN_PASSWORD` are removed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with missing exports `validateAdminSetupInput`, `ensureAdminInitialized`, `createInitialAdmin`, `authenticateAdminLogin` from `../src/lib/admin-auth.ts`.

- [ ] **Step 3: Implement the helpers in `src/lib/admin-auth.ts`**

Implement in `src/lib/admin-auth.ts`:
- `ADMIN_USERNAME_REGEX = /^[a-zA-Z0-9._@-]{1,64}$/`
- `ADMIN_PASSWORD_MIN_LENGTH = 8` and `ADMIN_PASSWORD_MAX_LENGTH = 128`
- `getEnvAdminOverride(envVars)`: returns `{ username, password }` if `envVars?.ADMIN_USERNAME` (trimmed) matches `ADMIN_USERNAME_REGEX` and `envVars?.ADMIN_PASSWORD` has length `8..128`, else `null`.
- `validateAdminSetupInput(username, password, confirmPassword)`: trims `username` and validates pattern, password length `8..128`, and `password === confirmPassword`.
- `ensureAdminInitialized(db, envVars)`: checks `getEnvAdminOverride(envVars)` and queries `SELECT COUNT(*) AS count FROM admins`, returning `{ initialized: count > 0 || envOverride !== null, hasEnvOverride: envOverride !== null }`.
- `createInitialAdmin(db, input, envVars)`: checks `ensureAdminInitialized(db, envVars)`; if `initialized` is `true`, returns `{ ok: false, alreadyInitialized: true, error: 'Administrator account has already been configured.' }`. Validates input with `validateAdminSetupInput`, hashes password with `bcrypt.hash(input.password, 10)`, runs:
  ```sql
  INSERT INTO admins (username, password_hash)
  SELECT ?, ?
  WHERE NOT EXISTS (SELECT 1 FROM admins)
  ```
  and checks `res?.meta?.changes >= 1`.
- `authenticateAdminLogin(db, username, password, envVars)`:
  - Trims `username`. If empty or `password` empty, runs `verifyAdminCredentials('', '', null)` and returns `false`.
  - Checks `const envOverride = getEnvAdminOverride(envVars)`.
  - If `envOverride && username === envOverride.username`:
    - Performs constant-time SHA-256 digest comparison between `password` and `envOverride.password` AND runs a cost-10 bcrypt operation:
      - If password matches `envOverride.password`, hashes with `await bcrypt.hash(password, 10)` and upserts into D1:
        ```sql
        INSERT INTO admins (username, password_hash)
        VALUES (?, ?)
        ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash
        ```
        and returns `true`.
      - If password does not match `envOverride.password`, runs `await bcrypt.compare(password, DUMMY_ADMIN_BCRYPT_HASH)` and returns `false`.
  - Otherwise queries `SELECT username, password_hash FROM admins WHERE username = ?` from D1 and delegates to `verifyAdminCredentials(username, password, hashStr)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-auth.ts tests/security.test.mjs
git commit -m "feat: add first-run admin setup and env override/recovery helpers"
```

---

### Task 2: First-Run `/admin/setup` Page, Login Recovery Integration & Middleware Routing (`src/pages/admin/setup.astro`, `src/pages/admin/login.astro`, `src/middleware.ts`)

**Files:**
- Create: `src/pages/admin/setup.astro`
- Modify: `src/pages/admin/login.astro`
- Modify: `src/middleware.ts`
- Modify: `tests/admin-pages.test.mjs`
- Modify: `tests/security.test.mjs`

**Interfaces:**
- Consumes: `ensureAdminInitialized`, `createInitialAdmin`, `authenticateAdminLogin`, `getClientIp`, `checkLoginRateLimit`, `recordFailedLoginAttempt`, `clearLoginRateLimit` from `@/lib/admin-auth`
- Produces: `/admin/setup` route, env-override-aware `/admin/login`, and automatic middleware redirection when uninitialized

- [ ] **Step 1: Write the failing tests in `tests/admin-pages.test.mjs` and `tests/security.test.mjs`**

Add assertions verifying:
- `src/middleware.ts` calls `ensureAdminInitialized`, redirects uninitialized `/admin*` requests to `/admin/setup`, and redirects `/admin/setup` to `/admin/login` (or `/admin` when logged in) once initialized.
- `src/pages/admin/setup.astro` exists, uses `Layout`, `createInitialAdmin`, `ensureAdminInitialized`, regenerates session and sets `adminUsername` on success, redirects to `/admin`, and contains zero `className="` attributes.
- `src/pages/admin/login.astro` uses `authenticateAdminLogin` so `ADMIN_USERNAME` + `ADMIN_PASSWORD` env override/recovery works at login.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL because `src/pages/admin/setup.astro` does not exist and `src/middleware.ts` / `src/pages/admin/login.astro` do not yet call the new helpers.

- [ ] **Step 3: Implement `src/pages/admin/setup.astro`, update `src/middleware.ts`, and wire `authenticateAdminLogin` in `src/pages/admin/login.astro`**

1. In `src/middleware.ts`:
   - Import `ensureAdminInitialized` from `@/lib/admin-auth`.
   - For `/admin` and `/admin/*` (after CSRF check and `/admin/api/` pass-through):
     - Call `const { initialized } = await ensureAdminInitialized(env.DB, env as unknown as Record<string, unknown>);`
     - If `!initialized`:
       - If `normalizedPath !== '/admin/setup'`, return `applyAdminSecurityHeaders(context.redirect('/admin/setup'))`.
       - Return `applyAdminSecurityHeaders(await next())`.
     - Check `const adminUsername = await context.session?.get('adminUsername')`.
     - If `normalizedPath === '/admin/setup'`:
       - Return `applyAdminSecurityHeaders(context.redirect(adminUsername ? '/admin' : '/admin/login'))`.
     - Keep existing `/admin/login` redirect rules for unauthenticated and authenticated users.
2. Create `src/pages/admin/setup.astro`:
   - Defense-in-depth check at top of frontmatter: run `ensureAdminInitialized(env.DB, env as unknown as Record<string, unknown>)`; if `initialized` is `true`, redirect to `/admin/login`.
   - On `POST`: check `checkLoginRateLimit(env.SESSION, clientIp)`, read `username`, `password`, `confirm_password` from `formData()`, call `createInitialAdmin(env.DB, { username, password, confirmPassword }, env as unknown as Record<string, unknown>)`.
   - If `alreadyInitialized`, redirect to `/admin/login`.
   - If `ok`: clear rate limit, regenerate session, set `adminUsername`, and redirect to `/admin`.
   - Render a Starwind UI card ("Initial Administrator Setup") with fields for `username`, `password` (minlength 8), and `confirm_password` (minlength 8), using `class="..."` everywhere.
3. Update `src/pages/admin/login.astro`:
   - Replace inline D1 query + `verifyAdminCredentials` with `await authenticateAdminLogin(env.DB, username, password, env as unknown as Record<string, unknown>)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/pages/admin/setup.astro src/pages/admin/login.astro tests/admin-pages.test.mjs tests/security.test.mjs
git commit -m "feat: add /admin/setup screen and env login override/recovery"
```

---

### Task 3: Cloudflare Deploy Button Configuration & Documentation (`package.json`, `wrangler.jsonc`, `README.md`, `docs/admin_setup.md`)

**Files:**
- Modify: `package.json`
- Modify: `wrangler.jsonc`
- Modify: `README.md`
- Modify: `docs/admin_setup.md`
- Modify: `tests/config.test.mjs`
- Modify: `tests/zero-branding-and-docs.test.mjs`

**Interfaces:**
- Consumes: `/admin/setup` route and `ADMIN_USERNAME` / `ADMIN_PASSWORD` env override/recovery
- Produces: Deploy-Button-ready `package.json`, `wrangler.jsonc`, and `README.md` badge + setup/recovery guide

- [ ] **Step 1: Write the failing config and documentation tests in `tests/config.test.mjs` and `tests/zero-branding-and-docs.test.mjs`**

Add assertions verifying:
- `package.json` defines `"db:migrate:remote": "wrangler d1 migrations apply DB --remote"`, `"deploy": "npm run build && npm run db:migrate:remote && wrangler deploy"`, and `"cloudflare.bindings"` descriptions for `DB`, `BUCKET`, and `SESSION`.
- `wrangler.jsonc` sets `"workers_dev": true` and does not include `"preview_id": "YOUR_PREVIEW_KV_NAMESPACE_ID"`.
- `README.md` includes the `https://deploy.workers.cloudflare.com/?url=https://github.com/jaronrubenstein/artifact-manager` button badge, documents `/admin/setup`, and documents the `ADMIN_USERNAME` / `ADMIN_PASSWORD` override and account recovery workflow.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL on missing `deploy` script, `workers_dev: true`, and Deploy to Cloudflare button in `README.md`.

- [ ] **Step 3: Update `package.json`, `wrangler.jsonc`, `README.md`, and `docs/admin_setup.md`**

1. In `package.json`:
   - Add `"db:migrate:remote": "wrangler d1 migrations apply DB --remote"` and `"deploy": "npm run build && npm run db:migrate:remote && wrangler deploy"` to `"scripts"`.
   - Add `"cloudflare": { "bindings": { "DB": { ... }, "BUCKET": { ... }, "SESSION": { ... } } }`.
2. In `wrangler.jsonc`:
   - Set `"workers_dev": true` (and remove `"preview_urls": false`).
   - Remove `"preview_id": "YOUR_PREVIEW_KV_NAMESPACE_ID"` from `kv_namespaces[0]`.
3. In `README.md` and `docs/admin_setup.md`:
   - Add the `[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jaronrubenstein/artifact-manager)` badge near the top of `README.md`.
   - Add a **One-Click Deploy to Cloudflare** section explaining how the button provisions D1 (`DB`), R2 (`BUCKET`), and KV (`SESSION`), applies D1 migrations, and deploys the Worker, after which visiting `/admin` opens the one-time `/admin/setup` screen.
   - Document how `ADMIN_USERNAME` and `ADMIN_PASSWORD` can be set in Cloudflare Worker Variables/Secrets both to skip `/admin/setup` on first deploy and to recover/reset a lost admin username or password (syncing the new bcrypt hash into D1 upon login).

- [ ] **Step 4: Run tests and full build to verify everything passes**

Run: `npm test && npm run build`
Expected: All tests PASS and `astro build` succeeds with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add package.json wrangler.jsonc README.md docs/admin_setup.md tests/config.test.mjs tests/zero-branding-and-docs.test.mjs
git commit -m "feat: add Deploy to Cloudflare button config and documentation"
```
