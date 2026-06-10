import Link from 'next/link'

/**
 * Liens légaux en bas des écrans d'auth (CGU, Confidentialité, Mentions légales).
 */
export function AuthLegalFooter() {
  return (
    <div className="mt-8 flex items-center gap-4 text-xs text-muted-foreground">
      <Link href="/cgu" className="hover:text-foreground transition-colors">CGU</Link>
      <span className="text-muted-foreground/40">•</span>
      <Link href="/privacy" className="hover:text-foreground transition-colors">Confidentialité</Link>
      <span className="text-muted-foreground/40">•</span>
      <Link href="/legal" className="hover:text-foreground transition-colors">Mentions légales</Link>
    </div>
  )
}
