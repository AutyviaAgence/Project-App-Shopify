-- Les contacts EMAIL (intégration Gmail) n'ont pas de téléphone. La colonne
-- phone_number était NOT NULL → le code y stockait l'adresse email en bouche-trou,
-- ce qui polluait la table (emails LinkedIn/Notion/… traités comme des numéros).
--
-- On rend phone_number NULLABLE : un contact email aura phone_number = NULL et sera
-- identifié par (email, email_session_id). Les contacts WhatsApp gardent leur numéro.
--
-- ⚠️ Après application : NOTIFY pgrst, 'reload schema' (sinon l'API Supabase ne voit
-- pas le changement de contrainte).

ALTER TABLE contacts ALTER COLUMN phone_number DROP NOT NULL;

-- Garde-fou : on ne veut jamais un email dans phone_number. (Documentaire — la
-- validation applicative reste la 1re ligne de défense ; pas de CHECK bloquant
-- pour ne pas rejeter d'éventuels formats de numéro exotiques.)
COMMENT ON COLUMN contacts.phone_number IS 'Numéro E.164 du contact WhatsApp. NULL pour un contact email-only (identifié par email + email_session_id). Ne JAMAIS y stocker une adresse email.';

NOTIFY pgrst, 'reload schema';
