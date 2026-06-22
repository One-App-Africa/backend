-- Seed Data for Development
-- This file contains sample data for testing

-- Create a super admin user
-- Password: Admin@123
INSERT INTO admin_users (email, password_hash, full_name, role, permissions, status)
VALUES (
  'admin@oneapp.com',
  '$2b$10$YourHashedPasswordHere',
  'Super Admin',
  'super_admin',
  '{"users": ["read", "write", "delete"], "transactions": ["read"], "campaigns": ["read", "write"]}'::jsonb,
  'active'
) ON CONFLICT (email) DO NOTHING;

-- Create a sample campaign (First 10K Promo)
INSERT INTO campaigns (
  name,
  description,
  campaign_type,
  reward_amount,
  reward_type,
  max_participants,
  current_participants,
  status,
  starts_at,
  ends_at
)
VALUES (
  'First 10,000 Users Promo',
  'Get NGN 5,000 promo balance for being among the first 10,000 users',
  'signup_bonus',
  5000.00,
  'promo_balance',
  10000,
  0,
  'active',
  NOW(),
  NOW() + INTERVAL '90 days'
) ON CONFLICT DO NOTHING;
