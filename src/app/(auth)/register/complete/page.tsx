'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { useTenant } from '@/lib/tenant/context'
import { Loader2 } from 'lucide-react'

export default function RegisterCompletePage() {
  const tenant = useTenant()
  const router = useRouter()
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleAccept() {
    if (!accepted) {
      toast.error('Veuillez accepter les CGV pour continuer.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/account/accept-terms', { method: 'POST' })
      if (!res.ok) throw new Error('api error')
      // Nouveau compte → grand onboarding (la page renvoie vers /dashboard si déjà fait).
      router.push('/onboarding')
    } catch {
      toast.error('Une erreur est survenue. Veuillez réessayer.')
      setLoading(false)
    }
  }

  async function handleDecline() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image src={tenant.logoUrl} alt={tenant.appName} width={64} height={64} className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-bold">Bienvenue sur {tenant.appName}</CardTitle>
          <CardDescription>
            Votre compte Google a bien été créé. Avant de continuer, veuillez accepter nos conditions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="terms"
              checked={accepted}
              onCheckedChange={(v) => setAccepted(v === true)}
            />
            <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight cursor-pointer">
              J&apos;accepte les{' '}
              <Link href="/cgu" className="text-primary hover:underline" target="_blank">
                Conditions générales d&apos;utilisation
              </Link>{' '}
              et la{' '}
              <Link href="/privacy" className="text-primary hover:underline" target="_blank">
                Politique de confidentialité
              </Link>{' '}
              de {tenant.appName}.
            </label>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button className="w-full" onClick={handleAccept} disabled={loading || !accepted}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continuer vers {tenant.appName}
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleDecline} disabled={loading}>
            Refuser et se déconnecter
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
