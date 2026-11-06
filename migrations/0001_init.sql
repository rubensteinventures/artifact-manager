-- Fresh-install safe schema (works on empty D1).

CREATE TABLE IF NOT EXISTS admins (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS presentations (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT,
    password TEXT
);
