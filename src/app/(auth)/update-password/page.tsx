'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'
import { CheckCircle } from 'lucide-react'

function UpdatePasswordForm() {
  const { t } = useTranslation()
  const tenant = useTenant()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (password.length < 6) {
      toast.error(t('auth.password_too_short'))
      return
    }

    if (password !== confirmPassword) {
      toast.error(t('auth.passwords_mismatch'))
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{t('auth.password_updated')}</CardTitle>
          <CardDescription className="mt-2">
            {t('auth.password_updated_desc')}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-4 pt-2">
          <Button className="w-full" onClick={() => router.push('/dashboard')}>
            {t('auth.go_to_dashboard')}
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Image src={tenant.logoUrl} alt={tenant.appName} width={64} height={64} className="h-16 w-16" />
        </div>
        <CardTitle className="text-2xl font-bold">{t('auth.new_password')}</CardTitle>
        <CardDescription>{t('auth.new_password_desc')}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.new_password_label')}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t('auth.min_chars')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('auth.confirm_password')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder={t('auth.confirm_password_placeholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 pt-2">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('auth.updating') : t('auth.update_password')}
          </Button>
          <Link href="/login" className="text-sm text-muted-foreground hover:underline">
            {t('auth.back_to_login')}
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function UpdatePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={<div className="animate-pulse">Loading...</div>}>
        <UpdatePasswordForm />
      </Suspense>
    </div>
  )
}
