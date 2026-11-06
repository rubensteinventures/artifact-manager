import fs from 'node:fs';
import path from 'node:path';

/**
 * Generic script to update a presentation using the Skill API.
 * Usage: node update_presentation.js <slug> <name> [file1 file2 ...]
 *
 * Environment variables:
 * - PRESENTATIONS_MANAGER_ORIGIN
 * - PRESENTATIONS_SKILL_API_TOKEN
 */

const ORIGIN = process.env.PRESENTATIONS_MANAGER_ORIGIN?.replace(/\/+$/, '');
const TOKEN = process.env.PRESENTATIONS_SKILL_API_TOKEN;

const slug = process.argv[2];
const name = process.argv[3];
const fileArgs = process.argv.slice(4);

if (!ORIGIN || !TOKEN || !slug || !name) {
	console.error(
		'Usage: PRESENTATIONS_MANAGER_ORIGIN=... PRESENTATIONS_SKILL_API_TOKEN=... node update_presentation.js <slug> <name> [file1 file2 ...]'
	);
	process.exit(1);
}

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
	console.error(`Invalid presentation slug: ${slug}`);
	process.exit(1);
}

let parsedOrigin;
try {
	parsedOrigin = new URL(ORIGIN);
	if (parsedOrigin.protocol !== 'https:' && parsedOrigin.protocol !== 'http:') {
		throw new Error('Unsupported protocol');
	}
} catch {
	console.error('Invalid PRESENTATIONS_MANAGER_ORIGIN URL.');
	process.exit(1);
}

const baseDir = path.resolve(process.cwd());

/**
 * Safely reads a regular file strictly inside `baseDir`, blocking path traversal (`..`)
 * and symlink chasing (`O_NOFOLLOW` + `fstatSync`).
 */
function readSandboxedFile(relativeFilename) {
	if (typeof relativeFilename !== 'string' || relativeFilename.includes('\0')) {
		throw new Error('Path traversal blocked: invalid filename.');
	}
	const targetPath = path.resolve(baseDir, relativeFilename);
	const relativeCheck = path.relative(baseDir, targetPath);
	if (
		!relativeCheck ||
		relativeCheck.startsWith('..') ||
		path.isAbsolute(relativeCheck)
	) {
		throw new Error(`Path traversal blocked: ${relativeFilename}`);
	}
	if (!fs.existsSync(targetPath)) {
		return null;
	}

	const openFlags =
		fs.constants.O_RDONLY | (typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0);
	const fd = fs.openSync(targetPath, openFlags);
	try {
		const statInfo = fs.fstatSync(fd);
		if (!statInfo.isFile()) {
			throw new Error(`Target is not a regular file (symlink or directory blocked): ${relativeFilename}`);
		}
		const buffer = Buffer.alloc(statInfo.size);
		let offset = 0;
		while (offset < statInfo.size) {
			const bytesRead = fs.readSync(fd, buffer, offset, statInfo.size - offset, offset);
			if (bytesRead === 0) break;
			offset += bytesRead;
		}
		return { buffer: buffer.subarray(0, offset), relativePath: relativeCheck.split(path.sep).join('/') };
	} finally {
		fs.closeSync(fd);
	}
}

let filesToUpload = fileArgs;
if (filesToUpload.length === 0) {
	const commonFiles = ['index.html', 'favicon.svg'];
	const dirFiles = fs.readdirSync(baseDir);
	const pngFiles = dirFiles.filter((f) => f.endsWith('.png'));
	filesToUpload = [...commonFiles, ...pngFiles].filter((f) =>
		fs.existsSync(path.join(baseDir, f))
	);
}

async function run() {
	const files = filesToUpload
		.map((filename) => {
			const readResult = readSandboxedFile(filename);
			if (!readResult) {
				console.warn(`File ${filename} not found, skipping.`);
				return null;
			}
			const base64 = readResult.buffer.toString('base64');
			let contentType = 'application/octet-stream';
			if (filename.endsWith('.html')) contentType = 'text/html';
			else if (filename.endsWith('.svg')) contentType = 'image/svg+xml';
			else if (filename.endsWith('.png')) contentType = 'image/png';

			return {
				path: readResult.relativePath,
				data: base64,
				contentType,
			};
		})
		.filter((f) => f !== null);

	if (files.length === 0) {
		console.error('No files found to upload.');
		process.exit(1);
	}

	const body = {
		name,
		access: { mode: 'public' },
		files,
	};

	console.log(`Updating presentation "${slug}" (${name}) with ${files.length} files...`);
	const endpoint = new URL(
		`/admin/api/v1/skill/presentations/${encodeURIComponent(slug)}`,
		parsedOrigin
	).toString();
	const response = await fetch(endpoint, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	const result = await response.json();
	console.log('Response:', result);
	if (response.ok) {
		console.log('Successfully updated!');
	} else {
		console.error('Update failed');
		process.exit(1);
	}
}

run().catch((err) => {
	const msg = String(err?.message || err).replace(
		/Bearer\s+[a-zA-Z0-9._-]+/gi,
		'Bearer [REDACTED]'
	);
	console.error(msg);
	process.exit(1);
});
