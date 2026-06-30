import {
  extension,
  BlockStack,
  Checkbox,
  TextField,
  Text,
} from '@shopify/ui-extensions/checkout'

// Libellés bilingues (le checkout est déjà localisé par Shopify).
const STRINGS = {
  en: {
    label: 'Get order updates on WhatsApp',
    consent: 'Receive order tracking and support messages on WhatsApp. Opt out anytime.',
    phoneLabel: 'WhatsApp phone number',
  },
  fr: {
    label: 'Recevoir le suivi de ma commande sur WhatsApp',
    consent: 'Vous recevrez le suivi de votre commande et le support sur WhatsApp. Désinscription à tout moment.',
    phoneLabel: 'Numéro WhatsApp',
  },
}

const ATTR_OPTIN = 'xeyo_whatsapp_optin'
const ATTR_PHONE = 'xeyo_whatsapp_phone'

export default extension('purchase.checkout.contact.render-after', (root, api) => {
  const { applyAttributeChange, localization, buyerIdentity, shippingAddress } = api

  const iso = String(localization?.language?.current?.isoCode || 'en').toLowerCase()
  const t = iso.startsWith('fr') ? STRINGS.fr : STRINGS.en

  // Téléphone déjà saisi dans le checkout (identité acheteur ou adresse livraison).
  const phoneFromCheckout = () =>
    (buyerIdentity?.phone?.current || shippingAddress?.current?.phone || '').trim()

  let optedIn = false
  let typedPhone = ''

  // --- Champ téléphone (affiché seulement si l'opt-in est coché ET pas de tél au checkout) ---
  const phoneField = root.createComponent(TextField, {
    label: t.phoneLabel,
    value: typedPhone,
    onChange: (value) => {
      typedPhone = String(value || '').trim()
      // On stocke le numéro saisi pour que le webhook puisse l'utiliser.
      if (optedIn && typedPhone) {
        applyAttributeChange({ type: 'updateAttribute', key: ATTR_PHONE, value: typedPhone }).catch(() => {})
      }
    },
  })

  // Conteneur du champ tél (vidé/rempli selon l'état).
  const phoneSlot = root.createComponent(BlockStack, { spacing: 'tight' }, [])

  function refreshPhoneSlot() {
    // Affiche le champ uniquement si : opt-in coché ET aucun téléphone au checkout.
    const needPhone = optedIn && !phoneFromCheckout()
    phoneSlot.replaceChildren(...(needPhone ? [phoneField] : []))
  }

  const checkbox = root.createComponent(
    Checkbox,
    {
      checked: optedIn,
      onChange: async (value) => {
        optedIn = value
        try {
          if (value) {
            await applyAttributeChange({ type: 'updateAttribute', key: ATTR_OPTIN, value: 'true' })
            if (typedPhone) {
              await applyAttributeChange({ type: 'updateAttribute', key: ATTR_PHONE, value: typedPhone })
            }
          } else {
            await applyAttributeChange({ type: 'removeAttribute', key: ATTR_OPTIN })
            await applyAttributeChange({ type: 'removeAttribute', key: ATTR_PHONE })
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[Xeyo checkout opt-in]', e)
        }
        refreshPhoneSlot()
      },
    },
    t.label
  )

  const consent = root.createComponent(Text, { size: 'small', appearance: 'subdued' }, t.consent)

  root.appendChild(
    root.createComponent(BlockStack, { spacing: 'tight' }, [checkbox, consent, phoneSlot])
  )

  // Si le téléphone du checkout change après coup, on (re)masque le champ.
  if (typeof buyerIdentity?.phone?.subscribe === 'function') {
    buyerIdentity.phone.subscribe(() => refreshPhoneSlot())
  }
  if (typeof shippingAddress?.subscribe === 'function') {
    shippingAddress.subscribe(() => refreshPhoneSlot())
  }
})
