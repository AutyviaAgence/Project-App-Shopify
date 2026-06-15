'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Check, Store, ExternalLink } from 'lucide-react'

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://app.xeyo.io'

/** Normalise une saisie en domaine xxx.myshopify.com. */
function normalizeShopDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase()
  if (!s) return null
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!s.includes('.')) s = `${s}.myshopify.com`
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null
}

/**
 * Générateur de lien d'installation Shopify (admin). On saisit le domaine d'une
 * boutique → on obtient le lien à envoyer au marchand. Au clic, l'OAuth Shopify
 * démarre ; au retour, la boutique se lie automatiquement au compte connecté.
 */
export function InstallLinkGenerator() {
  const [shopInput, setShopInput] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function generate() {
    const domain = normalizeShopDomain(shopInput)
    if (!domain) {
      toast.error('Domaine invalide. Ex : maboutique.myshopify.com')
      return
    }
    setLink(`${APP_BASE}/api/shopify/install?shop=${encodeURIComponent(domain)}`)
    setCopied(false)
  }

  async function copyLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success('Lien copié')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Impossible de copier')
    }
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15">
          <Store className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <p className="font-medium">Lien d&apos;installation Shopify</p>
          <p className="text-sm text-muted-foreground">
            Générez un lien à envoyer à un marchand pour installer Xeyo sur sa boutique.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Domaine de la boutique</Label>
        <div className="flex gap-2">
          <Input
            value={shopInput}
            onChange={(e) => setShopInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') generate() }}
            placeholder="maboutique.myshopify.com"
          />
          <Button onClick={generate} className="shrink-0">Générer</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Accepte le nom seul (« maboutique »), l&apos;URL complète ou le domaine .myshopify.com.
        </p>
      </div>

      {link && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <Label className="text-xs">Lien à envoyer</Label>
          <div className="flex gap-2">
            <Input value={link} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" className="shrink-0" onClick={copyLink}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" className="shrink-0" asChild>
              <a href={link} target="_blank" rel="noopener noreferrer" title="Tester le lien">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Le marchand clique → autorise sur Shopify → sa boutique se lie à son compte Xeyo.
            (En mode privé : il doit être collaborateur de l&apos;app, ou utiliser une dev store.)
          </p>
        </div>
      )}
    </div>
  )
}
