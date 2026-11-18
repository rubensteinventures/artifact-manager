import test from 'node:test';
import assert from 'node:assert/strict';
import {
	hashPresentationPassword,
	verifyPresentationPassword,
	parseBasicAuth,
	timingSafeEqualStrings,
	getVisitorPasswordValidationError,
} from '../src/lib/presentation-password.ts';
import { normalizeContentRelativePath, isValidPresentationObjectKey } from '../src/lib/r2-path.ts';
import { generateCorporatePassphrase } from '../src/lib/corporate-passphrase.ts';

test('hashPresentationPassword and verifyPresentationPassword round-trip passwords including colons', async () => {
	const pw = 'p@ss:word:with:colons:123A';
	const hash = await hashPresentationPassword(pw);
	assert.equal(await verifyPresentationPassword(pw, hash), true);
	assert.equal(await verifyPresentationPassword('wrong-password', hash), false);
	assert.equal(await verifyPresentationPassword('a'.repeat(257), hash), false);
	assert.equal(await verifyPresentationPassword(pw, 'malformed-hash'), false);
	assert.equal(await verifyPresentationPassword(pw, '100000.c2FsdA==.c2hvcnQ='), false);
});

test('parseBasicAuth splits on first colon per RFC 7617 and rejects invalid base64', () => {
	const header = `Basic ${btoa('client-user:p@ss:word:123')}`;
	assert.deepEqual(parseBasicAuth(header), {
		username: 'client-user',
		password: 'p@ss:word:123',
	});
	assert.equal(parseBasicAuth('Basic !!!not-base64!!!'), null);
	assert.equal(parseBasicAuth('Bearer token'), null);
	assert.equal(parseBasicAuth(null), null);
});

test('generated corporate passphrase passes visitor password validation', () => {
	const phrase = generateCorporatePassphrase();
	assert.equal(getVisitorPasswordValidationError(phrase), null);
});

test('isValidPresentationObjectKey validates file and folder keys strictly under content/{slug}/', () => {
	assert.equal(isValidPresentationObjectKey('q1-deck', 'content/q1-deck/index.html'), true);
	assert.equal(isValidPresentationObjectKey('q1-deck', 'content/q1-deck/assets/icons/'), true);
	assert.equal(isValidPresentationObjectKey('q1-deck', 'content/other-deck/index.html'), false);
	assert.equal(isValidPresentationObjectKey('q1-deck', 'content/q1-deck/'), false);
	assert.equal(isValidPresentationObjectKey('q1-deck', 'content/q1-deck/../other/index.html'), false);
	assert.equal(normalizeContentRelativePath('../secret'), null);
});

test('timingSafeEqualStrings matches identical strings and rejects different strings', async () => {
	assert.equal(await timingSafeEqualStrings('acme-client', 'acme-client'), true);
	assert.equal(await timingSafeEqualStrings('acme-client', 'other-client'), false);
});
