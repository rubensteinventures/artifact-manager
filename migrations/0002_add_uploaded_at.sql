-- Migration: Add uploaded_at column to presentations table
ALTER TABLE presentations ADD COLUMN uploaded_at TEXT;
