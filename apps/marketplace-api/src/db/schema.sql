-- ============================================================
-- OpenClaw Marketplace Schema
-- Chạy trên cùng Supabase project với izziapi.com
-- References: profiles(id) table từ izzi-backend
-- ============================================================

-- Extension catalog
CREATE TABLE IF NOT EXISTS marketplace_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  version TEXT NOT NULL DEFAULT '0.0.1',
  developer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'Other',
  icon_url TEXT,
  download_url TEXT,
  manifest JSONB DEFAULT '{}',
  
  -- Pricing
  pricing_model TEXT DEFAULT 'free' CHECK (pricing_model IN ('free', 'paid', 'freemium')),
  price_monthly DECIMAL(10,2),
  price_yearly DECIMAL(10,2),
  
  -- Stats
  install_count INT DEFAULT 0,
  rating_avg DECIMAL(3,2) DEFAULT 0,
  rating_count INT DEFAULT 0,
  
  -- Review status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  review_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id UUID REFERENCES marketplace_extensions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name TEXT,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(extension_id, user_id)
);

-- Install tracking
CREATE TABLE IF NOT EXISTS marketplace_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id UUID REFERENCES marketplace_extensions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  uninstalled_at TIMESTAMPTZ,
  
  UNIQUE(extension_id, user_id)
);

-- Developer accounts
CREATE TABLE IF NOT EXISTS marketplace_developers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  developer_name TEXT NOT NULL,
  website TEXT,
  bio TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  commission_rate DECIMAL(4,3) DEFAULT 0.150,
  total_earnings DECIMAL(12,2) DEFAULT 0,
  pending_payout DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RPC function for incrementing install count
CREATE OR REPLACE FUNCTION increment_install_count(ext_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE marketplace_extensions
  SET install_count = install_count + 1
  WHERE id = ext_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Agent Marketplace Tables
-- ============================================================

-- Agent Bundle catalog
CREATE TABLE IF NOT EXISTS marketplace_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  version TEXT NOT NULL DEFAULT '1.0.0',
  developer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  developer_name TEXT DEFAULT 'Izzi Team',
  category TEXT DEFAULT 'other',
  icon TEXT DEFAULT '🤖',
  bundle_type TEXT DEFAULT 'agent',

  -- Agent-specific metadata
  skills_count INT DEFAULT 0,
  automation_count INT DEFAULT 0,
  platforms TEXT[] DEFAULT '{}',
  screenshots TEXT[] DEFAULT '{}',
  demo_video TEXT,

  -- Pricing
  pricing_model TEXT DEFAULT 'free' CHECK (pricing_model IN ('free', 'paid', 'freemium')),
  price_monthly DECIMAL(10,2),
  price_yearly DECIMAL(10,2),
  trial_days INT DEFAULT 0,

  -- Stats
  install_count INT DEFAULT 0,
  rating_avg DECIMAL(3,2) DEFAULT 0,
  rating_count INT DEFAULT 0,

  -- Review status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  review_notes TEXT,

  -- Bundle storage
  manifest JSONB DEFAULT '{}',
  bundle_url TEXT,
  bundle_checksum TEXT,
  bundle_size_bytes BIGINT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent install tracking
CREATE TABLE IF NOT EXISTS marketplace_agent_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  uninstalled_at TIMESTAMPTZ,

  UNIQUE(agent_id, user_id)
);

-- RPC function for incrementing agent install count
CREATE OR REPLACE FUNCTION increment_agent_install_count(agent_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE marketplace_agents
  SET install_count = install_count + 1
  WHERE id = agent_id;
END;
$$ LANGUAGE plpgsql;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ext_category ON marketplace_extensions(category);
CREATE INDEX IF NOT EXISTS idx_ext_status ON marketplace_extensions(status);
CREATE INDEX IF NOT EXISTS idx_ext_developer ON marketplace_extensions(developer_id);
CREATE INDEX IF NOT EXISTS idx_ext_name ON marketplace_extensions(name);
CREATE INDEX IF NOT EXISTS idx_reviews_extension ON marketplace_reviews(extension_id);
CREATE INDEX IF NOT EXISTS idx_installs_extension ON marketplace_installs(extension_id);
CREATE INDEX IF NOT EXISTS idx_installs_user ON marketplace_installs(user_id);

-- Agent indexes
CREATE INDEX IF NOT EXISTS idx_agent_category ON marketplace_agents(category);
CREATE INDEX IF NOT EXISTS idx_agent_status ON marketplace_agents(status);
CREATE INDEX IF NOT EXISTS idx_agent_developer ON marketplace_agents(developer_id);
CREATE INDEX IF NOT EXISTS idx_agent_name ON marketplace_agents(name);
CREATE INDEX IF NOT EXISTS idx_agent_installs_agent ON marketplace_agent_installs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_installs_user ON marketplace_agent_installs(user_id);

-- Row Level Security (RLS)
ALTER TABLE marketplace_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_developers ENABLE ROW LEVEL SECURITY;

-- Public read access for approved extensions
CREATE POLICY "Anyone can view approved extensions" ON marketplace_extensions
  FOR SELECT USING (status = 'approved');

-- Developers can manage their own extensions
CREATE POLICY "Developers can manage own extensions" ON marketplace_extensions
  FOR ALL USING (auth.uid() = developer_id);

-- Public read access for reviews
CREATE POLICY "Anyone can view reviews" ON marketplace_reviews
  FOR SELECT USING (true);

-- Authenticated users can create/update own reviews
CREATE POLICY "Users can manage own reviews" ON marketplace_reviews
  FOR ALL USING (auth.uid() = user_id);

-- Users can see own installs
CREATE POLICY "Users can see own installs" ON marketplace_installs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can manage own developer profile
CREATE POLICY "Users can manage own developer profile" ON marketplace_developers
  FOR ALL USING (auth.uid() = user_id);

-- ── Agent Marketplace RLS ──
ALTER TABLE marketplace_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_agent_installs ENABLE ROW LEVEL SECURITY;

-- Public read access for approved agents
CREATE POLICY "Anyone can view approved agents" ON marketplace_agents
  FOR SELECT USING (status = 'approved');

-- Developers can manage their own agents
CREATE POLICY "Developers can manage own agents" ON marketplace_agents
  FOR ALL USING (auth.uid() = developer_id);

-- Users can see own agent installs
CREATE POLICY "Users can see own agent installs" ON marketplace_agent_installs
  FOR SELECT USING (auth.uid() = user_id);
