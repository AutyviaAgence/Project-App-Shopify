-- Retrait de l'intégration email/Gmail inbox : plus aucun code ne lit
-- email_sessions. On drope la table + les colonnes email_session_id qui la
-- référencent (FK). On CONSERVE contacts.email, contacts.preferred_channel et
-- conversations.channel (colonnes partagées, désormais inertes = 'whatsapp').
--
-- ⚠️ Après application : NOTIFY pgrst, 'reload schema'.

-- Colonnes FK vers email_sessions (à supprimer avant la table). CASCADE pour
-- emporter les objets dépendants (index, contraintes, vues éventuelles).
ALTER TABLE conversations DROP COLUMN IF EXISTS email_session_id CASCADE;
ALTER TABLE contacts      DROP COLUMN IF EXISTS email_session_id CASCADE;

-- La table elle-même.
DROP TABLE IF EXISTS email_sessions CASCADE;

NOTIFY pgrst, 'reload schema';
