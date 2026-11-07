import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Middleware, AdminLayout, login, setup, settings, dashboard, and presentation detail pages use /admin/* routes and loadBrandingConfig', () => {
	const middleware = fs.readFileSync(path.join(rootDir, 'src/middleware.ts'), 'utf8');
	assert.match(middleware, /\/branding\/logo/);
	assert.match(middleware, /\/branding\/favicon/);
	assert.match(middleware, /handleBrandingAssetRequest/);

	const layout = fs.readFileSync(path.join(rootDir, 'src/layouts/AdminLayout.astro'), 'utf8');
	assert.match(layout, /href="\/admin"/);
	assert.match(layout, /href="\/admin\/settings"/);
	assert.match(layout, /action="\/admin\/api\/logout"/);
	assert.match(layout, /loadBrandingConfig/);
	assert.match(layout, /href=\{branding\.faviconUrl\}/);

	const indexPage = fs.readFileSync(path.join(rootDir, 'src/pages/index.astro'), 'utf8');
	assert.match(indexPage, /loadBrandingConfig/);
	assert.match(indexPage, /href=\{branding\.faviconUrl\}/);

	const login = fs.readFileSync(path.join(rootDir, 'src/pages/admin/login.astro'), 'utf8');
	assert.match(login, /Astro\.redirect\('\/admin'\)/);
	assert.match(login, /authenticateAdminLogin/);

	const setup = fs.readFileSync(path.join(rootDir, 'src/pages/admin/setup.astro'), 'utf8');
	assert.match(setup, /ensureAdminInitialized/);
	assert.match(setup, /createInitialAdmin/);
	assert.match(setup, /saveBrandingSettings/);
	assert.match(setup, /enctype="multipart\/form-data"/);
	assert.match(setup, /name="logo_file"/);
	assert.match(setup, /name="favicon_file"/);
	assert.match(setup, /Astro\.redirect\('\/admin'\)/);
	assert.match(setup, /Astro\.redirect\('\/admin\/login'\)/);
	assert.doesNotMatch(setup, /\bclassName="/);

	const settings = fs.readFileSync(path.join(rootDir, 'src/pages/admin/settings.astro'), 'utf8');
	assert.match(settings, /loadBrandingConfig/);
	assert.match(settings, /saveBrandingSettings/);
	assert.match(settings, /enctype="multipart\/form-data"/);
	assert.match(settings, /name="logo_file"/);
	assert.match(settings, /name="favicon_file"/);
	assert.match(settings, /name="clear_logo"/);
	assert.match(settings, /name="clear_favicon"/);
	assert.match(settings, /envOverrides/);
	assert.doesNotMatch(settings, /\bclassName="/);

	const dashboard = fs.readFileSync(path.join(rootDir, 'src/pages/admin/index.astro'), 'utf8');
	assert.match(dashboard, /Astro\.redirect\(`\/admin\/presentations\/\$\{slugCheck\.slug\}`\)/);
	assert.match(dashboard, /href=\{`\/admin\/presentations\/\$\{p\.slug\}`\}/);
	assert.match(dashboard, /loadBrandingConfig/);

	const slugPage = fs.readFileSync(
		path.join(rootDir, 'src/pages/admin/presentations/[slug].astro'),
		'utf8'
	);
	assert.match(slugPage, /Astro\.redirect\('\/admin'\)/);
	assert.match(slugPage, /Astro\.redirect\(`\/admin\/presentations\/\$\{slug\}`\)/);
	assert.match(slugPage, /href="\/admin"/);
	assert.match(slugPage, /loadBrandingConfig/);
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
