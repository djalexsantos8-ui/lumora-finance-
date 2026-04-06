-- ============================================
-- Migration 001: adicionar 'paused' ao enum de status de subscription
-- Rodar no Supabase SQL Editor
-- ============================================

ALTER TYPE subscription_status_enum ADD VALUE IF NOT EXISTS 'paused';
