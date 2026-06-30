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
    consent: 'Receive order tracking and support messages on WhatsApp. Opt out anytime.',
  },
  fr: {
    label: 'Recevoir le suivi de ma commande sur WhatsApp',
    consent: 'Vous recevrez le suivi de votre commande et le support sur WhatsApp. Désinscription à tout moment.',
  },
}

const ATTR_OPTIN = 'xeyo_whatsapp_optin'

// NB: pas de lecture du téléphone côté extension (éviterait de demander l'accès
// "Protected customer data — Level 2"). On pose juste l'attribut d'opt-in ;
// le webhook orders/create récupère le numéro depuis la commande (read_orders).
export default extension('purchase.checkout.contact.render-after', (root, api) => {
  const { applyAttributeChange, localization } = api

  const iso = String(localization?.language?.current?.isoCode || 'en').toLowerCase()
  const t = iso.startsWith('fr') ? STRINGS.fr : STRINGS.en

  let optedIn = false

  const checkbox = root.createComponent(
    Checkbox,
    {
      checked: optedIn,
      onChange: async (value) => {
        optedIn = value
        try {
          if (value) {
            await applyAttributeChange({ type: 'updateAttribute', key: ATTR_OPTIN, value: 'true' })
          } else {
            await applyAttributeChange({ type: 'removeAttribute', key: ATTR_OPTIN })
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[Xeyo checkout opt-in]', e)
        }
      },
    },
    t.label
  )

  const consent = root.createComponent(Text, { size: 'small', appearance: 'subdued' }, t.consent)

  root.append(
    root.createComponent(BlockStack, { spacing: 'tight' }, [checkbox, consent])
  )
})
