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

let filesToUpload = fileArgs;
if (filesToUpload.length === 0) {
	const commonFiles = ['index.html', 'favicon.svg'];
	const dirFiles = fs.readdirSync('.');
	const pngFiles = dirFiles.filter((f) => f.endsWith('.png'));
	filesToUpload = [...commonFiles, ...pngFiles].filter((f) => fs.existsSync(f));
}

async function run() {
	const files = filesToUpload
		.map((filename) => {
			const filePath = path.join(process.cwd(), filename);
			if (!fs.existsSync(filePath)) {
				console.warn(`File ${filename} not found, skipping.`);
				return null;
			}
			const data = fs.readFileSync(filePath);
			const base64 = data.toString('base64');
			let contentType = 'application/octet-stream';
			if (filename.endsWith('.html')) contentType = 'text/html';
			else if (filename.endsWith('.svg')) contentType = 'image/svg+xml';
			else if (filename.endsWith('.png')) contentType = 'image/png';

			return {
				path: filename,
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
	const response = await fetch(`${ORIGIN}/admin/api/v1/skill/presentations/${slug}`, {
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
	console.error(err);
	process.exit(1);
});
