-- =====================================================================
--  MIGRATION — Mapping des variables nommées d'un template
--  Date : 2026-06-12
--
--  Meta n'accepte que {{1}},{{2}}… L'utilisateur choisit des variables
--  LISIBLES (Prénom client, N° commande…) ; on mémorise l'ordre des clés
--  pour afficher une légende et résoudre les vraies données à l'envoi.
--  variable_keys[0] = variable {{1}}, [1] = {{2}}, etc.
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS variable_keys TEXT[] DEFAULT '{}';

COMMIT;
