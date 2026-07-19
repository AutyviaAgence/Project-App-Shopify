'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, MessageSquare } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    FB?: any
    fbAsyncInit?: () => void
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID

/**
 * Bouton « Connecter avec Facebook » — Embedded Signup de Meta.
 *
 * Le marchand choisit (ou crée) sa WABA et son numéro dans une popup Facebook :
 * il n'a JAMAIS à copier un Phone Number ID ni un token. Meta nous renvoie
 *   - un `code` d'autorisation (callback de FB.login) ;
 *   - les identifiants WABA/numéro (message `WA_EMBEDDED_SIGNUP` via postMessage).
 * Les deux sont envoyés au serveur, qui échange le code contre un token, abonne
 * l'app à la WABA et crée la session (cf. /api/whatsapp/embedded-signup).
 *
 * Si l'App ID ou le Config ID ne sont pas configurés, le composant ne rend rien :
 * l'appelant doit alors proposer la saisie manuelle.
 */
export function WhatsAppEmbeddedSignup({
  onConnected,
  className,
}: {
  onConnected?: () => void
  className?: string
}) {
  const [sdkReady, setSdkReady] = useState(false)
  const [busy, setBusy] = useState(false)
  // Renseigné par l'event postMessage de Meta, lu au retour de FB.login.
  const signupData = useRef<{ waba_id?: string; phone_number_id?: string }>({})

  const configured = Boolean(APP_ID && CONFIG_ID)

  // 1. Charger le SDK Facebook (une seule fois).
  useEffect(() => {
    if (!configured || typeof window === 'undefined') return
    if (window.FB) { setSdkReady(true); return }

    window.fbAsyncInit = () => {
      window.FB?.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: 'v22.0' })
      setSdkReady(true)
    }

    const id = 'facebook-jssdk'
    if (document.getElementById(id)) return
    const js = document.createElement('script')
    js.id = id
    js.src = 'https://connect.facebook.net/en_US/sdk.js'
    js.async = true
    js.defer = true
    js.crossOrigin = 'anonymous'
    document.body.appendChild(js)
  }, [configured])

  // 2. Écouter l'event Embedded Signup : c'est LUI qui porte waba_id + phone_number_id.
  useEffect(() => {
    if (!configured) return
    function onMessage(event: MessageEvent) {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return
      try {
        const data = JSON.parse(event.data)
        if (data.type !== 'WA_EMBEDDED_SIGNUP') return
        if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA') {
          signupData.current = {
            waba_id: data.data?.waba_id,
            phone_number_id: data.data?.phone_number_id,
          }
        } else if (data.event === 'CANCEL') {
          // L'utilisateur a fermé la popup en cours de route.
          signupData.current = {}
        }
      } catch {
        /* message non-JSON : ignoré */
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [configured])

  const launch = useCallback(() => {
    if (!window.FB) { toast.error('La connexion WhatsApp n’est pas encore prête, réessayez dans un instant.'); return }
    setBusy(true)
    signupData.current = {}

    // Échange serveur (asynchrone), séparé de la callback FB : le SDK Facebook
    // REFUSE une callback `async` (« Expression is of type asyncfunction, not
    // function ») — la callback ci-dessous doit donc rester synchrone.
    const finish = async (code: string, waba_id: string, phone_number_id: string) => {
      try {
        const res = await fetch('/api/whatsapp/embedded-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, waba_id, phone_number_id }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Connexion impossible')

        const n = json.imported_templates ?? 0
        toast.success(n > 0 ? `WhatsApp connecté ✓, ${n} modèle(s) importé(s)` : 'WhatsApp connecté ✓')
        if (json.webhooks_subscribed === false) {
          toast.warning('Connecté, mais l’abonnement aux notifications a échoué. Les messages entrants peuvent ne pas arriver.')
        }
        onConnected?.()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setBusy(false)
      }
    }

    window.FB.login(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (response: any) => {
        const code = response?.authResponse?.code
        if (!code) {
          setBusy(false)
          // Fermeture volontaire de la popup : pas d'erreur bruyante.
          if (response?.status !== 'unknown') toast.error('Connexion WhatsApp annulée.')
          return
        }

        const { waba_id, phone_number_id } = signupData.current
        if (!waba_id || !phone_number_id) {
          setBusy(false)
          toast.error('Meta n’a pas renvoyé le compte WhatsApp. Réessayez ou utilisez la saisie manuelle.')
          return
        }

        void finish(code, waba_id, phone_number_id)
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
      }
    )
  }, [onConnected])

  if (!configured) return null

  return (
    <Button onClick={launch} disabled={!sdkReady || busy} className={className}>
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
      {/* On nomme le RÉSULTAT (connecter WhatsApp), pas le fournisseur d'identité :
          le marchand vient connecter WhatsApp, Meta n'est que le passage obligé. */}
      {busy ? 'Connexion…' : !sdkReady ? 'Chargement…' : 'Connecter mon WhatsApp'}
    </Button>
  )
}

/** Le bouton Meta est-il configurable côté client ? (sinon : saisie manuelle) */
export const embeddedSignupAvailable = Boolean(APP_ID && CONFIG_ID)
