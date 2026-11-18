# Skill API Operations Runbook

Bearer-authenticated JSON API for creating presentations and fully replacing their R2 content. Same contract as [README.md](../README.md#skill-api-bearer-token); this page is for operators.

## Base URL (origin)

Use the deployed Worker hostname with **HTTPS**:

- **Production example**: `https://presentations.example.com`
- **Local dev**: whatever host `npx wrangler dev` prints (often `http://localhost:8787` or `http://localhost:4321`).

All Skill API paths are under `/admin/api/v1/skill/`.

## Secret: `SKILL_API_TOKEN`

The Worker reads **`SKILL_API_TOKEN`** from the environment (never commit it).

| Context | How to set |
| --- | --- |
| **Production / preview Workers** | `npx wrangler secret put SKILL_API_TOKEN` in this repo; paste the token when prompted. |
| **Local `wrangler dev`** | Add to **`.dev.vars`** in the project root (gitignored). Example: `SKILL_API_TOKEN=your-local-token` |

Treat the token like a production API key—only people or automation systems that may create or overwrite presentations should hold it.

## Rotation

1. Generate a new random token (e.g. `openssl rand -hex 32`).
2. `npx wrangler secret put SKILL_API_TOKEN` and paste the **new** value.
3. Update any automation or agent environment (`PRESENTATIONS_SKILL_API_TOKEN`) to the new value.

Old tokens stop working immediately once the secret is updated.

## What the token can do

Anyone with a valid Bearer token can:

- **Create** a new presentation (`POST /admin/api/v1/skill/presentations`).
- **Fully replace** an existing presentation’s metadata and **all** files under `content/{slug}/` (`PUT /admin/api/v1/skill/presentations/{slug}`).

## Troubleshooting

| HTTP | Meaning |
| --- | --- |
| `503` | `SKILL_API_TOKEN` is not set on the Worker (configure secret or `.dev.vars`). |
| `401` | Missing `Authorization: Bearer`, wrong token, or malformed header. |
| `415` | Request `Content-Type` is not `application/json`. |

## Related docs

- Agent instructions: [skills/presentations-manager/SKILL.md](../skills/presentations-manager/SKILL.md)
