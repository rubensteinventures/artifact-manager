# Open-Source Release Readiness, Package Upgrade & Privacy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all npm dependencies to their latest published versions, fix the `/admin/setup` branding write ordering so unauthenticated racing requests cannot mutate branding settings before atomic admin creation, scrub all remaining developer local paths and legacy organization/UUID strings from tracked documentation and tests, and execute the full 8-phase `secure-release` certification audit.

**Architecture:** Update `package.json` and `package-lock.json` to the latest npm releases (`astro@7.4.12`, `@astrojs/cloudflare@14.4.8`, `@astrojs/compiler-rs@0.5.3`, `@tabler/icons@3.52.0`, `tailwind-variants@4.0.2`, `wrangler@4.164.0`). Extract `validateBrandingFormData()` in `src/lib/branding.ts` so `src/pages/admin/setup.astro` validates branding inputs first, runs `createInitialAdmin()` atomically, and persists branding to D1/R2 only if initial admin creation succeeds. Replace plaintext legacy strings in `tests/` and `docs/` with neutral placeholders and SHA-256 token digest checks in `tests/zero-branding-and-docs.test.mjs` covering the entire repository tree.

**Tech Stack:** Astro 7 SSR (`@astrojs/cloudflare`), Cloudflare Workers (D1, R2, KV), TypeScript, Node.js test runner (`node:test`), TruffleHog, Cisco AI Defense `skill-scanner`.

**Spec:** `.gemini_security/COMPREHENSIVE_RELEASE_REPORT.md` (8-Phase Secure Release Protocol)

## Global Constraints

- All `dependencies` and `devDependencies` in `package.json` must resolve to the latest versions published on the npm registry as of 2026-11-17.
- `POST /admin/setup` must never write to D1 `settings` or R2 `_branding/*` unless `createInitialAdmin` succeeds (`result.ok === true`), while still validating branding inputs before creating the initial admin so invalid branding inputs do not lock `/admin/setup` without saving branding.
- Zero occurrences of local developer home paths, legacy company names, third-party CRM portal IDs, or production Cloudflare D1/KV UUIDs anywhere in tracked repository files (including `docs/superpowers/`, `docs/brag/`, and `tests/`).
- All unit and integration tests (`npm test`) and the production Cloudflare Worker build (`npm run build`) must pass with exit code `0`.

## Review Focus

- Concurrent or post-initialization `POST /admin/setup` requests (`createInitialAdmin` returning `alreadyInitialized: true`) must not overwrite D1 `settings` or R2 `_branding/*`.
- Submitting invalid branding inputs (such as `javascript:alert(1)` in `org_url` or an oversized `logo_file`) on `POST /admin/setup` must fail validation before `createInitialAdmin` inserts an admin row, allowing the user to correct the form and resubmit.
- `tests/zero-branding-and-docs.test.mjs` must scan all tracked files (including `docs/superpowers/`, `docs/brag/`, and `tests/`) and block both `/Users/` local filesystem paths and SHA-256-matched legacy identifiers without embedding those identifiers in plaintext.
- Upgrading `astro`, `@astrojs/cloudflare`, `@astrojs/compiler-rs`, `@tabler/icons`, `tailwind-variants`, and `wrangler` must leave `npm audit` with `0` vulnerabilities and `npm run build` succeeding cleanly.
- All 8 phases of `secure-release` (`SECURITY_ANALYSIS_TODO.md`, `npm_audit.json`, `sast_candidates.json`, `sbom.json`, `trufflehog_fs.txt`, `trufflehog_git.txt`, `skill-scanner`, and `COMPREHENSIVE_RELEASE_REPORT.md`) must be freshly generated and verified.

---

