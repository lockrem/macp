-- Migration: Add tasks table for task-contact linking
-- Created: 2026-02-03

-- Create task status enum
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'waiting', 'completed', 'cancelled', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create task priority enum
DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),

  -- Task details
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'pending',
  priority task_priority NOT NULL DEFAULT 'medium',

  -- Contact linking (for autonomous routing)
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  target_person_name TEXT, -- Original name mentioned (for matching)

  -- Agent assignment
  assigned_agent_id TEXT,
  assigned_agent_name TEXT,

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'manual', -- 'chat_detected', 'manual', 'recurring'
  source_conversation_id TEXT,
  source_message_content TEXT,

  -- Resolution
  resolution TEXT,
  resolved_at TIMESTAMP,

  -- Scheduling
  due_date TIMESTAMP,
  reminder_at TIMESTAMP,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for tasks
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;

-- Add helpful comment
COMMENT ON TABLE tasks IS 'User tasks that can be linked to contacts for autonomous agent routing';
