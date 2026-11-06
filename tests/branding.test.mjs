import test from 'node:test';
import assert from 'node:assert/strict';
import { getBrandingConfig, renderAccessDeniedHtml, sanitizeHttpUrl } from '../src/lib/branding.ts';

test('getBrandingConfig returns neutral defaults when env vars are empty or unset', () => {
	const cfg = getBrandingConfig({}, 'https://decks.example.com/admin');
	assert.equal(cfg.appName, 'Presentation Manager');
	assert.equal(cfg.orgName, 'Presentation Manager');
	assert.equal(cfg.orgUrl, null);
	assert.equal(cfg.logoUrl, null);
	assert.equal(cfg.heroTitle, 'Interactive Presentations');
	assert.equal(cfg.heroSubtitle, 'Explore shared presentations and interactive decks.');
	assert.equal(cfg.publicContentBaseUrl, 'https://decks.example.com');
});

test('getBrandingConfig applies custom branding vars and strips trailing slash from PUBLIC_CONTENT_BASE_URL', () => {
	const cfg = getBrandingConfig(
		{
			APP_NAME: 'Acme Decks',
			ORG_NAME: 'Acme Corp',
			ORG_URL: 'https://acme.example.com',
			LOGO_URL: '/assets/logo.svg',
			HERO_TITLE: 'Client Briefings',
			HERO_SUBTITLE: 'Private strategy decks.',
			PUBLIC_CONTENT_BASE_URL: 'https://share.acme.example.com/',
		},
		'https://admin.acme.example.com/admin'
	);
	assert.equal(cfg.appName, 'Acme Decks');
	assert.equal(cfg.orgName, 'Acme Corp');
	assert.equal(cfg.orgUrl, 'https://acme.example.com/');
	assert.equal(cfg.logoUrl, '/assets/logo.svg');
	assert.equal(cfg.publicContentBaseUrl, 'https://share.acme.example.com');
});

test('sanitizeHttpUrl and renderAccessDeniedHtml block javascript: URLs and escape HTML injection', () => {
	assert.equal(sanitizeHttpUrl('javascript:alert(1)'), null);
	assert.equal(sanitizeHttpUrl('data:text/html,<script>alert(1)</script>'), null);
	assert.equal(sanitizeHttpUrl('/logo.svg', { allowRootRelative: false }), null);
	assert.equal(sanitizeHttpUrl('/logo.svg', { allowRootRelative: true }), '/logo.svg');
	assert.equal(sanitizeHttpUrl('//evil.example.com/logo.svg', { allowRootRelative: true }), null);

	const cfg = getBrandingConfig({
		APP_NAME: '<script>alert("xss")</script>',
		ORG_NAME: 'Bad "Org" & Co <img src=x onerror=alert(1)>',
		LOGO_URL: 'javascript:alert(1)',
	});
	const html = renderAccessDeniedHtml(cfg);
	assert.doesNotMatch(html, /<script>/);
	assert.doesNotMatch(html, /javascript:/);
	assert.match(html, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);
	assert.match(html, /Bad &quot;Org&quot; &amp; Co/);
});
