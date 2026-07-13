import 'server-only'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { resolveVariables } from '@/lib/templates/variables'

function admin() {
  return getAdminSupabase()
}

const NO_WHATSAPP_CODES = [131026, 131047, 131000, 470]

type TemplateRow = {
  id: string; user_id: string; name: string; language: string
  source_language: string | null; status: string; category: string | null
  variables_count: number | null; variable_keys: string[] | null; body_text: string | null
  template_type: string | null; carousel_cards: unknown; lto_default_hours: number | null; lto_title: string | null
  buttons: unknown
}

/**
 * Choisit la variante linguistique d'un modèle à envoyer au contact.
 *
 * Un même modèle existe en plusieurs langues (lignes `name` identiques, `language`
 * différentes). On envoie celle qui colle à la langue du contact, avec repli :
 *   langue contact → langue source du modèle → 'fr' → langue du modèle de base.
 * Seules les variantes APPROUVÉES comptent (une langue en attente est ignorée et
 * on retombe sur le repli — jamais d'envoi cassé).
 *
 * Renvoie la ligne du modèle à envoyer, ou null si aucune variante approuvée.
 * Fonctionne sans surcoût pour les modèles mono-langue (la cascade retombe sur eux).
 */
async function resolveLanguageVariant(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  base: TemplateRow,
  contactLang: string | null | undefined
): Promise<TemplateRow | null> {
  // Toutes les variantes approuvées de ce modèle (même utilisateur + même nom).
  const { data: variants } = await supabase
    .from('whatsapp_templates')
    .select('id, user_id, name, language, source_language, status, category, variables_count, variable_keys, body_text, template_type, carousel_cards, lto_default_hours, lto_title, buttons')
    .eq('user_id', base.user_id)
    .eq('name', base.name)
    .eq('status', 'approved')

  const approved: TemplateRow[] = variants || []
  // Si le modèle de base lui-même est approuvé mais absent de la liste (course),
  // on le garde comme dernier recours.
  if (base.status === 'approved' && !approved.some((v) => v.id === base.id)) approved.push(base)
  if (approved.length === 0) return null

  // Ordre de préférence des langues, dédupliqué, sans valeurs vides.
  const prefs = [contactLang, base.source_language, 'fr', base.language]
    .filter((l): l is string => !!l)
  const seen = new Set<string>()
  for (const lang of prefs) {
    if (seen.has(lang)) continue
    seen.add(lang)
    const match = approved.find((v) => v.language === lang)
    if (match) return match
  }
  // Aucune langue préférée approuvée → on prend la première variante approuvée.
  return approved[0]
}

/**
 * Envoie un template WhatsApp APPROUVÉ (par son id) à un contact, en résolvant
 * ses variables nommées depuis un contexte de données. Respecte l'opt-out.
 * Utilisé par le moteur d'automatisations (template choisi par le marchand).
 */
