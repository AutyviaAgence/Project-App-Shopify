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
import { useTranslation } from '@/i18n/context'

export default function RegisterCompletePage() {
  const { t } = useTranslation()
  const tenant = useTenant()
  const router = useRouter()
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleAccept() {
    if (!accepted) {
      toast.error(t('register_complete.must_accept'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/account/accept-terms', { method: 'POST' })
      if (!res.ok) throw new Error('api error')
      // Nouveau compte : on FORCE l'animation de bienvenue à l'arrivée sur
      // l'onboarding (c'est le vrai « premier passage »). On efface l'ancien
      // flag « déjà vue » au cas où l'utilisateur aurait déjà mis les pieds sur
      // /onboarding avant d'accepter les CGU.
      try {
        localStorage.removeItem('xeyo_welcome_seen')
        localStorage.setItem('xeyo_show_welcome', '1')
      } catch { /* localStorage indisponible : l'onboarding retombera sur sa règle par défaut */ }
      // Nouveau compte → grand onboarding (la page renvoie vers /dashboard si déjà fait).
      router.push('/onboarding')
    } catch {
      toast.error(t('register_complete.error'))
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
          <CardTitle className="text-2xl font-bold">{t('register_complete.title', { app: tenant.appName })}</CardTitle>
          <CardDescription>
            {t('register_complete.subtitle')}
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
              {t('register_complete.accept_prefix')}{' '}
              <Link href="/cgu" className="text-primary hover:underline" target="_blank">
                {t('register_complete.terms_link')}
              </Link>{' '}
              {t('register_complete.and_the')}{' '}
              <Link href="/privacy" className="text-primary hover:underline" target="_blank">
                {t('register_complete.privacy_link')}
              </Link>{' '}
              {t('register_complete.of_app', { app: tenant.appName })}
            </label>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button className="w-full" onClick={handleAccept} disabled={loading || !accepted}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('register_complete.continue', { app: tenant.appName })}
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleDecline} disabled={loading}>
            {t('register_complete.decline')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
