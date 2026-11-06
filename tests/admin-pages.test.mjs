import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('AdminLayout, login, dashboard, and presentation detail pages use /admin/* routes and getBrandingConfig', () => {
	const layout = fs.readFileSync(path.join(rootDir, 'src/layouts/AdminLayout.astro'), 'utf8');
	assert.match(layout, /href="\/admin"/);
	assert.match(layout, /action="\/admin\/api\/logout"/);
	assert.match(layout, /getBrandingConfig/);

	const login = fs.readFileSync(path.join(rootDir, 'src/pages/admin/login.astro'), 'utf8');
	assert.match(login, /Astro\.redirect\('\/admin'\)/);

	const dashboard = fs.readFileSync(path.join(rootDir, 'src/pages/admin/index.astro'), 'utf8');
	assert.match(dashboard, /Astro\.redirect\(`\/admin\/presentations\/\$\{slugCheck\.slug\}`\)/);
	assert.match(dashboard, /href=\{`\/admin\/presentations\/\$\{p\.slug\}`\}/);
	assert.match(dashboard, /getBrandingConfig/);

	const slugPage = fs.readFileSync(
		path.join(rootDir, 'src/pages/admin/presentations/[slug].astro'),
		'utf8'
	);
	assert.match(slugPage, /Astro\.redirect\('\/admin'\)/);
	assert.match(slugPage, /Astro\.redirect\(`\/admin\/presentations\/\$\{slug\}`\)/);
	assert.match(slugPage, /href="\/admin"/);
	assert.match(slugPage, /fetch\(`\/admin\/api\/upload\/\$\{slug\}`/);
	assert.match(slugPage, /fetch\('\/admin\/api\/generate-passphrase'\)/);
	assert.match(
		slugPage,
		/src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/3\.10\.2\/jszip\.min\.js"/
	);
	assert.match(
		slugPage,
		/integrity="sha512-\/ICos1xr6gGjsbC2d7Z6D0hmKAnNbkCv5Pp803Q75xgHowbEcgI4CVOHMHUux\/ZorCuod6dzuJOjfNoCKV0tRw=="/
	);
	assert.match(slugPage, /crossorigin="anonymous"/);
	assert.match(slugPage, /referrerpolicy="no-referrer"/);
	assert.doesNotMatch(login, /\bclassName="/);
	assert.doesNotMatch(slugPage, /\bclassName="/);
	assert.match(
		slugPage,
		/<CardTitle class="inline-flex w-full min-w-0 flex-row flex-nowrap items-center gap-2 text-lg">/
	);
});
