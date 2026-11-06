---
name: presentations-manager
license: MIT
description: >-
  Creates or fully replaces HTML presentations on the unified presentations
  manager (Cloudflare Worker) using the Bearer Skill API. Use when the user asks
  to deploy a deck, upload presentation files to R2, create or update a
  presentation via the skill API, or automate the presentations manager worker
  without the admin UI.
---

# Presentations Manager Skill API

Call the Worker’s **Skill API** with a **Bearer token**. Do **not** use admin session cookies; this API is separate from the `/admin` dashboard login.

## Prerequisites

Read from environment (never embed secrets in chat or commit them):

| Variable | Purpose |
|----------|---------|
| `PRESENTATIONS_MANAGER_ORIGIN` | Base URL, no trailing slash (e.g. `https://presentations.example.com`). |
| `PRESENTATIONS_SKILL_API_TOKEN` | Same value as the Worker secret `SKILL_API_TOKEN`. |

If variables are missing, ask the user to set them (or use `.dev.vars` for local Worker development).

## Endpoints

| Action | Method | Path |
|--------|--------|------|
| Create presentation | `POST` | `{ORIGIN}/admin/api/v1/skill/presentations` |
| Full replace (metadata + all files) | `PUT` | `{ORIGIN}/admin/api/v1/skill/presentations/{slug}` |

**Headers (both):**

- `Authorization: Bearer ${PRESENTATIONS_SKILL_API_TOKEN}`
- `Content-Type: application/json`

Use `fetch` in a script or `curl` in the terminal with these headers.

## Full replace warning (PUT)

`PUT` **deletes every object** under `content/{slug}/` in R2, then uploads **only** the files in the request body. Always send the **complete** set of files that should exist after the operation. Omitting a file that used to exist **removes** it. An empty `files` array clears all files under that slug (after wiping the prefix, nothing is re-uploaded).

## JSON body

### POST (create)

- `slug` (string): required. Lowercase letters, numbers, hyphens only; pattern like `q1-marketing` (no leading/trailing or doubled hyphens).
- `name` (string): display name; non-empty after trim.
- `access`:  
  - `{ "mode": "public" }`, or  
  - `{ "mode": "protected", "publicUsername": "<slug-style>", "visitorPassword": "<plain password>" }`  
  For protected mode, visitor password must meet app rules: at least 12 characters with upper, lower, number, and symbol **or** a generated-style passphrase of three hyphen-separated lowercase segments (each segment at least 4 letters). See repo `src/lib/presentation-password.ts` if details are needed.
- `files` (array, optional): default `[]`. Each item: `{ "path": "relative/path", "data": "<base64>", "contentType": "text/html" }` (contentType optional).

### PUT (update)

Same as POST but **omit `slug`**; the slug is **only** in the URL path.

## Files array rules

- Paths are relative to `content/{slug}/` (e.g. `index.html`, `assets/logo.png`).
- No `..`, no absolute paths; invalid paths return `400`.
- `data` is standard base64 for the raw file bytes. Empty string is allowed for a zero-byte object.
- Optional `contentType` (string) is passed through to R2.

## Limits

- At most **200** files per request.
- Each decoded file **≤ 15 MiB**.
- The Worker request body size limit may still cap very large single JSON payloads; split work or use smaller assets if requests fail.

## HTTP responses

| Status | Meaning |
|--------|---------|
| `201` | POST succeeded (`{ "ok": true, "slug", "name" }`). |
| `200` | PUT succeeded (same shape). |
| `400` | Validation, bad path, bad base64, invalid JSON body. |
| `401` | Missing or invalid Bearer token. |
| `404` | PUT: unknown `slug`. |
| `409` | POST: slug already exists. |
| `413` | Decoded file too large. |
| `415` | `Content-Type` is not `application/json`. |
| `503` | `SKILL_API_TOKEN` not configured on the Worker. |

## Minimal examples

Replace `$ORIGIN` and `$TOKEN` with env-backed values in practice.

**Create:**

```bash
curl -sS -X POST "$ORIGIN/admin/api/v1/skill/presentations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slug":"my-deck","name":"My Deck","access":{"mode":"public"},"files":[]}'
```

**Full replace:**

```bash
curl -sS -X PUT "$ORIGIN/admin/api/v1/skill/presentations/my-deck" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Deck","access":{"mode":"public"},"files":[{"path":"index.html","contentType":"text/html","data":"<BASE64_ENCODED_FILE_CONTENT>"}]}'
```

## Bundled Script: update_presentation.js

For convenience, a generic Node.js script is bundled with this skill to handle the multi-file upload and base64 encoding.

**Path:** `scripts/update_presentation.js`

**Usage:**
```bash
node skills/presentations-manager/scripts/update_presentation.js <slug> "<display name>" [optional-file-list]
```

- If no file list is provided, it automatically uploads `index.html`, `favicon.svg`, and any `.png` files found in the current directory.
- It requires `PRESENTATIONS_MANAGER_ORIGIN` and `PRESENTATIONS_SKILL_API_TOKEN` environment variables.

## Reference in repo

- API details and curl: [README.md](../../README.md#skill-api-bearer-token)
- Operator runbook: [docs/skill-api-runbook.md](../../docs/skill-api-runbook.md)
