-- Migration: initial_schema
-- Description: Complete One App database schema including users, wallets, cards, one_shares, payments, campaigns, and admin tables

-- ============================================================
-- Users and Authentication
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  bvn VARCHAR(11),
  date_of_birth DATE,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),

  -- Authentication
  is_phone_verified BOOLEAN DEFAULT FALSE,
  otp_code VARCHAR(6),
  otp_expiry TIMESTAMP,
  verified_at TIMESTAMP,

  -- PIN
  pin_hash VARCHAR(255),
  has_pin BOOLEAN DEFAULT FALSE,
  pin_attempts INTEGER DEFAULT 0,

  -- KYC
  kyc_status VARCHAR(50) DEFAULT 'not_started',
  kyc_provider_id VARCHAR(255),
  kyc_rejection_reason TEXT,
  kyc_submitted_at TIMESTAMP,
  kyc_approved_at TIMESTAMP,

  -- Referrals
  referral_code VARCHAR(20) UNIQUE NOT NULL,
  referred_by UUID REFERENCES users(id),

  -- Status
  status VARCHAR(50) DEFAULT 'pending_verification',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,

  -- Indexes
  CONSTRAINT valid_kyc_status CHECK (kyc_status IN ('not_started', 'pending', 'approved', 'rejected')),
  CONSTRAINT valid_status CHECK (status IN ('pending_verification', 'active', 'suspended', 'closed'))
);

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_users_referred_by ON users(referred_by);
CREATE INDEX idx_users_kyc_status ON users(kyc_status);

-- ============================================================
-- Wallets (Main and Promo)
-- ============================================================

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_type VARCHAR(20) NOT NULL,
  balance DECIMAL(15, 2) DEFAULT 0.00,
  currency VARCHAR(3) DEFAULT 'NGN',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_wallet_type CHECK (wallet_type IN ('main', 'promo')),
  CONSTRAINT positive_balance CHECK (balance >= 0),
  UNIQUE(user_id, wallet_type)
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);

-- ============================================================
-- Ledger Entries (Double-Entry Accounting)
-- ============================================================

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  wallet_id UUID NOT NULL REFERENCES wallets(id),

  transaction_type VARCHAR(50) NOT NULL,
  entry_type VARCHAR(10) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  balance_after DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',

  reference_id VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_entry_type CHECK (entry_type IN ('debit', 'credit')),
  CONSTRAINT positive_amount CHECK (amount > 0)
);

CREATE INDEX idx_ledger_user_id ON ledger_entries(user_id);
CREATE INDEX idx_ledger_wallet_id ON ledger_entries(wallet_id);
CREATE INDEX idx_ledger_reference_id ON ledger_entries(reference_id);
CREATE INDEX idx_ledger_created_at ON ledger_entries(created_at DESC);

-- ============================================================
-- Transactions
-- ============================================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  transaction_type VARCHAR(50) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  fee DECIMAL(15, 2) DEFAULT 0.00,

  status VARCHAR(50) DEFAULT 'pending',
  reference VARCHAR(255) UNIQUE NOT NULL,
  external_reference VARCHAR(255),

  source_wallet_id UUID REFERENCES wallets(id),
  destination_wallet_id UUID REFERENCES wallets(id),

  description TEXT,
  metadata JSONB,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT valid_transaction_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_reference ON transactions(reference);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- ============================================================
-- One Share (Viral Distribution)
-- ============================================================

CREATE TABLE IF NOT EXISTS one_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id),

  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  fee DECIMAL(15, 2) DEFAULT 0.00,
  total_amount DECIMAL(15, 2) NOT NULL,

  share_code VARCHAR(20) UNIQUE NOT NULL,
  message TEXT,

  status VARCHAR(50) DEFAULT 'active',
  claimed_by UUID REFERENCES users(id),
  claimed_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,

  transaction_id UUID REFERENCES transactions(id),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_one_share_status CHECK (status IN ('active', 'claimed', 'expired', 'cancelled')),
  CONSTRAINT positive_amount CHECK (amount > 0)
);

