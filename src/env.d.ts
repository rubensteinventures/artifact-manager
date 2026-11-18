/// <reference types="astro/client" />

declare namespace App {
  interface SessionData {
    /** Logged-in admin username (opaque session id lives in the `astro-session` cookie; data in KV). */
    adminUsername: string;
  }
}

declare module 'cloudflare:workers' {
  interface Env {
    DB: D1Database;
    BUCKET: R2Bucket;
    SESSION: KVNamespace;
    /** Set via `wrangler secret put SKILL_API_TOKEN` (not in wrangler.jsonc). */
    SKILL_API_TOKEN?: string;
    /** Optional white-label branding and URL configuration variables. */
    APP_NAME?: string;
    ORG_NAME?: string;
    ORG_URL?: string;
    LOGO_URL?: string;
    HERO_TITLE?: string;
    HERO_SUBTITLE?: string;
    PUBLIC_CONTENT_BASE_URL?: string;
  }
}
