# Admin Setup

To access the `/admin` dashboard, you need to add at least one administrator account to the `admins` table in your `presentations_db` Cloudflare D1 database.

**Important:** `npx wrangler dev` and `npx wrangler dev --remote` use **different** D1 instances:

| Command | D1 database | `d1 execute` flag |
|---------|-------------|-------------------|
| `wrangler dev` | **Local** (under `.wrangler/state/`) | `--local` |
| `wrangler dev --remote` | **Remote** (Cloudflare) | `--remote` |

Seeding data locally does **not** affect login when the dev server is started with `--remote`. Use `--remote` on `d1 execute` to match production/remote dev, or run plain `wrangler dev` to use local D1.

## Dev seed (local testing)

For a **known local-only** admin (`testadmin` / `testpass123`), apply migrations and seed:

```bash
npm run db:setup:local
npx wrangler dev
```

Then visit `/admin/login`. Details: [seed/README.md](../seed/README.md).

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
