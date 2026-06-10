import Link from 'next/link'

/**
 * Liens légaux en bas des écrans d'auth (CGU, Confidentialité, Mentions légales).
 */
export function AuthLegalFooter() {
  return (
    <div className="mt-8 text-center text-xs text-muted-foreground">
      <Link href="/legal" className="hover:text-foreground transition-colors">
        Nos pages légales
      </Link>
    </div>
  )
}
