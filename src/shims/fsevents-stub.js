/**
 * macOS fsevents is optional for chokidar and cannot run in Workers / esbuild.
 * Resolves optional dependency to a no-op when bundled for Cloudflare.
 */
export default {};
