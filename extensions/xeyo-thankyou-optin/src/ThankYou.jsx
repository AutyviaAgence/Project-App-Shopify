import {
  reactExtension,
  BlockStack,
  InlineStack,
  Checkbox,
  TextField,
  Button,
  Text,
  Banner,
  useApi,
  useShippingAddress,
} from '@shopify/ui-extensions-react/checkout'
import { useState } from 'react'

export default reactExtension('purchase.thank-you.block.render', () => <XeyoOptin />)

function XeyoOptin() {
  const { shop } = useApi()
  const address = useShippingAddress()

  // Numéro pré-rempli depuis la commande (livraison)
  const initialPhone = (address?.phone || '').trim()
  const [optedIn, setOptedIn] = useState(false)
  const [phone, setPhone] = useState(initialPhone)
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [error, setError] = useState('')

  async function submit() {
    const clean = (phone || '').replace(/[^0-9+]/g, '')
    if (clean.replace(/[^0-9]/g, '').length < 8) {
      setError('Numéro invalide.')
      setStatus('error')
      return
    }
    setStatus('loading')
    setError('')
    try {
      // App Proxy : passe par la boutique pour signature Shopify automatique
      const url = `https://${shop.myshopifyDomain}/apps/xeyo/optin?shop=${encodeURIComponent(shop.myshopifyDomain)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, name: [address?.firstName, address?.lastName].filter(Boolean).join(' ') }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok) {
        setStatus('done')
      } else {
        setError(json.error || 'Erreur, réessayez.')
        setStatus('error')
      }
    } catch {
      setError('Erreur réseau.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <Banner status="success" title="C'est noté !">
        Vous recevrez le suivi de votre commande sur WhatsApp.
      </Banner>
    )
  }

  return (
    <BlockStack spacing="base" border="base" cornerRadius="base" padding="base">
      <Checkbox checked={optedIn} onChange={setOptedIn}>
        📦 Recevoir le suivi de ma commande sur WhatsApp
      </Checkbox>

      {optedIn && (
        <BlockStack spacing="tight">
          <TextField
            label="Numéro WhatsApp"
            value={phone}
            onChange={setPhone}
            placeholder="+33 6 12 34 56 78"
          />
          {status === 'error' && <Text appearance="critical">{error}</Text>}
          <InlineStack>
            <Button kind="primary" loading={status === 'loading'} onPress={submit}>
              Valider
            </Button>
          </InlineStack>
          <Text size="small" appearance="subdued">Powered by Xeyo.io</Text>
        </BlockStack>
      )}
    </BlockStack>
  )
}
