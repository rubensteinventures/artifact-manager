# Brag Plan: Presentation Manager

## What is this app?
A single, white-label Cloudflare Worker that serves interactive HTML presentations from Cloudflare R2 under `/content/{slug}/*` with per-deck D1 Basic Auth, paired with an Astro SSR admin dashboard under `/admin` and a Bearer-authenticated Skill API.

## The angle
Most teams either expose static decks on public bucket URLs or maintain separate viewer and admin apps. Presentation Manager collapses the entire stack—R2 edge viewer, per-deck PBKDF2 Basic Auth, client-side ZIP extraction uploader, and AI agent Skill API—into one zero-branding Cloudflare Worker configurable entirely via environment variables.

## Hook (first 2-3 seconds)
Full-bleed `#0f172a` slate canvas from the public homepage (`/`). The badge `SINGLE CLOUDFLARE WORKER · R2 + D1 + KV` snaps in, followed by the verbatim hero headline **"Interactive Presentations"** and subtitle **"Explore shared presentations and interactive decks."** before cutting into the live `/admin` workflow.

## Key moments (the middle)
- **The `/admin` Dashboard Table:** Three real presentation rows (`q4-product-roadmap`, `sample-deck`, `investor-briefing`) cascade onto the table on the beat grid, showcasing the three real access states: green **`Public`**, amber **`Protected`**, and yellow **`Needs password`**.
- **One-Click Protection + R2 ZIP Upload (`/admin/presentations/sample-deck`):** Split-frame recreation of the detail view—left card shows **Protection Settings** where a simulated cursor clicks **`Generate passphrase`** to fill a PBKDF2 visitor passphrase; right card shows **File Upload** (`Supports .html, assets, and .zip extraction`) extracting `index.html`, `assets/presentation-theme.css`, and `slides/executive-summary.pdf` into `content/sample-deck/`.
- **Edge Delivery & Skill API:** Dual payoff showing live R2 delivery at `/content/{slug}/*` (`X-Frame-Options: SAMEORIGIN`) alongside automated agent publishing via `POST /admin/api/v1/skill/presentations`.

## Outro / punchline
**"Presentation Manager"** lockup with the route map (`/` · `/content/{slug}/*` · `/admin` · `/admin/api/v1/skill/*`) and tagline: **"White-label R2 presentations. One Worker."**

## User flow worth showing
1. **Entry (`/admin`):** Create and inspect presentations (`q4-product-roadmap`, `sample-deck`, `investor-briefing`) with live `Public`, `Protected`, and `Needs password` status badges.
2. **Key Action (`/admin/presentations/sample-deck`):** Click **Generate passphrase** under **Protection Settings** to lock visitor access, and drop files/ZIPs into **File Upload** to populate `content/sample-deck/`.
3. **Result (`/content/{slug}/`):** Stream the static HTML deck directly from Cloudflare R2 at the edge with optional HTTP Basic Auth and `X-Frame-Options: SAMEORIGIN`.

## Tone
- Preset: `app-store`
- Creative direction: Crisp developer-infrastructure product film — high-contrast `#0f172a` dark slate frames paired with authentic `#f8fafc` Starwind UI cards and monospace route callouts.
- Interpretation: Clean, feature-forward, zero fluff; fast 0.4s entrances followed by generous readable holds so every route path, badge, and UI control is crystal clear.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
- Background: `#0f172a` (public hero slate-900) and `#f8fafc` (admin surface slate-50)
- Accent: `#2563eb` (primary blue-600) and `#38bdf8` (sky-400 highlight on dark)
- Text: `#f8fafc` on dark / `#0f172a` on light cards, `#475569` muted slate
- Display font: Inter / system-ui (`700`–`800` weight, `-0.025em` tracking)
- Body font: Inter / system-ui (`400`–`600` weight) + monospace (`JetBrains Mono` / `monospace`) for slugs and R2 object keys
- Strongest visual element: The `/admin` dashboard table with `Public` / `Protected` / `Needs password` badges and the `/admin/presentations/[slug]` split view (`Protection Settings` + `Presentation Files` / `File Upload`).

## Share copy (draft)
Presentation Manager is live: one white-label Cloudflare Worker serving R2 HTML decks at `/content/{slug}/` with D1 Basic Auth, an Astro admin dashboard at `/admin`, and a Bearer Skill API for automated publishing.

## Audio direction
- Role: Steady, clean rhythmic bed with restrained motion-matched UI and reveal accents
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM)
- Music treatment: Start at `0.0s` at `0.34` volume, subtle fade-in over `0.6s`, smooth fade-out from `18.2s` to `20.0s`
- Music cue guidance: Preset cue file read (`happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.md`, 109.96 BPM). Strong cues in window: `8.74s` (0.99), `13.11s` (0.98), `17.47s` (0.99). Beat grid window for Scene 2 sequential rows: `4.39s`, `5.34s`, `6.00s`.
- Audio-reactive treatment: Subtle; pre-extracted music RMS/bass gently modulates the background radial glow scale and card border luminance via per-frame timeline sampling. No waveform or equalizer graphics.
- SFX posture: Moderate, low/medium high-frequency risk picks from `sfx-analysis.md`
- Audio-coupled moments:
  - Scene 1 hero reveal (`0.2s`) → soft medium impact (`impact/impactSoft_medium_001.ogg`)
  - Scene 2 dashboard rows arriving in sequence (`4.91s`, `5.45s`, `6.00s`) → card slide accent (`casino/card-slide-1.ogg`)
  - Scene 3 simulated click on `Generate passphrase` (`10.93s`, strong cue) → crisp UI click (`interface/click_003.ogg`) + toggle (`interface/switch_007.ogg`)
  - Scene 4 final lockup (`16.38s` / `17.47s` strong cue) → resonant bell payoff (`impact/impactBell_heavy_000.ogg`)
