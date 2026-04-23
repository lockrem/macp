-- Migration: Add user_memory_facts table
-- Replaces S3 memories/{userId}/{category}.json files with a proper DB table

CREATE TABLE IF NOT EXISTS user_memory_facts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  confidence TEXT DEFAULT 'high',
  learned_from TEXT,
  learned_at TIMESTAMP NOT NULL,
  supersedes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Index for loading all facts for a user (profile view)
CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_id
  ON user_memory_facts(user_id);

-- Index for loading facts by category (category view)
CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_category
  ON user_memory_facts(user_id, category);

-- Index for finding a specific fact by key within a category (upsert)
CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_key
  ON user_memory_facts(user_id, key);
