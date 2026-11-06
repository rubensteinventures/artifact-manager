# Database seeds (development only)

These files are **not** Cloudflare D1 migrations. They insert well-known credentials so you can log in while running **`wrangler dev`** against **local** D1.

## Do not use in production

- Never run the local seed against a production database.
- Change or remove the test admin before any real deployment if you ever seeded a shared environment.

## Test credentials (local seed)

| Field    | Value          |
|----------|----------------|
| Username | `testadmin`    |
| Password | `testpass123`  |

The password is stored as a **bcrypt** hash (cost `10`) consistent with `bcryptjs` in the app.

## Apply local seed

From the repo root (after dependencies and Wrangler config):

```bash
npm run db:setup:local
```

Or step by step:

```bash
npm run db:migrate:local   # creates admins + presentations tables
npm run db:seed:local      # inserts / updates testadmin
```

Then start the worker **without** `--remote` so it uses the same local D1:

```bash
npx wrangler dev
```

Open `/admin/login` and sign in with `testadmin` / `testpass123`.

## Regenerating the hash

If you change the password in `local.sql`, regenerate the hash:

```bash
node -e "console.log(require('bcryptjs').hashSync('your-new-password', 10))"
```

Paste the result into `local.sql` and keep the dev-only warning comments accurate.