- Restraint rule: Never stack loud hits over dense text reads; keep UI clicks crisp and low-risk.

## Storyboard

### Scene 1 — The Hook & Public Hero (`/`) — 4.4s (0.0s–4.4s)
Full-bleed `#0f172a` dark slate frame inspired by `src/pages/index.astro`. Top bar shows the white-label header (`Presentation Manager` with the presentation icon and `PRESENTATIONS` nav link). Center stage: pill badge `UNIFIED CLOUDFLARE WORKER · R2 + D1 + KV`, headline **"Interactive Presentations"**, and subtitle **"Explore shared presentations and interactive decks."** Bottom pills reveal the unified architecture: `/content/{slug}/*` (Public Viewer) + `/admin` (Astro SSR Admin).
Sequential/interaction: Two architecture route pills pop in sequentially at `1.64s` and `2.19s`.
Audio intent: Confident, clean product introduction.
Audio-coupled idea: Soft reveal hit at `0.20s` when the hero title lands.
Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady, 109.96 BPM).
Transition mood: Clean slide/cut → Scene 2 at `4.4s`.

### Scene 2 — The `/admin` Dashboard & Access States — 4.35s (4.4s–8.75s)
The `/admin` dashboard card (`Presentations — Manage your HTML-based presentations`) with the live search bar (`Search by name, slug, or protection status...`) and table headers (`Name`, `Slug`, `Uploaded`, `Protection`, `Actions`). Three presentation rows slide in sequentially:
1. `Q4 Platform & Architecture Roadmap` · `q4-product-roadmap` · `Just now` · **`Public`** (green badge)
2. `Enterprise Strategy Deck` · `sample-deck` · `Just now` · **`Protected`** (amber badge)
3. `Series B Investor Briefing` · `investor-briefing` · `Just now` · **`Needs password`** (yellow badge)
Sequential/interaction: Yes — the 3 presentation rows arrive one by one on the beat grid (`4.91s`, `5.45s`, `6.00s`) and hold settled through `8.75s` for full readability.
Audio intent: Tactile rhythm as each deck row populates the dashboard.
Audio-coupled idea: Card slide sound on the first row arrival.
Transition mood: Clean cut on strong cue `8.74s` → Scene 3.

### Scene 3 — Protection Settings & R2 ZIP File Manager (`/admin/presentations/sample-deck`) — 6.55s (8.75s–15.3s)
Split-screen recreation of `src/pages/admin/presentations/[slug].astro` for **Enterprise Strategy Deck** (`content/sample-deck/`):
- **Left Card (`Protection Settings`):** Shows `Public username: sample-deck`. At `10.93s` (strong cue), a cursor clicks **`Generate passphrase`**, populating the password field with `leverage-synergy-vector` and flipping the status badge to **`PBKDF2-SHA256 Protected`**.
- **Right Card (`Presentation Files` & `File Upload`):** Shows the R2 object table under `content/sample-deck/` (`assets/presentation-theme.css` `2.5 KB`, `index.html` `74 B`, `slides/executive-summary.pdf` `16.4 KB`) and the drag-and-drop zone (`Drag & drop files or folders here — Supports .html, assets, and .zip extraction`).
Sequential/interaction: Simulated button click on `Generate passphrase` at `10.93s` + R2 file rows staggered in.
Audio intent: Crisp interaction feedback on the passphrase click and file list confirmation.
Audio-coupled idea: `interface/click_003.ogg` at `10.93s` when `Generate passphrase` is clicked.
Transition mood: Smooth wipe → Scene 4 at `15.3s`.

### Scene 4 — Edge Viewer, Skill API & White-Label Outro — 4.7s (15.3s–20.0s)
Final lockup showing the three pillars side-by-side above the closing brand card:
1. **R2 Edge Viewer:** `/content/{slug}/*` · `X-Frame-Options: SAMEORIGIN`
2. **Admin & Security:** `/admin` · KV Sessions + D1 Basic Auth (`X-Frame-Options: DENY`)
3. **Agent Skill API:** `POST /admin/api/v1/skill/presentations` · Bearer Token ZIP Publishing
At `17.47s` (strong cue `0.99`), the final headline **"Presentation Manager"** and subtitle **"Zero hardcoded branding. Configure via wrangler.jsonc vars."** lock in and hold through `20.0s`.
Sequential/interaction: 3 pillar cards stagger in at `15.84s`, `16.38s`, `16.93s`, followed by the final lockup at `17.47s`.
Audio intent: Resonant completion payoff as the music fades cleanly to `20.0s`.
Audio-coupled idea: `impact/impactBell_heavy_000.ogg` at `17.47s` strong cue.

**Music mood for this video:** polished / upbeat (`happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`)
**Audio summary:** A steady 110 BPM instrumental bed with subtle audio-reactive glow breathing, punctuated by four low-HF-risk reveal, card-slide, click, and bell cues aligned to key product interactions.
