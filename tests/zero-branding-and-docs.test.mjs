import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const IGNORED_DIRS = new Set([
	'node_modules',
	'.git',
	'dist',
	'.astro',
	'.wrangler',
	'.superpowers',
	'.gemini_security',
]);

const BINARY_EXTENSIONS = new Set([
	'.mp4',
	'.mp3',
	'.ogg',
	'.jpg',
	'.jpeg',
	'.png',
	'.gif',
	'.webp',
	'.ico',
	'.woff',
	'.woff2',
	'.ttf',
	'.pdf',
]);

// 16-char SHA-256 prefixes of forbidden legacy company/domain/CDN/UUID tokens
const FORBIDDEN_TOKEN_HASH_PREFIXES = new Set([
	'b1eb3d94fd18ab0a', // legacy org token
	'9b48adb2537663c5', // legacy domain token
	'dd4327cd38e05af1', // legacy owner token (outside GitHub repo URL)
	'878683fc69dd52e9', // legacy CDN host token
	'5024df61056765e3', // legacy CDN account ID
	'651430c4c5f6a765', // legacy D1 UUID prefix
	'1a28743eeec50d11', // legacy D1 UUID short prefix
	'6c60f166cc158617', // legacy D1 UUID
	'69b20ed897a2965c', // legacy KV ID prefix
	'61e16e42b350c676', // legacy KV ID
	'f9c5e2600c62e584', // legacy preview KV ID prefix
	'0d59c032caa8fa29', // legacy preview KV ID
]);

function sha256Prefix16(token) {
	return crypto.createHash('sha256').update(token.toLowerCase()).digest('hex').slice(0, 16);
}

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

test('entire repository contains zero proprietary branding, legacy Cloudflare resource IDs, or developer local filesystem paths', () => {
	const allFiles = walkFiles(rootDir).filter(
		(f) => !BINARY_EXTENSIONS.has(path.extname(f).toLowerCase())
	);

	const localHomePathRegex = new RegExp('/' + 'Users/[a-zA-Z0-9._-]+');

	for (const file of allFiles) {
		const relPath = path.relative(rootDir, file);
		const rawContent = fs.readFileSync(file, 'utf8');
		const content = rawContent.replaceAll(
			'https://github.com/rubensteinventures/artifact-manager',
			''
		);

		assert.doesNotMatch(
			content,
			localHomePathRegex,
			`Developer local filesystem path found in ${relPath}`
		);

		const tokens = content.match(/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/g) ?? [];
		for (const token of tokens) {
			if (token.length < 4) continue;
			const hashPrefix = sha256Prefix16(token);
			assert.equal(
				FORBIDDEN_TOKEN_HASH_PREFIXES.has(hashPrefix),
				false,
				`Forbidden legacy identifier token "${token}" found in ${relPath}`
			);
		}
	}
});

test('README.md documents new Cloudflare account setup, branding variables, and /admin/api/v1/skill paths', () => {
	const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
	assert.match(
		readme,
		/https:\/\/deploy\.workers\.cloudflare\.com\/\?url=https:\/\/github\.com\/rubensteinventures\/artifact-manager/
	);
	assert.match(readme, /\/admin\/setup/);
	assert.match(readme, /\/admin\/settings/);
	assert.match(readme, /ADMIN_USERNAME/);
	assert.match(readme, /ADMIN_PASSWORD/);
	assert.match(readme, /wrangler d1 create/);
	assert.match(readme, /wrangler r2 bucket create/);
	assert.match(readme, /wrangler kv namespace create/);
	assert.match(readme, /wrangler d1 migrations apply/);
	assert.match(readme, /APP_NAME/);
	assert.match(readme, /ORG_NAME/);
	assert.match(readme, /LOGO_URL/);
	assert.match(readme, /FAVICON_URL/);
	assert.match(readme, /PUBLIC_CONTENT_BASE_URL/);
	assert.match(readme, /\/admin\/api\/v1\/skill\/presentations/);
	assert.match(readme, /<BASE64_ENCODED_FILE_CONTENT>/);
	assert.doesNotMatch(readme, /PGh0bWw\+PC9odG1sPg==/);

	const skillScript = fs.readFileSync(
		path.join(rootDir, 'skills/presentations-manager/scripts/update_presentation.js'),
		'utf8'
	);
	assert.match(skillScript, /\/admin\/api\/v1\/skill\/presentations\//);
});
