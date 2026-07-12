-- À l'atteinte du « nombre max de messages » d'un agent IA, on peut désormais
-- envoyer au client un message À BOUTONS (« Voulez-vous continuer avec notre
-- assistant ? Oui / Non ») et METTRE L'IA EN PAUSE en attendant sa réponse.
--   - max_messages_action = 'continue' (défaut, historique : soft cap, l'IA continue)
--                         | 'pause_ask' (pause + envoie le modèle à boutons)
--   - resume_template_id  = modèle à boutons envoyé à la limite (nullable)
--   - resume_button_label = libellé du bouton qui RÉACTIVE l'IA (ex. « Oui ») ;
--                           tout autre bouton laisse l'IA désactivée.
--
-- ⚠️ Après application : NOTIFY pgrst, 'reload schema'.

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS max_messages_action  TEXT NOT NULL DEFAULT 'continue',
  ADD COLUMN IF NOT EXISTS resume_template_id   UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resume_button_label  TEXT;

COMMENT ON COLUMN ai_agents.max_messages_action IS 'continue = soft cap (IA continue) ; pause_ask = pause IA + envoie resume_template_id à boutons';

NOTIFY pgrst, 'reload schema';
