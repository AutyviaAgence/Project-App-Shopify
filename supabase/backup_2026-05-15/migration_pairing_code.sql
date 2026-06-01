-- Migration: Ajout du support Pairing Code pour les sessions WhatsApp
-- À exécuter dans Supabase SQL Editor

ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS pairing_code TEXT DEFAULT NULL;
