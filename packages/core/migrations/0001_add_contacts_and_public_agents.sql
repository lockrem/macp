-- Migration: Add contacts, contact_agents, and public_agents tables
-- Created: 2026-02-01

-- Create public_agents table first (referenced by contact_agents)
CREATE TABLE IF NOT EXISTS public_agents (
  agent_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  owner_name TEXT,

  -- Agent config
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  description TEXT NOT NULL,
  personality TEXT NOT NULL,
  greeting TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  introduction_greeting TEXT,
  introduction_questions JSONB DEFAULT '[]'::jsonb,

  -- Voice configuration
  voice_id TEXT,
  voice_speed INTEGER,

  -- Sharing settings
  is_active BOOLEAN NOT NULL DEFAULT true,
  allow_direct_chat BOOLEAN NOT NULL DEFAULT false,
  allow_agent_to_agent BOOLEAN NOT NULL DEFAULT false,
  allow_accompanied_chat BOOLEAN NOT NULL DEFAULT false,

  -- Analytics
  view_count INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for public_agents
CREATE INDEX IF NOT EXISTS idx_public_agents_owner_id ON public_agents(owner_id);
CREATE INDEX IF NOT EXISTS idx_public_agents_is_active ON public_agents(is_active) WHERE is_active = true;

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),

  -- Identity
  name TEXT NOT NULL,
  aliases JSONB DEFAULT '[]'::jsonb,

  -- Relationship details
  relationship TEXT,
  relationship_started TIMESTAMP,
  birthday TEXT,

  -- Contact info
  email TEXT,
  phone TEXT,

  -- Additional info
  notes TEXT,
  tags JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for contacts
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
-- GIN index for fuzzy search on aliases
CREATE INDEX IF NOT EXISTS idx_contacts_aliases ON contacts USING GIN (aliases);
-- GIN index for tag filtering
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN (tags);

-- Create contact_agents junction table
CREATE TABLE IF NOT EXISTS contact_agents (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  public_agent_id TEXT NOT NULL REFERENCES public_agents(agent_id),

  -- Denormalized for display
  agent_name TEXT NOT NULL,
  agent_emoji TEXT,

  -- Role and discovery
  role TEXT,
  discovered_via TEXT,

  -- Timestamps
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Unique constraint to prevent duplicate associations
  CONSTRAINT unique_contact_agent UNIQUE (contact_id, public_agent_id)
);

-- Create indexes for contact_agents
CREATE INDEX IF NOT EXISTS idx_contact_agents_contact_id ON contact_agents(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_agents_public_agent_id ON contact_agents(public_agent_id);

-- Add helpful comment
COMMENT ON TABLE public_agents IS 'Database-backed storage for published/public agents (migrated from S3)';
COMMENT ON TABLE contacts IS 'User contacts/relationships for associating external agents with people';
COMMENT ON TABLE contact_agents IS 'Junction table linking contacts to their associated public agents';
