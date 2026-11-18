import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  // Astro compares Origin to request URL origin; on Workers that often mismatches (dev --remote,
  // proxies, http vs https), blocking legitimate same-app form POSTs with 403.
  security: {
    checkOrigin: false,
  },
  // Driver omitted: @astrojs/cloudflare injects Workers KV via sessionDrivers.cloudflareKVBinding (binding SESSION).
  session: {
    cookie: {
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    },
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@/components': path.resolve('./src/components'),
        '@/layouts': path.resolve('./src/layouts'),
        '@/styles': path.resolve('./src/styles'),
        '@': path.resolve('./src'),
        // Wrangler → blake3-wasm publishes a broken Node ESM entry (`./node.js` missing).
        // Force the WASM/browser build for the Workers bundle.
        'blake3-wasm': path.resolve(
          rootDir,
          'node_modules/blake3-wasm/esm/browser/index.js'
        ),
        // Optional chokidar native watcher; not loadable in Workers / esbuild.
        fsevents: path.resolve(rootDir, 'src/shims/fsevents-stub.js'),
      },
    },
  },
});
