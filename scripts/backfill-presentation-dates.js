#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isRemote = process.argv.includes('--remote');
const home = os.homedir();
const bucketName = process.env.R2_BUCKET_NAME || 'presentation-content';
const dbName = process.env.D1_DATABASE_NAME || 'presentations_db';

console.log(`Starting presentation backfill script (Environment: ${isRemote ? 'REMOTE' : 'LOCAL'})...`);

function getOAuthToken() {
	const envToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
	if (envToken) {
		return envToken;
	}

	const tomlPath = path.join(home, '.wrangler', 'config', 'default.toml');
	if (!fs.existsSync(tomlPath)) {
		throw new Error(
			`Wrangler default.toml not found at ${tomlPath}. Please run 'npx wrangler login' first or set CLOUDFLARE_API_TOKEN.`
		);
	}
	const content = fs.readFileSync(tomlPath, 'utf8');
	const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
	if (!match) {
		throw new Error(`Could not find oauth_token in ${tomlPath}`);
	}
	return match[1];
}

function getAccountId() {
	const envAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
	if (envAccountId) {
		return envAccountId;
	}

	const cachePath = path.join(home, '.wrangler', 'cache', 'wrangler-account.json');
	if (fs.existsSync(cachePath)) {
		try {
			const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
			if (data.account && data.account.id) {
				return data.account.id;
			}
		} catch {
			// ignore and fallback
		}
	}

	try {
		const output = execSync('npx wrangler whoami', { encoding: 'utf8' });
		const match = output.match(/([a-f0-9]{32})/i);
		if (match) {
			return match[1];
		}
	} catch {
		// ignore
	}

	throw new Error(
		`Could not determine Cloudflare Account ID from environment, cache, or 'wrangler whoami'`
	);
}

function getLocalR2SqlitePath() {
	const dir = path.join(
		__dirname,
		'..',
		'.wrangler',
		'state',
		'v3',
		'r2',
		'miniflare-R2BucketObject'
	);
	if (!fs.existsSync(dir)) {
		return null;
	}
	const files = fs.readdirSync(dir);
	const sqliteFile = files.find(
		(f) => f.endsWith('.sqlite') && !f.endsWith('-shm') && !f.endsWith('-wal')
	);
	if (!sqliteFile) {
		return null;
	}
	return path.join(dir, sqliteFile);
}

function getPresentations() {
	const flag = isRemote ? '--remote' : '--local';
	const command = `npx wrangler d1 execute ${dbName} ${flag} --command="SELECT slug, name, uploaded_at FROM presentations" --json`;

	const output = execSync(command, { encoding: 'utf8' });
	const parsed = JSON.parse(output);
	const result = parsed[0];
	if (!result || !result.success) {
		throw new Error(`Failed to list presentations: ${JSON.stringify(parsed)}`);
	}
	return result.results || [];
}

