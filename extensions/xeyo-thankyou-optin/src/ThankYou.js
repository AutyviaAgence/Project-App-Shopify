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

// Liste complète des pays : drapeau, nom (FR/EN pour la recherche), code ISO,
// indicatif téléphonique. Sert à construire les options ET à filtrer par nom.
const COUNTRIES = [
  { iso: 'FR', dial: '33', flag: '🇫🇷', name: 'France' },
  { iso: 'BE', dial: '32', flag: '🇧🇪', name: 'Belgique Belgium' },
  { iso: 'CH', dial: '41', flag: '🇨🇭', name: 'Suisse Switzerland' },
  { iso: 'LU', dial: '352', flag: '🇱🇺', name: 'Luxembourg' },
  { iso: 'MC', dial: '377', flag: '🇲🇨', name: 'Monaco' },
  { iso: 'US', dial: '1', flag: '🇺🇸', name: 'United States Etats-Unis USA' },
  { iso: 'CA', dial: '1', flag: '🇨🇦', name: 'Canada' },
  { iso: 'GB', dial: '44', flag: '🇬🇧', name: 'United Kingdom Royaume-Uni UK' },
  { iso: 'IE', dial: '353', flag: '🇮🇪', name: 'Ireland Irlande' },
  { iso: 'DE', dial: '49', flag: '🇩🇪', name: 'Germany Allemagne Deutschland' },
  { iso: 'AT', dial: '43', flag: '🇦🇹', name: 'Austria Autriche' },
  { iso: 'ES', dial: '34', flag: '🇪🇸', name: 'Spain Espagne España' },
  { iso: 'PT', dial: '351', flag: '🇵🇹', name: 'Portugal' },
  { iso: 'IT', dial: '39', flag: '🇮🇹', name: 'Italy Italie Italia' },
  { iso: 'NL', dial: '31', flag: '🇳🇱', name: 'Netherlands Pays-Bas' },
  { iso: 'DK', dial: '45', flag: '🇩🇰', name: 'Denmark Danemark' },
  { iso: 'SE', dial: '46', flag: '🇸🇪', name: 'Sweden Suède' },
  { iso: 'NO', dial: '47', flag: '🇳🇴', name: 'Norway Norvège' },
  { iso: 'FI', dial: '358', flag: '🇫🇮', name: 'Finland Finlande' },
  { iso: 'PL', dial: '48', flag: '🇵🇱', name: 'Poland Pologne' },
  { iso: 'CZ', dial: '420', flag: '🇨🇿', name: 'Czechia Tchéquie' },
  { iso: 'GR', dial: '30', flag: '🇬🇷', name: 'Greece Grèce' },
  { iso: 'RO', dial: '40', flag: '🇷🇴', name: 'Romania Roumanie' },
  { iso: 'HU', dial: '36', flag: '🇭🇺', name: 'Hungary Hongrie' },
  { iso: 'BG', dial: '359', flag: '🇧🇬', name: 'Bulgaria Bulgarie' },
  { iso: 'HR', dial: '385', flag: '🇭🇷', name: 'Croatia Croatie' },
  { iso: 'SK', dial: '421', flag: '🇸🇰', name: 'Slovakia Slovaquie' },
  { iso: 'SI', dial: '386', flag: '🇸🇮', name: 'Slovenia Slovénie' },
  { iso: 'LT', dial: '370', flag: '🇱🇹', name: 'Lithuania Lituanie' },
  { iso: 'LV', dial: '371', flag: '🇱🇻', name: 'Latvia Lettonie' },
  { iso: 'EE', dial: '372', flag: '🇪🇪', name: 'Estonia Estonie' },
  { iso: 'MA', dial: '212', flag: '🇲🇦', name: 'Morocco Maroc' },
  { iso: 'DZ', dial: '213', flag: '🇩🇿', name: 'Algeria Algérie' },
  { iso: 'TN', dial: '216', flag: '🇹🇳', name: 'Tunisia Tunisie' },
  { iso: 'EG', dial: '20', flag: '🇪🇬', name: 'Egypt Egypte' },
  { iso: 'SN', dial: '221', flag: '🇸🇳', name: 'Senegal Sénégal' },
  { iso: 'CI', dial: '225', flag: '🇨🇮', name: "Côte d'Ivoire Ivory Coast" },
  { iso: 'CM', dial: '237', flag: '🇨🇲', name: 'Cameroon Cameroun' },
  { iso: 'AE', dial: '971', flag: '🇦🇪', name: 'United Arab Emirates Emirats UAE Dubai' },
  { iso: 'SA', dial: '966', flag: '🇸🇦', name: 'Saudi Arabia Arabie Saoudite' },
  { iso: 'TR', dial: '90', flag: '🇹🇷', name: 'Turkey Turquie' },
  { iso: 'IL', dial: '972', flag: '🇮🇱', name: 'Israel Israël' },
  { iso: 'IN', dial: '91', flag: '🇮🇳', name: 'India Inde' },
  { iso: 'CN', dial: '86', flag: '🇨🇳', name: 'China Chine' },
  { iso: 'JP', dial: '81', flag: '🇯🇵', name: 'Japan Japon' },
  { iso: 'KR', dial: '82', flag: '🇰🇷', name: 'South Korea Corée' },
  { iso: 'AU', dial: '61', flag: '🇦🇺', name: 'Australia Australie' },
  { iso: 'NZ', dial: '64', flag: '🇳🇿', name: 'New Zealand Nouvelle-Zélande' },
  { iso: 'BR', dial: '55', flag: '🇧🇷', name: 'Brazil Brésil' },
  { iso: 'MX', dial: '52', flag: '🇲🇽', name: 'Mexico Mexique' },
  { iso: 'AR', dial: '54', flag: '🇦🇷', name: 'Argentina Argentine' },
  { iso: 'ZA', dial: '27', flag: '🇿🇦', name: 'South Africa Afrique du Sud' },
]