CREATE INDEX idx_one_shares_creator_id ON one_shares(creator_id);
CREATE INDEX idx_one_shares_share_code ON one_shares(share_code);
CREATE INDEX idx_one_shares_status ON one_shares(status);
CREATE INDEX idx_one_shares_claimed_by ON one_shares(claimed_by);

-- ============================================================
-- Virtual Cards
-- ============================================================

CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),

  card_provider VARCHAR(50) DEFAULT 'budpay',
  provider_card_id VARCHAR(255),

  card_type VARCHAR(20) DEFAULT 'virtual',
  card_number_encrypted TEXT,
  card_last4 VARCHAR(4),
  cvv_encrypted TEXT,
  expiry_month VARCHAR(2),
  expiry_year VARCHAR(4),

  cardholder_name VARCHAR(255),

  status VARCHAR(50) DEFAULT 'active',
  balance DECIMAL(15, 2) DEFAULT 0.00,
  currency VARCHAR(3) DEFAULT 'NGN',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  activated_at TIMESTAMP,

  CONSTRAINT valid_card_status CHECK (status IN ('pending', 'active', 'frozen', 'cancelled'))
);

CREATE INDEX idx_cards_user_id ON cards(user_id);
CREATE INDEX idx_cards_status ON cards(status);

-- ============================================================
-- Payments (Deposits & Withdrawals)
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),

  payment_type VARCHAR(50) NOT NULL,
  payment_method VARCHAR(50),

  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  fee DECIMAL(15, 2) DEFAULT 0.00,

  status VARCHAR(50) DEFAULT 'pending',
  reference VARCHAR(255) UNIQUE NOT NULL,
  external_reference VARCHAR(255),

  provider VARCHAR(50),
  provider_response JSONB,

  transaction_id UUID REFERENCES transactions(id),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT valid_payment_type CHECK (payment_type IN ('deposit', 'withdrawal')),
  CONSTRAINT valid_payment_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_reference ON payments(reference);
CREATE INDEX idx_payments_status ON payments(status);

-- ============================================================
-- Campaigns
-- ============================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(255) NOT NULL,
  description TEXT,
  campaign_type VARCHAR(50) NOT NULL,

  reward_amount DECIMAL(15, 2),
  reward_type VARCHAR(50),

  max_participants INTEGER,
  current_participants INTEGER DEFAULT 0,

  status VARCHAR(50) DEFAULT 'active',

  starts_at TIMESTAMP,
  ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_campaign_status CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled'))
);

CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_ends_at ON campaigns(ends_at);

-- ============================================================
-- Campaign Participants
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),

  status VARCHAR(50) DEFAULT 'enrolled',
  reward_claimed BOOLEAN DEFAULT FALSE,
  reward_claimed_at TIMESTAMP,

  joined_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(campaign_id, user_id),
  CONSTRAINT valid_participant_status CHECK (status IN ('enrolled', 'completed', 'disqualified'))
);

CREATE INDEX idx_campaign_participants_campaign_id ON campaign_participants(campaign_id);
CREATE INDEX idx_campaign_participants_user_id ON campaign_participants(user_id);

-- ============================================================
-- Admin Users
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,

  role VARCHAR(50) NOT NULL,
  permissions JSONB,

  status VARCHAR(50) DEFAULT 'active',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,

  CONSTRAINT valid_admin_role CHECK (role IN ('super_admin', 'admin', 'support', 'analyst')),
  CONSTRAINT valid_admin_status CHECK (status IN ('active', 'suspended', 'deactivated'))
);

CREATE INDEX idx_admin_users_email ON admin_users(email);

-- ============================================================
-- Audit Logs
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID REFERENCES users(id),
  admin_id UUID REFERENCES admin_users(id),

  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,

  changes JSONB,
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================
-- Notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  channel VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,

  metadata JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================================
-- Update Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_one_shares_updated_at BEFORE UPDATE ON one_shares
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
