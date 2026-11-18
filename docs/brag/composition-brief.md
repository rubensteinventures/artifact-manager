# Hyperframes Composition Brief: Presentation Manager

## Objective
Create a short launch-style brag video for Presentation Manager (`artifact-manager`).

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: `.`
- Primary files read: `src/pages/index.astro`, `src/pages/admin/index.astro`, `src/pages/admin/presentations/[slug].astro`, `src/lib/content-viewer.ts`, `src/lib/branding.ts`, `wrangler.jsonc`, `README.md`
- Product name: Presentation Manager
- Tagline / strongest claim: A unified, white-label Cloudflare Worker that serves static presentations from an R2 bucket (`/content/{slug}/*`) and provides an Astro SSR admin dashboard (`/admin`) and Bearer-authenticated Skill API (`/admin/api/v1/skill/presentations*`).
- Key UI or visual moment to recreate:
  1. Public homepage hero (`Interactive Presentations` / `Explore shared presentations and interactive decks.`)
  2. Admin dashboard table (`/admin`) with `Public`, `Protected`, and `Needs password` badges
  3. Presentation detail view (`/admin/presentations/sample-deck`) with **Protection Settings** (`Generate passphrase`), **Presentation Files** (`content/sample-deck/`), and **File Upload** (`Drag & drop files or folders here`)
- Copy that must appear verbatim:
  - `Presentation Manager`
  - `Interactive Presentations`
  - `Explore shared presentations and interactive decks.`
  - `Protection Settings`
  - `Generate passphrase`
  - `Drag & drop files or folders here`
  - `Supports .html, assets, and .zip extraction`

## Creative Direction
- Tone preset: `app-store`
- Creative direction: Crisp developer-infrastructure product film — high-contrast `#0f172a` dark slate frames paired with authentic `#f8fafc` Starwind UI cards and monospace route callouts.
- Interpretation: Fast 0.35–0.45s entrances with generous settled holds (1.5s–3.5s) so every real UI label, slug, and route path is effortless to read.
- Angle: Two separate Workers (public R2 viewer + Astro SSR admin manager) unified into one white-label, zero-branding Cloudflare Worker with per-deck Basic Auth, browser ZIP extraction, and an AI Agent Skill API.
- Hook: Verbatim dark-slate hero from `/` (`Interactive Presentations`) revealing the unified `/content/{slug}/*` + `/admin` architecture in the first 2.5 seconds.
- Outro / punchline: `Presentation Manager` — `Zero hardcoded branding. Configure via wrangler.jsonc vars.`
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign

## Visual Identity
- Background: `#0f172a` (slate-900 canvas) with `#f8fafc` / `#ffffff` Starwind UI card surfaces
- Text: `#f8fafc` on dark, `#0f172a` on light cards, `#475569` secondary slate
- Accent: `#2563eb` (blue-600 primary), `#38bdf8` (sky-400 dark-mode accent), `#166534`/`#dcfce7` (`Public` badge), `#92400e`/`#fef3c7` (`Protected` badge), `#854d0e`/`#fef9c3` (`Needs password` badge)
- Display font: Inter / system-ui (`700`–`800`)
- Body font: Inter / system-ui (`400`–`600`) and monospace for paths (`content/sample-deck/`, `/admin/api/v1/skill/presentations`)
- Visual references from the project:
  - Header logo icon (presentation board SVG) + `Presentation Manager` title from `src/pages/index.astro` and `src/layouts/AdminLayout.astro`
  - Dashboard table rows and protection status pills from `src/pages/admin/index.astro`
  - `Protection Settings`, `Presentation Files`, and `File Upload` cards from `src/pages/admin/presentations/[slug].astro`

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. **Scene 1 — The Hook & Public Hero (`/`)** — `4.4s` (`0.0s–4.4s`) — Verbatim `Presentation Manager` header, `Interactive Presentations` headline, `Explore shared presentations and interactive decks.` subtitle, and unified `/content/{slug}/*` + `/admin` route pills.
2. **Scene 2 — The `/admin` Dashboard & Access States** — `4.35s` (`4.4s–8.75s`) — Recreated `/admin` table where `q4-product-roadmap` (`Public`), `sample-deck` (`Protected`), and `investor-briefing` (`Needs password`) slide in on the beat grid.
3. **Scene 3 — Protection Settings & R2 ZIP File Manager (`/admin/presentations/sample-deck`)** — `6.55s` (`8.75s–15.3s`) — Split view of `Protection Settings` (cursor clicks `Generate passphrase` at `10.93s`) and `Presentation Files` / `File Upload` (`content/sample-deck/` with `assets/presentation-theme.css`, `index.html`, `slides/executive-summary.pdf`).
4. **Scene 4 — Edge Viewer, Skill API & White-Label Outro** — `4.7s` (`15.3s–20.0s`) — Three architecture cards (`/content/{slug}/*`, `/admin`, `/admin/api/v1/skill/presentations`) and final `Presentation Manager` lockup at `17.47s`.

## Audio
- Audio role: Steady, clean rhythmic support with sparse, motion-matched UI and reveal accents
- Audio arc: Smooth fade-in at `0.0s`, steady groove across the dashboard and file-manager walkthrough, resonant bell lockup at `17.47s`, clean fade-out to `20.0s`
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: `data-volume="0.34"`, fade in `0.0s–0.6s`, fade out `18.2s–20.0s`
- Music cue guidance: Bundled preset `skills/brag/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (109.96 BPM). Target strong cues: `8.74s` (Scene 3 transition), `10.93s` (`Generate passphrase` click), `17.47s` (Scene 4 final lockup). Beat grid for Scene 2 rows: `4.91s`, `5.45s`, `6.00s`.
- Audio-reactive treatment: Subtle; use pre-extracted music RMS/bass (`extract-audio-data.py`) to gently modulate background radial glow scale (`1.0`–`1.08`) and card highlight presence.
- Audio-coupled moments:
  - `0.20s` — Hero reveal (`impact/impactSoft_medium_001.ogg`)
  - `4.91s` — Dashboard table rows sequence (`casino/card-slide-1.ogg`)
  - `8.74s` — Scene 3 split-view transition (`impact/impactSoft_medium_002.ogg`)
  - `10.93s` — Cursor clicks `Generate passphrase` (`interface/click_003.ogg`)
  - `17.47s` — Final `Presentation Manager` lockup (`impact/impactBell_heavy_000.ogg`)
- SFX selection guidance: Low/medium HF risk files from `skills/brag/assets/sfx/sfx-analysis.md`.
- Audio files: Copy into `brag-output/composition/assets/music/` and `brag-output/composition/assets/sfx/`.
