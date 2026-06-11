import {
  extension,
  BlockStack,
  InlineStack,
  Checkbox,
  TextField,
  Button,
  Text,
} from '@shopify/ui-extensions/checkout'

// Textes : anglais par défaut, français si la boutique/le client est en FR.
const STRINGS = {
  en: {
    checkbox: '📦 Get order updates and exclusive offers on WhatsApp',
    consent: (store) => `By confirming, I agree to receive WhatsApp messages from ${store} about my order updates and its offers and promotions. Reply STOP to unsubscribe anytime.`,
    phoneLabel: 'WhatsApp number',
    phonePlaceholder: '+1 555 123 4567',
    phoneHelp: 'Enter your number with the country code (e.g. +1, +33).',
    invalid: 'Please enter a valid number with country code (e.g. +1 555 123 4567).',
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
    phoneLabel: 'Numéro WhatsApp',
    phonePlaceholder: '+33 6 12 34 56 78',
    phoneHelp: 'Saisissez votre numéro avec l\'indicatif pays (ex : +33, +1).',
    invalid: 'Saisissez un numéro valide avec l\'indicatif pays (ex : +33 6 12 34 56 78).',
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

// Opt-in WhatsApp sur la page de remerciement (JS pur, sans React).
export default extension('purchase.thank-you.block.render', (root, api) => {
  const { shop, localization } = api

  // Détection de la langue (anglais par défaut)
  const isoRaw = localization?.language?.current?.isoCode || localization?.isoCode || ''
  const lang = String(isoRaw).toLowerCase().startsWith('fr') ? 'fr' : 'en'
  const t = STRINGS[lang]

  const shipping = api.shippingAddress?.current || {}
  let phone = ''

  const address = shipping
  let optedIn = false
  let busy = false

  const fullName = [address.firstName, address.lastName].filter(Boolean).join(' ')

  // Message d'erreur / statut
  const message = root.createComponent(Text, { appearance: 'critical' }, '')
  message.remove?.() // caché par défaut (on l'ajoute au besoin)

  const phoneField = root.createComponent(TextField, {
    label: t.phoneLabel,
    value: phone,
    placeholder: t.phonePlaceholder,
    helpText: t.phoneHelp,
    onChange: (v) => { phone = v },
  })

  // Pré-remplissage : le téléphone n'est pas exposé côté client sur la page Merci.
  // On le récupère côté serveur (Admin API) via notre App Proxy, à partir du
  // numéro de commande. On met à jour le champ dès la réponse (sauf saisie en cours).
  const orderNumber = api.orderConfirmation?.current?.number
  const orderId = api.orderConfirmation?.current?.order?.id
  if (orderNumber || orderId) {
    const domain = shop.myshopifyDomain
    const params = new URLSearchParams({ shop: domain })
    if (orderNumber) params.set('order', orderNumber)
    if (orderId) params.set('id', orderId)
    const url = `https://${domain}/apps/xeyo/order-phone?${params.toString()}`
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        const found = (j?.phone || '').toString().trim()
        if (found && !phone) {
          phone = found
          phoneField.updateProps({ value: found })
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

  const fieldsStack = root.createComponent(BlockStack, { spacing: 'tight' }, [
    phoneField,
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
    // Normalisation : on garde les chiffres et un éventuel + en tête.
    let clean = (phone || '').trim().replace(/[^\d+]/g, '')
    if (clean.indexOf('+') > 0) clean = clean.replace(/\+/g, '') // + seulement en tête
    const digits = clean.replace(/\D/g, '')
    // Validation format international (E.164) : indicatif requis, 8 à 15 chiffres.
    const hasCountryCode = clean.startsWith('+') || digits.length >= 10
    if (!hasCountryCode || digits.length < 8 || digits.length > 15) {
      showError(t.invalid)
      return
    }
    // On transmet en E.164 (sans +, le serveur ne garde que les chiffres)
    if (busy) return
    busy = true
    submitButton.updateProps({ loading: true })
    try {
      const domain = shop.myshopifyDomain
      const url = `https://${domain}/apps/xeyo/optin?shop=${encodeURIComponent(domain)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, name: fullName, marketing: true }),
      })
      const json = await res.json().catch(() => ({}))
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
