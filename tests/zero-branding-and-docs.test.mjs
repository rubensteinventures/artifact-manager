import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.astro', '.wrangler', '.superpowers']);

function walkFiles(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (IGNORED_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walkFiles(full, out);
		} else {
			out.push(full);
		}
	}
	return out;
}

test('entire repository contains zero proprietary branding or legacy Cloudflare resource IDs', () => {
	const forbiddenPatterns = [
		/innovaition/i,
		/rubenstein/i,
		/hubspotusercontent/i,
		/49211790/,
		/911d2b94-2e1e-420b-aef0-ec16bdac5a15/,
		/2ef80afa62094235a683a4eaf59ffa01/,
		/674f4ecd29424e74ae471f8cfe7a1df2/,
	];

	const allFiles = walkFiles(rootDir).filter(
		(f) =>
			!f.endsWith('tests/zero-branding-and-docs.test.mjs') &&
			!f.endsWith('tests/config.test.mjs') &&
			!f.endsWith('tests/content-viewer.test.mjs') &&
			!f.includes('docs/superpowers/')
	);

	for (const file of allFiles) {
		const content = fs.readFileSync(file, 'utf8');
		for (const pattern of forbiddenPatterns) {
			assert.doesNotMatch(
				content,
				pattern,
				`Forbidden pattern ${pattern} found in ${path.relative(rootDir, file)}`
			);
		}
	}
});

test('README.md documents new Cloudflare account setup, branding variables, and /admin/api/v1/skill paths', () => {
	const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
	assert.match(readme, /wrangler d1 create/);
	assert.match(readme, /wrangler r2 bucket create/);
	assert.match(readme, /wrangler kv namespace create/);
	assert.match(readme, /wrangler d1 migrations apply/);
	assert.match(readme, /APP_NAME/);
	assert.match(readme, /ORG_NAME/);
	assert.match(readme, /LOGO_URL/);
	assert.match(readme, /PUBLIC_CONTENT_BASE_URL/);
	assert.match(readme, /\/admin\/api\/v1\/skill\/presentations/);

	const skillScript = fs.readFileSync(
		path.join(rootDir, 'skills/presentations-manager/scripts/update_presentation.js'),
		'utf8'
	);
	assert.match(skillScript, /\/admin\/api\/v1\/skill\/presentations\//);
});
