-- =====================================================================
--  MIGRATION — Date de dernière commande du contact
--  Date : 2026-06-13
--
--  Sert à annuler une relance de panier abandonné si le client a finalement
--  commandé entre-temps : on compare last_order_at à la date de création du job.
--  Mis à jour par les webhooks orders/create et orders/paid.
-- =====================================================================

BEGIN;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ;

COMMIT;
