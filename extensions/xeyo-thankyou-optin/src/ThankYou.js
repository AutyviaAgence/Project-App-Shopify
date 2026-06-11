import {
  extension,
  BlockStack,
  InlineStack,
  Checkbox,
  TextField,
  Select,
  Button,
  Text,
} from '@shopify/ui-extensions/checkout'

// Indicatifs pays proposés dans la liste déroulante (les plus courants en e-commerce).
const COUNTRY_CODES = [
  { value: '33', label: '🇫🇷 +33' },
  { value: '32', label: '🇧🇪 +32' },
  { value: '41', label: '🇨🇭 +41' },
  { value: '352', label: '🇱🇺 +352' },
  { value: '1', label: '🇺🇸 +1' },
  { value: '44', label: '🇬🇧 +44' },
  { value: '49', label: '🇩🇪 +49' },
  { value: '34', label: '🇪🇸 +34' },
  { value: '39', label: '🇮🇹 +39' },
  { value: '31', label: '🇳🇱 +31' },
  { value: '351', label: '🇵🇹 +351' },
  { value: '212', label: '🇲🇦 +212' },
  { value: '213', label: '🇩🇿 +213' },
  { value: '216', label: '🇹🇳 +216' },
]

// Longueur attendue du numéro LOCAL (sans indicatif) par indicatif, pour
// une validation stricte : min/max de chiffres. Défaut générique si absent.
const LOCAL_LENGTH = {
  '33': { min: 9, max: 9 },   // France : 6 12 34 56 78 → 9 chiffres
  '32': { min: 8, max: 9 },   // Belgique
  '41': { min: 9, max: 9 },   // Suisse
  '352': { min: 8, max: 9 },  // Luxembourg
  '1': { min: 10, max: 10 },  // US/Canada
  '44': { min: 10, max: 10 }, // UK
  '49': { min: 10, max: 11 }, // Allemagne
  '34': { min: 9, max: 9 },   // Espagne
  '39': { min: 9, max: 10 },  // Italie
  '31': { min: 9, max: 9 },   // Pays-Bas
  '351': { min: 9, max: 9 },  // Portugal
  '212': { min: 9, max: 9 },  // Maroc
  '213': { min: 9, max: 9 },  // Algérie
  '216': { min: 8, max: 8 },  // Tunisie
}
const DEFAULT_LOCAL = { min: 6, max: 14 }

// Textes : anglais par défaut, français si la boutique/le client est en FR.
const STRINGS = {
  en: {
    checkbox: '📦 Get order updates and exclusive offers on WhatsApp',
    consent: (store) => `By confirming, I agree to receive WhatsApp messages from ${store} about my order updates and its offers and promotions. Reply STOP to unsubscribe anytime.`,
    countryLabel: 'Code',
    phoneLabel: 'WhatsApp number',
    phonePlaceholder: '555 123 4567',
    phoneHelp: 'Pick your country code, then enter your number.',
    invalid: 'Please enter a valid number.',
    errEmpty: 'Please enter your phone number.',
    errTooShort: 'This number is too short for the selected country.',
    errTooLong: 'This number is too long for the selected country.',
    errNoWhatsapp: 'No WhatsApp account found for this number. Please check it.',
    submit: 'Confirm',
    saving: 'Saving…',
    successTitle: "You're all set!",
    successBody: 'You will receive your order updates on WhatsApp.',
    subscribed: 'You are subscribed to receive order updates on WhatsApp',
    networkError: 'Network error.',
    genericError: 'Error, please try again.',
    store: 'the store',
  },
  fr: {
    checkbox: '📦 Recevoir le suivi de ma commande et les offres exclusives sur WhatsApp',
    consent: (store) => `En validant, j'accepte de recevoir des messages WhatsApp de ${store} concernant le suivi de ma commande ainsi que ses offres et promotions. Répondez STOP pour vous désabonner à tout moment.`,
    countryLabel: 'Indicatif',
    phoneLabel: 'Numéro WhatsApp',
    phonePlaceholder: '6 12 34 56 78',
    phoneHelp: 'Choisissez votre indicatif, puis saisissez votre numéro.',
    invalid: 'Saisissez un numéro valide.',
    errEmpty: 'Saisissez votre numéro de téléphone.',
    errTooShort: 'Ce numéro est trop court pour le pays sélectionné.',
    errTooLong: 'Ce numéro est trop long pour le pays sélectionné.',
    errNoWhatsapp: 'Aucun compte WhatsApp trouvé pour ce numéro. Vérifiez-le.',
    submit: 'Valider',
    saving: 'Enregistrement…',
    successTitle: "C'est noté !",
    successBody: 'Vous recevrez le suivi de votre commande sur WhatsApp.',
    subscribed: 'Vous êtes abonné(e) pour recevoir le suivi de votre commande sur WhatsApp',
    networkError: 'Erreur réseau.',
    genericError: 'Erreur, réessayez.',
    store: 'la boutique',
  },
}

