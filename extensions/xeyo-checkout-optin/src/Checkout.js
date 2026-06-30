import {
  extension,
  BlockStack,
  Checkbox,
  Text,
} from '@shopify/ui-extensions/checkout'

// Libellés bilingues (le checkout est déjà localisé par Shopify).
const STRINGS = {
  en: {
    label: 'Get order updates on WhatsApp',
    consent: 'Receive order tracking and support messages on WhatsApp. You can opt out anytime.',
  },
  fr: {
    label: 'Recevoir le suivi de ma commande sur WhatsApp',
    consent: 'Vous recevrez le suivi de votre commande et le support sur WhatsApp. Désinscription à tout moment.',
  },
}

const ATTR_KEY = 'xeyo_whatsapp_optin'

export default extension('purchase.checkout.contact.render-after', (root, api) => {
  const { applyAttributeChange, localization } = api

  // Langue : 'fr' si la locale du checkout commence par fr, sinon 'en'.
  const iso = String(localization?.language?.current?.isoCode || 'en').toLowerCase()
  const t = iso.startsWith('fr') ? STRINGS.fr : STRINGS.en

  let checked = false

  const checkbox = root.createComponent(
    Checkbox,
    {
      checked,
      onChange: async (value) => {
        checked = value
        try {
          if (value) {
            await applyAttributeChange({ type: 'updateAttribute', key: ATTR_KEY, value: 'true' })
          } else {
            await applyAttributeChange({ type: 'removeAttribute', key: ATTR_KEY })
          }
        } catch (e) {
          // Silencieux : ne bloque jamais le checkout.
          // eslint-disable-next-line no-console
          console.error('[Xeyo checkout opt-in]', e)
        }
      },
    },
    t.label
  )

  const consent = root.createComponent(
    Text,
    { size: 'small', appearance: 'subdued' },
    t.consent
  )

  root.appendChild(
    root.createComponent(BlockStack, { spacing: 'tight' }, [checkbox, consent])
  )
})
