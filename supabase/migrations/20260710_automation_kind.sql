-- Sépare les automatisations en deux mondes (2 onglets côté UI) :
--  - 'transactional' : statuts commande, panier, SAV (réactif à un événement)
--  - 'marketing'     : campagnes, funnels à boutons, A/B (offensif)
-- Défaut 'transactional' : toutes les automatisations existantes restent
-- dans l'onglet Automatisations, aucune n'est reclassée par surprise.
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'transactional'
  CHECK (kind IN ('transactional', 'marketing'));

-- Filtre principal de chaque onglet (liste par user + kind).
CREATE INDEX IF NOT EXISTS automations_user_kind_idx ON automations (user_id, kind);

-- ⚠️ Après application directe en prod : NOTIFY pgrst, 'reload schema';
