'use client'

import Link from 'next/link'
import { useTranslation } from '@/i18n/context'

/**
 * Liens légaux en bas des écrans d'auth (CGU, Confidentialité, Mentions légales).
 */
export function AuthLegalFooter() {
  const { t } = useTranslation()
  return (
    <div className="mt-8 text-center text-xs text-muted-foreground">
      <Link href="/legal" className="hover:text-foreground transition-colors">
        {t('auth.legal_pages')}
      </Link>
    </div>
  )
}
