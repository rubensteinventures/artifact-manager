# Admin Setup & Account Recovery

To access the `/admin` dashboard, at least one administrator account must be configured. You can set up or recover your administrator account in three ways:

1. **Browser First-Run Setup (`/admin/setup`):** When `admins` in D1 has `0` rows and no `ADMIN_USERNAME`/`ADMIN_PASSWORD` override is set, visiting `/admin` redirects to `/admin/setup` so you can create the initial administrator, configure project branding, and upload a custom logo and favicon in your browser. Once created, `/admin/setup` permanently locks itself (you can update branding anytime later at `/admin/settings`).
2. **Environment Variable Override & Recovery (`ADMIN_USERNAME` / `ADMIN_PASSWORD`):** Setting `ADMIN_USERNAME` and `ADMIN_PASSWORD` (at least 8 characters) in Cloudflare Worker Variables/Secrets allows you to sign in at `/admin/login` and automatically upserts the bcrypt password hash into D1 (`ON CONFLICT(username) DO UPDATE`). After your initial deployment and first sign-in (or after an emergency password recovery), **you should delete `ADMIN_USERNAME` and `ADMIN_PASSWORD`** from your Worker configuration—your bcrypt hash remains stored in D1 and those variables are only needed if you ever need to perform emergency credential recovery in the future.
3. **Wrangler CLI (`wrangler d1 execute`):** Manually hash a password with `bcryptjs` and insert it into D1.

**Important:** `npx wrangler dev` and `npx wrangler dev --remote` use **different** D1 instances:

| Command | D1 database | `d1 execute` flag |
|---------|-------------|-------------------|
| `wrangler dev` | **Local** (under `.wrangler/state/`) | `--local` |
| `wrangler dev --remote` | **Remote** (Cloudflare) | `--remote` |

Seeding data locally does **not** affect login when the dev server is started with `--remote`. Use `--remote` on `d1 execute` to match production/remote dev, or run plain `wrangler dev` to use local D1.

## Local Development Setup

Apply D1 migrations locally and start the dev server:

```bash
npm run db:migrate:local
npx wrangler dev
```

Then open `/admin` in your browser—because the local `admins` table is empty, it will automatically redirect to `/admin/setup` where you can create your local administrator account and configure project branding.

## Visitor passwords (presentations)

Passwords for **public viewers** visiting `/content/{slug}/*` are stored in `presentations.password` using **PBKDF2** (SHA-256, 100,000 iterations, 16-byte random salt, 256-bit derived key), encoded as:

`iterations.base64(salt).base64(hash)`

The `/admin` UI never displays the stored password—only whether one is set—and **Save password** writes hashes in that format. **Admin** accounts use **bcrypt** (`bcryptjs`, cost `10`) in the `admins` table.

## 1. Generate an Admin Password Hash

Generate a cost-10 bcrypt hash for your desired admin password using Node:

```bash
node -e "import('bcryptjs').then(b => console.log(b.default.hashSync('your-secure-password', 10)))"
```

## 2. Insert into D1

Run the following SQL command using Wrangler to add the admin user to your production D1 database:

```bash
npx wrangler d1 execute presentations_db --remote --command "INSERT INTO admins (username, password_hash) VALUES ('admin', 'REPLACE_WITH_GENERATED_HASH');"
```

Replace `REPLACE_WITH_GENERATED_HASH` with the output from Step 1 (a single string starting with `$2a$` or `$2b$`, with **no extra quotes** inside the SQL string).

## 3. Local vs remote D1

Wrangler uses **different databases** depending on how you run the worker:

| How you run the app | Where `admins` data lives |
|---------------------|---------------------------|
| `wrangler dev` (default) | **Local** D1 (apply migrations + seed admins with `--local`) |
| `wrangler dev --remote` | **Remote** D1 (use `--remote` on `d1 execute` as above) |
| `wrangler deploy` | **Remote** D1 |

Apply migrations to local D1 when developing locally:

```bash
npx wrangler d1 migrations apply presentations_db --local
```

## 4. Troubleshooting “Invalid username or password”

1. **Confirm the row exists** in the same database your server uses:

   ```bash
   # Remote
   npx wrangler d1 execute presentations_db --remote --command "SELECT username, length(password_hash) FROM admins;"

   # Local
   npx wrangler d1 execute presentations_db --local --command "SELECT username, length(password_hash) FROM admins;"
   ```

2. **Username** must match exactly (trimmed in the app; case-sensitive in SQLite).
3. **Hash** must be a valid bcrypt string from `bcryptjs` with cost `10`, not the plain password.
4. **Rate limiting**: 5 failed attempts from the same IP within 60 seconds trigger a temporary `429` lockout stored in the `SESSION` KV namespace.
