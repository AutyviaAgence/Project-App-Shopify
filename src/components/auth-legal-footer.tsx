import Link from 'next/link'

/**
 * Liens légaux en bas des écrans d'auth (CGU, Confidentialité, Mentions légales).
 */
export function AuthLegalFooter() {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <Link href="/privacy" className="hover:text-foreground transition-colors">Confidentialité</Link>
      <span className="text-muted-foreground/40">•</span>
      <Link href="/terms" className="hover:text-foreground transition-colors">Conditions de service</Link>
      <span className="text-muted-foreground/40">•</span>
      <Link href="/data-deletion" className="hover:text-foreground transition-colors">Suppression des données</Link>
      <span className="text-muted-foreground/40">•</span>
      <Link href="/legal" className="hover:text-foreground transition-colors">Mentions légales</Link>
    </div>
  )
}
