-- Dev-only: well-known login for local D1 + `wrangler dev` (no --remote).
-- Username: testadmin   Password: testpass123
-- See seed/README.md. Never run against production.

INSERT OR REPLACE INTO admins (username, password_hash) VALUES (
  'testadmin',
  '$2b$10$5lT6NLQxxB8OOC6uYU/3AeF1Q1/VWyzC.w0DX8Q/iujyBb6GrT8oy'
);
