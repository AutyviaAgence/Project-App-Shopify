'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Store, CheckCircle2, AlertCircle } from 'lucide-react'

type Phase = 'checking' | 'anonymous' | 'confirm' | 'linking' | 'done' | 'error'

export default function LinkClient() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') || ''

  const [phase, setPhase] = useState<Phase>('checking')
  const [email, setEmail] = useState<string | null>(null)
  const [shopName, setShopName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Suis-je connecté ? Si non, je dois d'abord choisir un compte — SANS perdre le
  // jeton : on le repasse en `redirect`, que /login et le callback Google honorent.
  useEffect(() => {
    if (!token) {
      setError('Lien de liaison manquant. Rouvrez Xeyo depuis votre admin Shopify.')
      setPhase('error')
      return
    }
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? null)
        setPhase('confirm')
      } else {
        setPhase('anonymous')
      }
    })
  }, [token])

  /** Emmène vers /login (ou /register) en conservant le jeton. */
  function goAuth(path: '/login' | '/register') {
    const back = `/link?token=${encodeURIComponent(token)}`
    router.push(`${path}?redirect=${encodeURIComponent(back)}`)
  }

  async function claim() {
    setPhase('linking')
    setError(null)
    try {
      const res = await fetch('/api/shopify/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'La liaison a échoué.')
        setPhase('error')
        return
      }
      setShopName(json.data?.shopName ?? null)
      setPhase('done')
      // La boutique est liée → l'onboarding se débloque (il attendait exactement ça).
      setTimeout(() => router.push('/dashboard'), 1600)
    } catch {
      setError('Erreur réseau. Réessayez.')
      setPhase('error')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {phase === 'done' ? (
              <CheckCircle2 className="h-6 w-6 text-primary" />
            ) : phase === 'error' ? (
              <AlertCircle className="h-6 w-6 text-destructive" />
            ) : (
              <Store className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle>
            {phase === 'done' ? 'Boutique reliée' : 'Relier votre boutique Shopify'}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {phase === 'checking' && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Pas de compte / pas connecté : il CHOISIT. On n'impose rien. */}
          {phase === 'anonymous' && (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Connectez-vous au compte Xeyo auquel rattacher votre boutique, ou créez-en un.
              </p>
              <div className="space-y-2">
                <Button className="w-full" onClick={() => goAuth('/login')}>
                  J’ai déjà un compte Xeyo
                </Button>
                <Button variant="outline" className="w-full" onClick={() => goAuth('/register')}>
                  Créer un compte
                </Button>
              </div>
            </>
          )}

          {/* Confirmation EXPLICITE : quelle boutique rejoint quel compte.
              C'est la protection contre le link-fixation (on ne lie jamais en silence). */}
          {phase === 'confirm' && (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Rattacher votre boutique Shopify au compte&nbsp;:
              </p>
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-center text-sm font-medium">
                {email}
              </p>
              <Button className="w-full" onClick={claim}>
                Relier ma boutique
              </Button>
              <button
                type="button"
                onClick={() => router.push(`/api/auth/switch-account?redirect=${encodeURIComponent(`/link?token=${token}`)}`)}
                className="w-full text-center text-xs text-muted-foreground hover:underline"
              >
                Utiliser un autre compte
              </button>
            </>
          )}

          {phase === 'linking' && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Liaison en cours…
            </div>
          )}

          {phase === 'done' && (
            <p className="text-center text-sm text-muted-foreground">
              {shopName ? <strong>{shopName}</strong> : 'Votre boutique'} est reliée à{' '}
              <strong>{email}</strong>. Redirection…
            </p>
          )}

          {phase === 'error' && (
            <>
              <p className="text-center text-sm text-destructive">{error}</p>
              <Button variant="outline" className="w-full" onClick={() => router.push('/dashboard')}>
                Retour au tableau de bord
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
