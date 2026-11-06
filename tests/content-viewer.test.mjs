import test from 'node:test';
import assert from 'node:assert/strict';
import { handleContentRequest, applyViewerSecurityHeaders } from '../src/lib/content-viewer.ts';
import { hashPresentationPassword } from '../src/lib/presentation-password.ts';

function createMockEnv(options = {}) {
	const presentations = options.presentations ?? {};
	const r2Objects = options.r2Objects ?? {};
	return {
		...(options.vars ?? {}),
		DB: {
			prepare() {
				return {
					bind(slug) {
						return {
							async first() {
								if (options.throwDbError) {
									throw new Error('D1 connection timeout');
								}
								return presentations[slug] ?? null;
							},
						};
					},
				};
			},
		},
		BUCKET: {
			async get(key) {
				options.onR2Get?.(key);
				const obj = r2Objects[key];
				if (!obj) return null;
				return {
					body: obj.body,
					httpMetadata: obj.httpMetadata,
					etag: obj.etag,
					httpEtag: obj.httpEtag,
				};
			},
		},
	};
}

test('serves public presentation at /content/{slug}/ from R2 index.html with SAMEORIGIN and quoted ETag', async () => {
	const env = createMockEnv({
		presentations: {
			'demo-deck': { username: null, password: null },
		},
		r2Objects: {
			'content/demo-deck/index.html': {
				body: '<html>Public Deck</html>',
				httpMetadata: { contentType: 'text/html' },
				etag: 'raw-etag',
				httpEtag: '"raw-etag"',
			},
		},
	});

	const rawRes = await handleContentRequest(
		new Request('https://decks.example.com/content/demo-deck/'),
		env
	);
	const res = applyViewerSecurityHeaders(rawRes);
	assert.equal(res.status, 200);
	assert.equal(await res.text(), '<html>Public Deck</html>');
	assert.equal(res.headers.get('ETag'), '"raw-etag"');
	assert.equal(res.headers.get('X-Frame-Options'), 'SAMEORIGIN');
	assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
	assert.equal(res.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
});

test('authenticates protected presentation with Basic Auth (including colons in password) and rejects bad credentials', async () => {
	const pw = 'p@ss:word:with:colons!1A';
	const storedHash = await hashPresentationPassword(pw);
	const env = createMockEnv({
		vars: { ORG_NAME: 'Acme Studio' },
		presentations: {
			secret: { username: 'client', password: storedHash },
		},
		r2Objects: {
			'content/secret/index.html': {
				body: '<html>Secret Deck</html>',
				httpMetadata: { contentType: 'text/html' },
			},
		},
	});

	const unauthRes = await handleContentRequest(
		new Request('https://decks.example.com/content/secret/index.html'),
		env
	);
	assert.equal(unauthRes.status, 401);
	assert.equal(unauthRes.headers.get('WWW-Authenticate'), 'Basic realm="Protected Content"');
	const unauthHtml = await unauthRes.text();
	assert.match(unauthHtml, /Acme Studio/);
	assert.doesNotMatch(unauthHtml, /InnovAItion/i);

	const badBase64Res = await handleContentRequest(
		new Request('https://decks.example.com/content/secret/index.html', {
			headers: { Authorization: 'Basic !!!invalid!!!' },
		}),
		env
	);
	assert.equal(badBase64Res.status, 401);

	const okRes = await handleContentRequest(
		new Request('https://decks.example.com/content/secret/index.html', {
			headers: { Authorization: `Basic ${btoa(`client:${pw}`)}` },
		}),
		env
	);
	assert.equal(okRes.status, 200);
	assert.equal(await okRes.text(), '<html>Secret Deck</html>');
});

test('locks presentation (401) when username is set in D1 but password is null or empty ("Needs password" state)', async () => {
	const env = createMockEnv({
		presentations: {
			halfsetup: { username: 'client', password: null },
		},
		r2Objects: {
			'content/halfsetup/index.html': { body: '<html>Should Not Leak</html>' },
		},
	});

	const res = await handleContentRequest(
		new Request('https://decks.example.com/content/halfsetup/index.html'),
		env
	);
	assert.equal(res.status, 401);
	assert.equal(res.headers.get('WWW-Authenticate'), 'Basic realm="Protected Content"');
});

test('rejects percent-encoded path traversal with 400 before querying R2 and returns 503 on D1 error', async () => {
	let r2Queried = false;
	const env = createMockEnv({
		presentations: {
			publicdeck: { username: null, password: null },
		},
		onR2Get() {
			r2Queried = true;
		},
	});

	const traversalRes = await handleContentRequest(
		new Request('https://decks.example.com/content/publicdeck/..%2fsecret/index.html'),
		env
	);
	assert.equal(traversalRes.status, 400);
	assert.equal(r2Queried, false);

	const dbErrEnv = createMockEnv({ throwDbError: true });
	const dbErrRes = await handleContentRequest(
		new Request('https://decks.example.com/content/publicdeck/index.html'),
		dbErrEnv
	);
	assert.equal(dbErrRes.status, 503);
});
