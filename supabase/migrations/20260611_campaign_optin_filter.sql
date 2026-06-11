-- =====================================================================
--  MIGRATION — Filtre opt-in obligatoire sur les campagnes
--  Date : 2026-06-11
--
--  RÈGLE META/RGPD : on ne peut envoyer un message qu'à un contact ayant
--  donné son consentement (opt_in_status = 'subscribed'). La fonction de
--  sélection des destinataires de campagne exclut désormais tout contact
--  non opted-in (none / opted_out).
--
--  Nettoie aussi la référence team_members résiduelle (système d'équipes
--  retiré) qui faisait planter la fonction.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_campaign_eligible_contacts(
  p_user_id uuid,
  p_session_ids uuid[] DEFAULT NULL::uuid[],
  p_tracking_sources text[] DEFAULT NULL::text[],
  p_tag_ids uuid[] DEFAULT NULL::uuid[],
  p_inactivity_days integer DEFAULT NULL::integer,
  p_exclude_replied boolean DEFAULT false,
  p_min_days_since_last_campaign integer DEFAULT 7,
  p_max_recipients integer DEFAULT 50,
  p_link_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(
  contact_id uuid, conversation_id uuid, session_id uuid, phone_number text,
  contact_name text, last_message_at timestamp with time zone,
  days_inactive integer, tracking_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (c.id)
    c.id AS contact_id,
    conv.id AS conversation_id,
    c.session_id,
    c.phone_number,
    c.name AS contact_name,
    conv.last_message_at,
    EXTRACT(DAY FROM NOW() - conv.last_message_at)::INTEGER AS days_inactive,
    wl.tracking_source
  FROM contacts c
  JOIN conversations conv ON conv.contact_id = c.id
  JOIN whatsapp_sessions s ON s.id = c.session_id
  LEFT JOIN wa_links wl ON wl.id = conv.wa_link_id
  WHERE
    s.user_id = p_user_id
    -- ⛔ CONSENTEMENT OBLIGATOIRE : seuls les contacts opted-in
    AND c.opt_in_status = 'subscribed'
    AND (p_session_ids IS NULL OR c.session_id = ANY(p_session_ids))
    AND (p_tracking_sources IS NULL OR wl.tracking_source = ANY(p_tracking_sources))
    AND (p_link_ids IS NULL OR conv.wa_link_id = ANY(p_link_ids))
    AND (p_tag_ids IS NULL OR EXISTS (
      SELECT 1 FROM conversation_tag_assignments cta
      WHERE cta.conversation_id = conv.id AND cta.tag_id = ANY(p_tag_ids)
    ))
    AND (p_inactivity_days IS NULL OR conv.last_message_at < NOW() - (p_inactivity_days || ' days')::INTERVAL)
    AND (NOT p_exclude_replied OR NOT EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = conv.id
        AND m.direction = 'inbound'
        AND m.created_at > conv.last_message_at - INTERVAL '1 day'
    ))
    AND NOT EXISTS (
      SELECT 1 FROM campaign_blacklist bl
      WHERE bl.contact_id = c.id AND bl.user_id = p_user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM campaign_recipients cr
      JOIN campaigns camp ON camp.id = cr.campaign_id
      WHERE cr.contact_id = c.id
        AND cr.sent_at > NOW() - (p_min_days_since_last_campaign || ' days')::INTERVAL
        AND camp.user_id = p_user_id
    )
  ORDER BY c.id, conv.last_message_at DESC
  LIMIT p_max_recipients;
END;
$function$;