function getLocalR2Files(slug, sqlitePath) {
	if (!sqlitePath || !fs.existsSync(sqlitePath)) {
		return [];
	}

	if (!/^[a-z0-9-]+$/i.test(slug)) {
		throw new Error(`Security Exception: Invalid characters in slug '${slug}'`);
	}

	const query = `SELECT key, uploaded FROM _mf_objects WHERE key LIKE 'content/${slug}/%'`;
	const command = `sqlite3 "${sqlitePath}" "${query}" -json`;
	try {
		const output = execSync(command, {
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();
		if (!output) return [];
		return JSON.parse(output);
	} catch (e) {
		let isSqlite3Missing = false;
		try {
			execSync('which sqlite3', { stdio: 'ignore' });
		} catch {
			isSqlite3Missing = true;
		}

		if (isSqlite3Missing) {
			console.error(
				`\nError: The local 'sqlite3' CLI utility is required but could not be found on your host system PATH.`
			);
			console.error(`Please install 'sqlite3' or run the script in --remote mode.\n`);
			throw new Error(`Missing system dependency: 'sqlite3' CLI utility is required.`);
		}

		console.error(`Error querying local R2 sqlite DB for slug '${slug}': ${e.message}`);
		return [];
	}
}

function getRemoteR2Files(slug, accountId, oauthToken) {
	if (!/^[a-z0-9-]+$/i.test(slug)) {
		return Promise.reject(
			new Error(`Security Exception: Invalid characters in slug '${slug}'`)
		);
	}

	return new Promise((resolve, reject) => {
		const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/objects?prefix=content/${slug}/`;
		const options = {
			headers: {
				Authorization: `Bearer ${oauthToken}`,
			},
		};

		https
			.get(url, options, (res) => {
				let data = '';
				res.on('data', (chunk) => (data += chunk));
				res.on('end', () => {
					if (res.statusCode !== 200) {
						return reject(
							new Error(`API responded with status ${res.statusCode}: ${data}`)
						);
					}
					try {
						const parsed = JSON.parse(data);
						if (!parsed.success) {
							return reject(
								new Error(`Cloudflare API error: ${JSON.stringify(parsed.errors)}`)
							);
						}
						resolve(parsed.result || []);
					} catch (e) {
						reject(e);
					}
				});
			})
			.on('error', reject);
	});
}

function updatePresentationUploadedAt(slug, uploadedAt) {
	if (!/^[a-z0-9-]+$/i.test(slug)) {
		throw new Error(`Security Exception: Invalid characters in slug '${slug}'`);
	}

	const flag = isRemote ? '--remote' : '--local';
	const safeUploadedAt = uploadedAt.replace(/'/g, "''");
	const command = `npx wrangler d1 execute ${dbName} ${flag} --command="UPDATE presentations SET uploaded_at = '${safeUploadedAt}' WHERE slug = '${slug}'" --json`;

	const output = execSync(command, { encoding: 'utf8' });
	const parsed = JSON.parse(output);
	if (!parsed[0] || !parsed[0].success) {
		throw new Error(`Failed to update D1: ${JSON.stringify(parsed)}`);
	}
}

async function main() {
	try {
		const presentations = getPresentations();
		console.log(`Found ${presentations.length} presentations in D1.`);

		let accountId = null;
		let oauthToken = null;
		let localR2SqlitePath = null;

		if (isRemote) {
			accountId = getAccountId();
			oauthToken = getOAuthToken();
			console.log(`Connected to Cloudflare Account: ${accountId}`);
		} else {
			localR2SqlitePath = getLocalR2SqlitePath();
			if (!localR2SqlitePath) {
				console.log(
					'Local R2 sqlite database not found. Ensuring we list from scratch if empty.'
				);
			} else {
				console.log(`Found local R2 SQLite path at: ${localR2SqlitePath}`);
			}
		}

		for (const p of presentations) {
			const slug = p.slug;
			const name = p.name;

			console.log(`Processing presentation '${name}' (${slug})...`);

			let files = [];
			if (isRemote) {
				files = await getRemoteR2Files(slug, accountId, oauthToken);
			} else {
				files = getLocalR2Files(slug, localR2SqlitePath);
			}

			const realFiles = files.filter((f) => !f.key.endsWith('/'));

			if (realFiles.length === 0) {
				console.log(`  -> No real files found in R2. Skipping backfill.`);
				continue;
			}

			let latestTimestampMs = 0;
			let latestFileKey = '';

			for (const f of realFiles) {
				let mtimeMs = 0;
				if (isRemote) {
					mtimeMs = new Date(f.last_modified).getTime();
				} else {
					mtimeMs = Number(f.uploaded);
				}

				if (mtimeMs > latestTimestampMs) {
					latestTimestampMs = mtimeMs;
					latestFileKey = f.key;
				}
			}

			if (latestTimestampMs > 0) {
				const latestISO = new Date(latestTimestampMs).toISOString();
				console.log(`  -> Latest file: '${latestFileKey}' updated at ${latestISO}`);

				updatePresentationUploadedAt(slug, latestISO);
				console.log(`  -> Successfully updated uploaded_at to ${latestISO}`);
			} else {
				console.log(`  -> Could not determine a valid file timestamp. Skipping.`);
			}
		}

		console.log('Backfill process complete!');
		process.exit(0);
	} catch (err) {
		console.error(`Fatal error in backfill script: ${err.message}`);
		process.exit(1);
	}
}

main();