export async function sendTemplateToContact(params: {
  templateId: string
  contactId: string
  variables: Record<string, string>
  /**
   * Envoi MANUEL depuis l'inbox (le marchand clique « Envoyer le modèle » dans
   * une conversation). Dans ce cas on saute les garde-fous opt-in / canal pensés
   * pour l'automatisation : c'est une action explicite de l'humain. Tout le reste
   * (variantes linguistiques, carrousel, LTO, COPY_CODE, trace inbox) est conservé.
   */
  manual?: boolean
  /** Automatisation à l'origine de l'envoi → tracé sur le message pour agréger
   *  le funnel de livraison par automatisation (perf). Absent en envoi manuel. */
  automationId?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = admin()

  // Contact + opt-in (+ langue préférée pour choisir la bonne variante du modèle)
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, session_id, phone_number, opt_in_status, preferred_channel, preferred_language')
    .eq('id', params.contactId)
    .maybeSingle()
  if (!contact) return { ok: false, error: 'contact_introuvable' }
  if (!contact.phone_number) return { ok: false, error: 'no_phone' }
  // Garde-fous opt-in : uniquement pour les envois AUTOMATIQUES. En manuel, le
  // marchand assume l'envoi (recontact explicite via un modèle approuvé).
  if (!params.manual) {
    if (contact.opt_in_status === 'opted_out') return { ok: false, error: 'opted_out' }
    if (contact.preferred_channel === 'none') return { ok: false, error: 'pas_dopt_in_canal' }
  }

  // Modèle de base (celui choisi dans l'automation). On l'utilise pour connaître
  // le `name` et résoudre ensuite la variante linguistique du contact.
  const SELECT = 'id, user_id, name, language, source_language, status, category, variables_count, variable_keys, body_text, template_type, carousel_cards, lto_default_hours, lto_title, buttons'
  const { data: baseTpl } = await supabase
    .from('whatsapp_templates')
    .select(SELECT)
    .eq('id', params.templateId)
    .maybeSingle()
  if (!baseTpl) return { ok: false, error: 'template_introuvable' }

  // MULTILINGUE : envoyer la variante (même `name`) qui correspond à la langue du
  // contact. Cascade : langue contact → langue source du modèle → 'fr' → langue
  // du modèle de base. On ne considère que les variantes APPROUVÉES par Meta.
  const tpl = await resolveLanguageVariant(supabase, baseTpl, contact.preferred_language)
  if (!tpl) return { ok: false, error: 'template_non_approuve' }

  // Session WABA (+ état qualité pour les garde-fous)
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('waba_phone_number_id, waba_access_token, marketing_paused')
    .eq('id', contact.session_id)
    .maybeSingle()
  if (!session?.waba_phone_number_id) return { ok: false, error: 'no_phone_number_id' }

  // GARDE-FOU QUALITÉ : si le marketing est en pause (numéro classé ROUGE par
  // Meta), on ne bloque QUE les templates MARKETING. Les UTILITY (confirmation,
  // expédition…) et les envois manuels passent toujours. Non bloquant sur
  // 'rate_limited' : le cron reprogramme, il ne marque pas en échec.
  if (!params.manual && session.marketing_paused && (tpl as { category?: string }).category === 'MARKETING') {
    return { ok: false, error: 'marketing_paused' }
  }

  const { decryptWabaToken } = await import('@/lib/messaging/send')
  const token = decryptWabaToken(session)
  if (!token) return { ok: false, error: 'no_token' }

  // Résolution des variables nommées dans l'ordre.
  let keys = Array.isArray(tpl.variable_keys) ? tpl.variable_keys : []
  // Fallback : ancien template par défaut sans variable_keys (seed historique) →
  // on récupère le mapping depuis la bibliothèque par défaut (par nom). Évite
  // l'erreur Meta 131008 "Required parameter is missing".
  if (keys.length === 0) {
    const { DEFAULT_TEMPLATES } = await import('@/lib/whatsapp-cloud/default-templates')
    const def = DEFAULT_TEMPLATES.find((d) => d.name === tpl.name)
    if (def?.variable_keys?.length) keys = def.variable_keys
  }
  const varsCount = typeof tpl.variables_count === 'number' ? tpl.variables_count : keys.length
  // Dernier recours : le template a des variables ({{1}}, {{2}}…) mais AUCUNE clé
  // de mapping (créé/importé sans variable_keys). Sans ça, chaque variable
  // tomberait sur le fallback « — » (ce qu'on voyait : « Bonjour —, chez — »).
  // On déduit des clés par défaut sensées, par position : la 1re = prénom client,
  // la 2e = nom de la boutique (le cas de très loin le plus fréquent), le reste
  // laissé vide (fallback). Les valeurs viennent du contexte (params.variables)
  // ou de fallbacks lisibles.
  if (keys.length < varsCount) {
    const GUESSED = ['customer_first_name', 'store_name']
    const filled = [...keys]
    for (let i = filled.length; i < varsCount; i++) filled.push(GUESSED[i] ?? '')
    keys = filled
  }
  // Injecte le nom réel de la boutique si un template l'attend (store_name) et
  // qu'il n'est pas déjà fourni par le trigger — sinon on afficherait « notre
  // boutique » alors qu'on connaît le vrai nom (Shopify).
  const vars: Record<string, string> = { ...params.variables }
  if (keys.some((k) => /store_name|shop_name/.test(k)) && !vars.store_name) {
    const { data: store } = await supabase
      .from('shopify_stores').select('shop_name').eq('user_id', tpl.user_id).limit(1).maybeSingle()
    if (store?.shop_name) vars.store_name = store.shop_name
  }
  const resolved = resolveVariables(keys, vars)
  // Valeur de secours par variable VIDE : Meta refuse les paramètres vides
  // (#131008). Ex : prénom inconnu (client opt-in popup sans nom) → « bonjour ».
  const fallbackFor = (key: string | undefined): string => {
    if (!key) return '—'
    if (/store_name|shop_name|boutique/.test(key)) return 'notre boutique'
    if (/first_name|full_name|last_name|name/.test(key)) return 'cher client'
    if (/url|link/.test(key)) return ''  // une URL vide casserait un bouton → géré ailleurs
    return '—'
  }
  const out = resolved.slice(0, varsCount).map((v, i) => (v && v.trim() ? v : fallbackFor(keys[i])))
  while (out.length < varsCount) out.push(fallbackFor(keys[out.length]))
  const components: unknown[] = out.length > 0
    ? [{ type: 'body', parameters: out.map((p) => ({ type: 'text', text: p })) }]
    : []

  // Carrousel → ajoute le composant `carousel`. Chaque carte doit re-fournir son
  // média d'en-tête (upload Meta → media_id), c'est pourquoi c'est async et qu'on
  // passe le phone_number_id + token. Requis pour TOUT carrousel (même figé).
  if (tpl.template_type === 'carousel' && Array.isArray(tpl.carousel_cards)) {
    const { buildCarouselComponent } = await import('@/lib/templates/carousel-send')
    const carousel = await buildCarouselComponent(
      tpl.carousel_cards as never[],
      params.variables,
      { phoneNumberId: session.waba_phone_number_id, token }
    )
    if (carousel) components.push(carousel)
  }

  // Offre à durée limitée → composant d'expiration (compte à rebours).
  if (tpl.template_type === 'limited_time_offer') {
    const { buildLtoComponent } = await import('@/lib/templates/lto-send')
    components.push(buildLtoComponent({ defaultHours: tpl.lto_default_hours, nowMs: Date.now() }))
  }

  // Bouton "Copier le code" (COPY_CODE) — pour TOUT type de template. Meta exige
  // le paramètre coupon_code à l'envoi. On résout via la variable promo_code
  // (dynamique) sinon on retombe sur le code figé du template.
  {
    const btns = Array.isArray(tpl.buttons) ? tpl.buttons as { type?: string; code?: string }[] : []
    const codeIdx = btns.findIndex((b) => b.type === 'COPY_CODE')
    if (codeIdx >= 0) {
      const code = (params.variables.promo_code || btns[codeIdx].code || '').trim()
      if (code) {
        components.push({
          type: 'button',
          sub_type: 'copy_code',
          index: String(codeIdx),
          parameters: [{ type: 'coupon_code', coupon_code: code }],
        })
      }
    }
  }

  const { wabaClient } = await import('@/lib/whatsapp-cloud/client')
  const res = await wabaClient.sendTemplateWithParams(
    session.waba_phone_number_id, token, contact.phone_number, tpl.name, tpl.language, components
  )
  // id du message Meta (wamid) : indispensable pour rattacher ensuite les accusés
  // de réception (livré/lu/échec) au bon message → funnel de livraison réel.
  const waMessageId = res.ok
    ? ((res.data as { messages?: { id?: string }[] } | undefined)?.messages?.[0]?.id || null)
    : null
  if (!res.ok) {
    const raw = String(res.error || '')
    const code = raw.match(/"code"\s*:\s*(\d+)/)?.[1]
    // error_user_msg / message Meta lisible pour le diagnostic
    const userMsg = raw.match(/"error_user_msg"\s*:\s*"([^"]+)"/)?.[1]
      || raw.match(/"message"\s*:\s*"([^"]+)"/)?.[1] || ''
    // Limite Meta atteinte (palier 24h / anti-spam) : PAS un échec — on demande
    // au cron de REPROGRAMMER (la fenêtre glissante libère de la place). Codes :
    // 130429 rate limit · 131048 spam rate · 131056 pair rate · 80007 rate.
    const RATE_CODES = ['130429', '131048', '131056', '80007']
    if ((code && RATE_CODES.includes(code)) || /rate.?limit|too many/i.test(raw)) {
      return { ok: false, error: 'rate_limited' }
    }
    const isNoWa = (code && NO_WHATSAPP_CODES.includes(Number(code))) || /not.*whatsapp|invalid.*recipient/i.test(raw)
    // 132000 = le template approuvé chez Meta n'attend pas le même nombre de
    // variables que ce qu'on envoie (le corps approuvé diffère de notre version
    // locale). Message explicite plutôt que "no_whatsapp" trompeur.
    if (code === '132000') {
      return { ok: false, error: `params_mismatch (132000), le modèle approuvé chez Meta n'a pas le même nombre de {{variables}} que la version locale. Resoumettez le modèle.` }
    }
    // 132012 = format de paramètre incompatible. Cause fréquente : une variable
    // collée à du texte dans le corps (« {{1}}mot »), approuvée par Meta mais
    // refusée à l'envoi. Message actionnable plutôt que "no_whatsapp" trompeur.
    if (code === '132012') {
      return { ok: false, error: `format_incompatible (132012) : le modèle « ${tpl.name} » a un format de variable que Meta refuse à l'envoi (souvent une variable collée à du texte, ex. « {{1}}mot »). Ré-éditez le modèle en mettant un espace autour de chaque variable, puis resoumettez-le.` }
    }
    // On garde le code + le message Meta dans le résultat (diagnostic).
    return { ok: false, error: isNoWa ? `no_whatsapp (code ${code}: ${userMsg.slice(0, 90)})` : `send_failed: ${raw.slice(0, 160)}` }
  }

  // Trace inbox (conversation + message sortant) pour visibilité côté agent.
  try {
    const { encryptMessage } = await import('@/lib/crypto/encryption')
    let preview = tpl.body_text || `[Modèle : ${tpl.name}]`
    out.forEach((v, i) => { preview = preview.replace(`{{${i + 1}}}`, v) })

    // On enrichit la trace (type + métadonnées) pour un aperçu correct dans
    // l'inbox au lieu d'une simple ligne de texte.
    const isCarousel = tpl.template_type === 'carousel' && Array.isArray(tpl.carousel_cards)
    const isLto = tpl.template_type === 'limited_time_offer'
    let messageType = 'text'
    let transcription: string | null = null
    const bodyText = preview // le body résolu (avant ajout d'emoji)

    if (isCarousel) {
      messageType = 'carousel'
      const cards = (tpl.carousel_cards as { body_text?: string; header_media_url?: string | null }[])
        .map((c) => ({ body: c.body_text || '', header: c.header_media_url || null }))
      transcription = JSON.stringify({ body: bodyText, cards })
      const aperçu = preview.length > 60 ? preview.slice(0, 60) + '…' : preview
      preview = `🎠 ${aperçu}`
    } else if (isLto) {
      messageType = 'interactive'
      const btns = Array.isArray(tpl.buttons)
        ? (tpl.buttons as { type?: string; text?: string; url?: string; code?: string }[])
            .map((b) => ({ type: b.type || '', text: b.text || '', url: b.url || '', code: b.code || '' }))
        : []
      transcription = JSON.stringify({
        kind: 'lto',
        body: bodyText,
        lto_title: tpl.lto_title || '',
        lto_hours: tpl.lto_default_hours || 24,
        buttons: btns,
      })
      const aperçu = preview.length > 50 ? preview.slice(0, 50) + '…' : preview
      preview = `🏷️ ${aperçu}`
    } else {
      // Message STANDARD à boutons quick-reply : on stocke les libellés pour que
      // l'inbox les affiche sous la bulle (sinon on ne voyait que le texte).
      const qr = Array.isArray(tpl.buttons)
        ? (tpl.buttons as { type?: string; text?: string }[]).filter((b) => b.type === 'QUICK_REPLY').map((b) => b.text || '')
        : []
      if (qr.length > 0) {
        messageType = 'interactive'
        transcription = JSON.stringify({ kind: 'buttons', body: bodyText, buttons: qr })
      }
    }

    const { data: conv } = await supabase
      .from('conversations')
      .upsert(
        { session_id: contact.session_id, contact_id: contact.id, last_message_at: new Date().toISOString(), last_message_preview: preview },
        { onConflict: 'session_id,contact_id' }
      )
      .select()
      .single()
    if (conv) {
      await supabase.from('messages').insert({
        conversation_id: conv.id, session_id: contact.session_id, direction: 'outbound',
        content: encryptMessage(bodyText),
        message_type: messageType, transcription, sent_by: 'user', status: 'sent',
        // wamid Meta → permet de rattacher les accusés livré/lu/échec à ce message.
        wa_message_id: waMessageId,
        // Rattachement perf (funnel de livraison par automatisation).
        automation_id: params.automationId ?? null,
      })
    }
  } catch (e) {
    console.error('[automations] inbox trace échec (message envoyé):', e)
  }

  return { ok: true }
}