// Option d'affichage pour le Select (drapeau + indicatif).
function countryOption(c) {
  return { value: c.iso, label: `${c.flag} +${c.dial}` }
}
// Toutes les options (non filtrées)
const COUNTRY_CODES = COUNTRIES.map(countryOption)

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

// Index ISO → pays (le Select stocke l'ISO car US/CA partagent l'indicatif +1).
const BY_ISO = {}
for (const c of COUNTRIES) BY_ISO[c.iso] = c

// Filtre les pays par texte (nom FR/EN, indicatif ou code ISO).
function filterCountries(q) {
  const s = (q || '').trim().toLowerCase().replace(/^\+/, '')
  if (!s) return COUNTRIES
  return COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(s) ||
    c.iso.toLowerCase().includes(s) ||
    c.dial.startsWith(s)
  )
}

// Textes : anglais par défaut, français si la boutique/le client est en FR.
const STRINGS = {
  en: {
    checkbox: '📦 Get order updates and exclusive offers on WhatsApp',
    consent: (store) => `By confirming, I agree to receive WhatsApp messages from ${store} about my order updates and its offers and promotions. Reply STOP to unsubscribe anytime.`,
    countryLabel: 'Country',
    countrySearch: 'Search country (e.g. France, FR, 33)',
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
    countryLabel: 'Pays',
    countrySearch: 'Rechercher un pays (ex : France, FR, 33)',
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

  // Pays par défaut selon le pays de livraison / la langue.
  const country = (api.shippingAddress?.current?.countryCode || localization?.country?.current?.isoCode || '').toUpperCase()
  let selectedIso = BY_ISO[country] ? country : (lang === 'fr' ? 'FR' : 'US')
  let dialCode = BY_ISO[selectedIso].dial
  let localNumber = '' // partie après l'indicatif

  // Message d'erreur / statut
  const message = root.createComponent(Text, { appearance: 'critical' }, '')
  message.remove?.() // caché par défaut (on l'ajoute au besoin)

  // Champ de recherche de pays : filtre la liste par nom / indicatif / ISO.
  const countrySearch = root.createComponent(TextField, {
    label: t.countrySearch,
    value: '',
    onChange: (q) => {
      const list = filterCountries(q)
      const options = list.map(countryOption)
      // Si le pays sélectionné n'est plus dans la liste filtrée, on bascule
      // sur le 1er résultat pour garder une valeur cohérente.
      if (options.length > 0 && !options.find((o) => o.value === selectedIso)) {
        selectedIso = options[0].value
        dialCode = BY_ISO[selectedIso].dial
      }
      codeSelect.updateProps({ options, value: selectedIso })
    },
  })

  // Sélecteur de pays (stocke l'ISO ; l'indicatif en dérive).
  const codeSelect = root.createComponent(Select, {
    label: t.countryLabel,
    value: selectedIso,
    options: COUNTRY_CODES,
    onChange: (iso) => {
      selectedIso = iso
      dialCode = BY_ISO[iso] ? BY_ISO[iso].dial : dialCode
    },
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
          // Sépare l'indicatif (le plus long qui matche) du numéro local,
          // puis sélectionne le pays correspondant dans le Select.
          const dials = COUNTRIES.map((c) => c.dial).sort((a, b) => b.length - a.length)
          const match = dials.find((d) => digits.startsWith(d))
          if (match) {
            dialCode = match
            localNumber = digits.slice(match.length)
            const c = COUNTRIES.find((x) => x.dial === match)
            if (c) { selectedIso = c.iso; codeSelect.updateProps({ value: c.iso }) }
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

  // Pays (recherche) au-dessus, puis indicatif + numéro côte à côte.
  const phoneRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'end' }, [
    codeSelect,
    phoneField,
  ])

  const fieldsStack = root.createComponent(BlockStack, { spacing: 'tight' }, [
    countrySearch,
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
