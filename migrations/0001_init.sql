CREATE TABLE IF NOT EXISTS admins (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS presentations (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT,
    password TEXT,
    uploaded_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    app_name TEXT,
    org_name TEXT,
    org_url TEXT,
    logo_url TEXT,
    favicon_url TEXT,
    hero_title TEXT,
    hero_subtitle TEXT,
    public_content_base_url TEXT,
    updated_at TEXT
);