// Formate un numéro en "+XX XX XX XX XX XX" (groupes de 2 après l'indicatif).
function formatPhone(raw) {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length < 8) return raw
  // Indicatif pays : 1 à 3 chiffres. Heuristique simple : 2 pour la plupart,
  // 1 pour l'Amérique du Nord (commence par 1). On garde 2 par défaut.
  let cc = 2
  if (digits.startsWith('1')) cc = 1
  else if (digits.startsWith('33') || digits.startsWith('44') || digits.startsWith('49') || digits.startsWith('34') || digits.startsWith('39') || digits.startsWith('32') || digits.startsWith('31') || digits.startsWith('41')) cc = 2
  else if (/^(212|213|216|221|225|237|261)/.test(digits)) cc = 3
  const country = digits.slice(0, cc)
  const rest = digits.slice(cc)
  const groups = rest.match(/.{1,2}/g) || []
  return `+${country} ${groups.join(' ')}`.trim()
}

// Opt-in WhatsApp sur la page de remerciement (JS pur, sans React).
export default extension('purchase.thank-you.block.render', (root, api) => {
  const { shop, localization } = api

  // Détection de la langue (anglais par défaut)
  const isoRaw = localization?.language?.current?.isoCode || localization?.isoCode || ''
  const lang = String(isoRaw).toLowerCase().startsWith('fr') ? 'fr' : 'en'
  const t = STRINGS[lang]

  const shipping = api.shippingAddress?.current || {}

  const address = shipping
  let optedIn = false
  let busy = false

  const fullName = [address.firstName, address.lastName].filter(Boolean).join(' ')

  // Indicatif pays par défaut selon le pays de livraison / la langue.
  const country = (api.shippingAddress?.current?.countryCode || localization?.country?.current?.isoCode || '').toUpperCase()
  const COUNTRY_TO_CODE = { FR: '33', BE: '32', CH: '41', LU: '352', US: '1', CA: '1', GB: '44', DE: '49', ES: '34', IT: '39', NL: '31', PT: '351', MA: '212', DZ: '213', TN: '216' }
  let dialCode = COUNTRY_TO_CODE[country] || (lang === 'fr' ? '33' : '1')
  let localNumber = '' // partie après l'indicatif

  // Message d'erreur / statut
  const message = root.createComponent(Text, { appearance: 'critical' }, '')
  message.remove?.() // caché par défaut (on l'ajoute au besoin)

  // Sélecteur d'indicatif pays
  const codeSelect = root.createComponent(Select, {
    label: t.countryLabel,
    value: dialCode,
    options: COUNTRY_CODES,
    onChange: (v) => { dialCode = v },
  })

  // Champ numéro local (sans l'indicatif)
  const phoneField = root.createComponent(TextField, {
    label: t.phoneLabel,
    value: localNumber,
    placeholder: t.phonePlaceholder,
    helpText: t.phoneHelp,
    onChange: (v) => { localNumber = v },
  })

  // Pré-remplissage : le téléphone n'est pas exposé côté client sur la page Merci.
  // On le récupère côté serveur (Admin API) via notre App Proxy, à partir du
  // numéro de commande. On met à jour le champ dès la réponse (sauf saisie en cours).
  // On appelle directement app.xeyo.io (cross-origin, headers CORS côté serveur)
  // plutôt que le proxy {shop}/apps/xeyo qui renvoie un 302 sans CORS.
  const XEYO_BASE = 'https://app.xeyo.io'
  const orderNumber = api.orderConfirmation?.current?.number
  const orderId = api.orderConfirmation?.current?.order?.id
  if (orderNumber || orderId) {
    const domain = shop.myshopifyDomain
    const params = new URLSearchParams({ shop: domain })
    if (orderNumber) params.set('order', orderNumber)
    if (orderId) params.set('id', orderId)
    const url = `${XEYO_BASE}/api/shopify/proxy/order-phone?${params.toString()}`
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        const digits = (j?.phone || '').toString().replace(/\D/g, '')
        if (digits && !localNumber) {
          // Sépare l'indicatif (parmi la liste) du numéro local.
          const codes = COUNTRY_CODES.map((c) => c.value).sort((a, b) => b.length - a.length)
          const match = codes.find((c) => digits.startsWith(c))
          if (match) {
            dialCode = match
            localNumber = digits.slice(match.length)
            codeSelect.updateProps({ value: match })
          } else {
            localNumber = digits
          }
          phoneField.updateProps({ value: localNumber })
        }
      })
      .catch(() => { /* silencieux : saisie manuelle en fallback */ })
  }

  const submitButton = root.createComponent(
    Button,
    {
      kind: 'primary',
      onPress: () => submit(),
    },
    t.submit
  )

  // Nom de la boutique (pour la mention de consentement conforme Meta)
  const storeName = shop?.name || t.store

  // Mention de consentement explicite (exigence Meta : qui envoie, quoi, opt-out)
  const consent = root.createComponent(
    Text,
    { size: 'small', appearance: 'subdued' },
    t.consent(storeName)
  )

  const branding = root.createComponent(
    Text,
    { size: 'small', appearance: 'subdued' },
    'Powered by Xeyo.io'
  )

  // Indicatif + numéro côte à côte (l'indicatif prend une largeur fixe).
  const phoneRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'end' }, [
    codeSelect,
    phoneField,
  ])

  const fieldsStack = root.createComponent(BlockStack, { spacing: 'tight' }, [
    phoneRow,
    consent,
    root.createComponent(InlineStack, {}, [submitButton]),
    branding,
  ])

  const checkbox = root.createComponent(
    Checkbox,
    {
      checked: optedIn,
      onChange: (checked) => {
        optedIn = checked
        if (checked) container.appendChild(fieldsStack)
        else fieldsStack.remove()
      },
    },
    t.checkbox
  )

  const container = root.createComponent(
    BlockStack,
    { spacing: 'base', border: 'base', cornerRadius: 'base', padding: 'base' },
    [checkbox]
  )

  root.appendChild(container)

  async function submit() {
    // Numéro local saisi (uniquement les chiffres) + indicatif sélectionné.
    const local = (localNumber || '').replace(/\D/g, '')
    if (!local) { showError(t.errEmpty); return }

    // Validation stricte de longueur selon le pays choisi.
    const rule = LOCAL_LENGTH[dialCode] || DEFAULT_LOCAL
    if (local.length < rule.min) { showError(t.errTooShort); return }
    if (local.length > rule.max) { showError(t.errTooLong); return }

    // Numéro complet E.164 (sans +, le serveur ne garde que les chiffres).
    const clean = dialCode + local

    if (busy) return
    busy = true
    submitButton.updateProps({ loading: true })
    try {
      const domain = shop.myshopifyDomain
      // Direct vers app.xeyo.io (CORS géré côté serveur), pas via le proxy 302.
      const url = `${XEYO_BASE}/api/shopify/proxy/optin?shop=${encodeURIComponent(domain)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, name: fullName, marketing: true }),
      })
      const json = await res.json().catch(() => ({}))
      // Le serveur peut signaler un numéro sans compte WhatsApp.
      if (res.status === 422 || json.error === 'no_whatsapp') {
        showError(t.errNoWhatsapp)
        busy = false
        submitButton.updateProps({ loading: false })
        return
      }
      if (res.ok && json.ok) {
        // Confirmation discrète façon Shopify : "✓ Vous êtes abonné…" (non décochable)
        root.replaceChildren(
          root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' }, [
            root.createComponent(Text, { appearance: 'success' }, '✓'),
            root.createComponent(Text, { appearance: 'subdued' }, t.subscribed),
          ])
        )
      } else {
        showError(json.error || t.genericError)
        busy = false
        submitButton.updateProps({ loading: false })
      }
    } catch {
      showError(t.networkError)
      busy = false
      submitButton.updateProps({ loading: false })
    }
  }

  function showError(text) {
    message.updateText?.(text)
    if (!fieldsStack.children.includes(message)) {
      fieldsStack.insertBefore(message, submitButton.parent || null)
    }
  }
})