### Task 1: Upgrade npm Packages to Latest Releases

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/config.test.mjs`

**Interfaces:**
- Consumes: npm registry latest versions
- Produces:
  - `@astrojs/cloudflare`: `^14.4.8`
  - `@astrojs/compiler-rs`: `^0.5.3`
  - `@tabler/icons`: `^3.52.0`
  - `astro`: `^7.4.12`
  - `tailwind-variants`: `^4.0.2`
  - `wrangler`: `^4.164.0`

- [ ] **Step 1: Update `package.json` version ranges and run `npm install`**

Run: `npm install @astrojs/cloudflare@^14.4.8 @astrojs/compiler-rs@^0.5.3 @tabler/icons@^3.52.0 astro@^7.4.12 tailwind-variants@^4.0.2 && npm install -D wrangler@^4.164.0`
Expected: Packages updated in `package.json` and `package-lock.json` with `0` vulnerabilities.

- [ ] **Step 2: Verify `npm outdated`, `npm test`, and `npm run build`**

Run: `npm outdated && npm test && npm run build`
Expected: `npm outdated` outputs nothing (exit 0), all tests pass, and Astro Cloudflare build succeeds.

---

### Task 2: Harden `/admin/setup` Branding Persistence Ordering (`src/lib/branding.ts`, `src/pages/admin/setup.astro`)

**Files:**
- Modify: `src/lib/branding.ts`
- Modify: `src/pages/admin/setup.astro`
- Modify: `tests/branding.test.mjs`
- Modify: `tests/admin-pages.test.mjs`

**Interfaces:**
- Consumes: `FormData`, `R2Bucket | undefined`
- Produces in `src/lib/branding.ts`:
  - `validateBrandingFormData(formData: FormData, hasBucket?: boolean): { ok: true } | { ok: false; error: string }`

- [ ] **Step 1: Write failing tests in `tests/branding.test.mjs` and `tests/admin-pages.test.mjs`**

```js
test('validateBrandingFormData validates URLs, MIME types, file sizes, and bucket availability without mutating D1 or R2', () => {
	const validForm = new FormData();
	validForm.set('org_url', 'https://example.com');
	validForm.set('logo_file', new File(['<svg></svg>'], 'logo.svg', { type: 'image/svg+xml' }));
	assert.deepEqual(validateBrandingFormData(validForm, true), { ok: true });
	assert.equal(validateBrandingFormData(validForm, false).ok, false);

	const badForm = new FormData();
	badForm.set('org_url', 'javascript:alert(1)');
	assert.equal(validateBrandingFormData(badForm, true).ok, false);
});
```

And in `tests/admin-pages.test.mjs`, assert that `src/pages/admin/setup.astro` calls `validateBrandingFormData` before `createInitialAdmin` and calls `saveBrandingSettings` only after `createInitialAdmin` succeeds (`if (result.ok)`).

- [ ] **Step 2: Run `node --test tests/branding.test.mjs tests/admin-pages.test.mjs` to verify failure**

Run: `node --test tests/branding.test.mjs tests/admin-pages.test.mjs`
Expected: FAIL (`validateBrandingFormData` not exported / `saveBrandingSettings` called before `createInitialAdmin`).

- [ ] **Step 3: Implement `validateBrandingFormData` in `src/lib/branding.ts` and reorder `src/pages/admin/setup.astro`**

Extract URL and file validation into `validateBrandingFormData(formData: FormData, hasBucket = true)` in `src/lib/branding.ts`, call it inside `saveBrandingSettings` and in `src/pages/admin/setup.astro` prior to `createInitialAdmin`, and move `await saveBrandingSettings(env.DB, env.BUCKET, formData)` inside `if (result.ok)` in `src/pages/admin/setup.astro`.

- [ ] **Step 4: Run `node --test tests/branding.test.mjs tests/admin-pages.test.mjs` to verify it passes**

Run: `node --test tests/branding.test.mjs tests/admin-pages.test.mjs`
Expected: PASS

---

### Task 3: Scrub Developer Paths & Legacy Identifiers from Docs and Tests

**Files:**
- Modify: `docs/brag/composition-brief.md`
- Modify: `docs/superpowers/plans/2026-11-06-unified-presentations-worker.md`
- Modify: `docs/superpowers/plans/2026-11-06-branding-setup-and-settings.md`
- Modify: `docs/superpowers/specs/2026-11-06-unified-presentations-worker-design.md`
- Modify: `tests/config.test.mjs`
- Modify: `tests/content-viewer.test.mjs`
- Modify: `tests/zero-branding-and-docs.test.mjs`

**Interfaces:**
- Consumes: Node `node:crypto` (`createHash('sha256')`)
- Produces: Zero-leakage test suite scanning all tracked files in the repository

- [ ] **Step 1: Update `tests/zero-branding-and-docs.test.mjs` to scan all tracked files (including `docs/` and `tests/`) for local home paths and SHA-256-hashed forbidden tokens**

Replace plaintext regexes in `tests/zero-branding-and-docs.test.mjs` with SHA-256 token digests of the forbidden legacy identifiers plus a regex blocking local developer home paths, removing the file exclusions for `docs/superpowers/`, `tests/config.test.mjs`, and `tests/content-viewer.test.mjs`.

- [ ] **Step 2: Run `node --test tests/zero-branding-and-docs.test.mjs` to verify it fails on the existing leaks**

Run: `node --test tests/zero-branding-and-docs.test.mjs`
Expected: FAIL identifying `docs/brag/composition-brief.md`, `docs/superpowers/*`, `tests/config.test.mjs`, and `tests/content-viewer.test.mjs`.

- [ ] **Step 3: Scrub `docs/brag/composition-brief.md`, `docs/superpowers/*`, `tests/config.test.mjs`, and `tests/content-viewer.test.mjs`**

Replace local home directory paths with relative paths (`skills/brag/...` or repository root `.`), and replace legacy organization names/UUIDs in `docs/superpowers/*`, `tests/config.test.mjs`, and `tests/content-viewer.test.mjs` with positive placeholder assertions (`"database_id": "00000000-0000-0000-0000-000000000000"` and `"id": "YOUR_KV_NAMESPACE_ID"`).

- [ ] **Step 4: Run `npm test` to verify all tests pass**

Run: `npm test`
Expected: PASS

---

### Task 4: Full 8-Phase `secure-release` Audit & Certification Report

**Files:**
- Modify: `.gemini_security/SECURITY_ANALYSIS_TODO.md`
- Modify: `.gemini_security/npm_audit.json`
- Modify: `.gemini_security/sast_candidates.json`
- Modify: `.gemini_security/sbom.json`
- Modify: `.gemini_security/trufflehog_fs.txt`
- Modify: `.gemini_security/trufflehog_git.txt`
- Modify: `.gemini_security/COMPREHENSIVE_RELEASE_REPORT.md`

- [ ] **Step 1: Execute Phases 1–7 scans and update `.gemini_security/*` artifacts**

Run scope/LOC calculation, `npm audit --json`, SAST pattern scan, SBOM generation, `trufflehog filesystem`, `trufflehog git file://.`, and `skill-scanner scan-all skills --recursive --use-behavioral --use-osv`.

- [ ] **Step 2: Generate updated `.gemini_security/COMPREHENSIVE_RELEASE_REPORT.md` and run final verification**

Run: `npm test && npm run build`
Expected: All tests pass (`0` failures) and production build succeeds (`exit 0`).
