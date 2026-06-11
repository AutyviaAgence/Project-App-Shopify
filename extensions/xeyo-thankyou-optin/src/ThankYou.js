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

// Opt-in WhatsApp sur la page de remerciement (JS pur, sans React).
export default extension('purchase.thank-you.block.render', (root, api) => {
  const { shop, shippingAddress } = api
  const address = shippingAddress?.current || {}

  let optedIn = false
  let phone = (address.phone || '').trim()
  let busy = false

  const fullName = [address.firstName, address.lastName].filter(Boolean).join(' ')

  // Message d'erreur / statut
  const message = root.createComponent(Text, { appearance: 'critical' }, '')
  message.remove?.() // caché par défaut (on l'ajoute au besoin)

  const phoneField = root.createComponent(TextField, {
    label: 'Numéro WhatsApp',
    value: phone,
    onChange: (v) => { phone = v },
  })

  const submitButton = root.createComponent(
    Button,
    {
      kind: 'primary',
      onPress: () => submit(),
    },
    'Valider'
  )

  const branding = root.createComponent(
    Text,
    { size: 'small', appearance: 'subdued' },
    'Powered by Xeyo.io'
  )

  const fieldsStack = root.createComponent(BlockStack, { spacing: 'tight' }, [
    phoneField,
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
    '📦 Recevoir le suivi de ma commande sur WhatsApp'
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
      showError('Numéro invalide.')
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
        body: JSON.stringify({ phone: clean, name: fullName }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok) {
        // Remplace tout par une bannière de succès
        root.replaceChildren(
          root.createComponent(
            Banner,
            { status: 'success', title: "C'est noté !" },
            'Vous recevrez le suivi de votre commande sur WhatsApp.'
          )
        )
      } else {
        showError(json.error || 'Erreur, réessayez.')
        busy = false
        submitButton.updateProps({ loading: false })
      }
    } catch {
      showError('Erreur réseau.')
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
