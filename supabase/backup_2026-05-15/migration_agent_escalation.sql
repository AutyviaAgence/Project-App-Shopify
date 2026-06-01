-- Migration: Ajouter le système d'escalation/garde-fou pour les agents IA
-- À exécuter dans Supabase SQL Editor

-- Ajouter les colonnes pour le système d'escalation
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS escalation_enabled BOOLEAN DEFAULT false;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS escalation_keywords TEXT[] DEFAULT ARRAY[
  'parler à un humain',
  'parler à quelqu''un',
  'agent humain',
  'vraie personne',
  'pas un robot',
  'énervé',
  'en colère',
  'furieux',
  'mécontent',
  'insatisfait',
  'plainte',
  'réclamation',
  'avocat',
  'tribunal',
  'rembourser',
  'remboursement',
  'arnaque',
  'escroquerie',
  'inacceptable',
  'scandaleux',
  'honteux',
  'annuler',
  'résilier'
];
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS escalation_message TEXT DEFAULT 'Je comprends votre frustration. Je vais transférer votre conversation à un membre de notre équipe qui pourra mieux vous aider. Un conseiller vous répondra dans les plus brefs délais.';

-- Ajouter un champ pour stocker la raison de l'escalation dans la conversation
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS escalation_reason TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

COMMENT ON COLUMN ai_agents.escalation_enabled IS 'Active la détection automatique d''escalation';
COMMENT ON COLUMN ai_agents.escalation_keywords IS 'Mots-clés déclencheurs d''escalation';
COMMENT ON COLUMN ai_agents.escalation_message IS 'Message envoyé avant de désactiver l''IA';
COMMENT ON COLUMN conversations.escalation_reason IS 'Raison de l''escalation (mot-clé détecté)';
COMMENT ON COLUMN conversations.escalated_at IS 'Date/heure de l''escalation';
