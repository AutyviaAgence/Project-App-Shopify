import {
  extension,
  BlockStack,
  InlineStack,
  Checkbox,
  TextField,
  Button,
  Text,
  Banner,
} from '@shopify/ui-extensions/checkout'

// Textes : anglais par défaut, français si la boutique/le client est en FR.
const STRINGS = {
  en: {
    checkbox: '📦 Get order updates and exclusive offers on WhatsApp',
    consent: (store) => `By confirming, I agree to receive WhatsApp messages from ${store} about my order updates and its offers and promotions. Reply STOP to unsubscribe anytime.`,
    phoneLabel: 'WhatsApp number',
    submit: 'Confirm',
    invalid: 'Invalid number.',
    saving: 'Saving…',
    successTitle: "You're all set!",
    successBody: 'You will receive your order updates on WhatsApp.',
    networkError: 'Network error.',
    genericError: 'Error, please try again.',
    store: 'the store',
  },
  fr: {
    checkbox: '📦 Recevoir le suivi de ma commande et les offres exclusives sur WhatsApp',
    consent: (store) => `En validant, j'accepte de recevoir des messages WhatsApp de ${store} concernant le suivi de ma commande ainsi que ses offres et promotions. Répondez STOP pour vous désabonner à tout moment.`,
    phoneLabel: 'Numéro WhatsApp',
    submit: 'Valider',
    invalid: 'Numéro invalide.',
    saving: 'Enregistrement…',
    successTitle: "C'est noté !",
    successBody: 'Vous recevrez le suivi de votre commande sur WhatsApp.',
    networkError: 'Erreur réseau.',
    genericError: 'Erreur, réessayez.',
    store: 'la boutique',
  },
}

// Opt-in WhatsApp sur la page de remerciement (JS pur, sans React).
export default extension('purchase.thank-you.block.render', (root, api) => {
  const { shop, shippingAddress, billingAddress, localization, phone: apiPhone } = api
  const address = shippingAddress?.current || {}
  const billing = billingAddress?.current || {}

  // Détection de la langue (anglais par défaut)
  const isoRaw = localization?.language?.current?.isoCode || localization?.isoCode || ''
  const lang = String(isoRaw).toLowerCase().startsWith('fr') ? 'fr' : 'en'
  const t = STRINGS[lang]

  let optedIn = false
  // Pré-remplissage : on essaie le téléphone de livraison, puis facturation,
  // puis le téléphone du checkout. Modifiable par le client (best practice).
  let phone = (address.phone || billing.phone || apiPhone?.current || '').trim()
  let busy = false

  const fullName = [address.firstName, address.lastName].filter(Boolean).join(' ')

  // Message d'erreur / statut
  const message = root.createComponent(Text, { appearance: 'critical' }, '')
  message.remove?.() // caché par défaut (on l'ajoute au besoin)

  const phoneField = root.createComponent(TextField, {
    label: t.phoneLabel,
    value: phone,
    onChange: (v) => { phone = v },
  })

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
    const clean = (phone || '').replace(/[^0-9+]/g, '')
    if (clean.replace(/[^0-9]/g, '').length < 8) {
      showError(t.invalid)
      return
    }
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
        // Remplace tout par une bannière de succès
        root.replaceChildren(
          root.createComponent(
            Banner,
            { status: 'success', title: t.successTitle },
            t.successBody
          )
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
