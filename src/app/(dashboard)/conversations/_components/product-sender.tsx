'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import { ShoppingBag, Loader2, Plus, Trash2 } from 'lucide-react'

/**
 * Envoi d'un message PRODUIT (catalogue Meta) dans une conversation.
 * 1 produit → fiche unique ; plusieurs → multi-product message.
 *
 * On saisit les `product_retailer_id` (identifiants des produits dans le
 * catalogue Meta — généralement le SKU ou l'ID variante Shopify synchronisé).
 * Nécessite un catalogue Meta configuré sur la session (réglages).
 */
export function ProductSender({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false)
  const [ids, setIds] = useState<string[]>([''])
  const [bodyText, setBodyText] = useState('Voici une sélection qui pourrait vous plaire 👇')
  const [headerText, setHeaderText] = useState('Nos produits')
  const [sending, setSending] = useState(false)
  // Configuration du catalogue Meta (sur la session WhatsApp).
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [catalogId, setCatalogId] = useState('')
  const [savingCatalog, setSavingCatalog] = useState(false)

  // À l'ouverture, on charge la session connectée pour connaître le catalogue.
  useEffect(() => {
    if (!open) return
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((j) => {
        const s = (j.data || []).find((x: { waba_phone_number_id?: string }) => x.waba_phone_number_id) || (j.data || [])[0]
        if (s) { setSessionId(s.id); setCatalogId(s.waba_catalog_id || '') }
      })
      .catch(() => {})
  }, [open])

  async function saveCatalog() {
    if (!sessionId) return
    setSavingCatalog(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waba_catalog_id: catalogId.trim() || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      toast.success('Catalogue enregistré')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSavingCatalog(false)
    }
  }

  function setId(i: number, v: string) { setIds((arr) => arr.map((x, idx) => (idx === i ? v : x))) }
  function addId() { setIds((arr) => [...arr, '']) }
  function removeId(i: number) { setIds((arr) => arr.filter((_, idx) => idx !== i)) }

  async function send() {
    const productIds = ids.map((s) => s.trim()).filter(Boolean)
    if (productIds.length === 0) { toast.error('Ajoutez au moins un identifiant produit.'); return }
    setSending(true)
    try {
      const res = await fetch(`/api/conversations/${conversationId}/send-products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_retailer_ids: productIds, body_text: bodyText, header_text: headerText }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      toast.success(productIds.length === 1 ? 'Produit envoyé' : `${productIds.length} produits envoyés`)
      setOpen(false)
      setIds(['']);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Envoyer des produits (catalogue)" className="shrink-0">
          <ShoppingBag className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer des produits</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Catalogue Meta requis */}
          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5">
            <Label className="text-xs">Catalogue Meta (Commerce Manager)</Label>
            <div className="flex items-center gap-2">
              <Input value={catalogId} onChange={(e) => setCatalogId(e.target.value)} placeholder="ID du catalogue" className="h-8" />
              <Button type="button" size="sm" variant="outline" onClick={saveCatalog} disabled={savingCatalog || !sessionId}>
                {savingCatalog ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Requis une seule fois. Trouvez l&apos;ID dans Meta Commerce Manager → Catalogue.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Titre (si plusieurs produits)</Label>
            <Input value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Nos produits" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label>Message d&apos;accompagnement</Label>
            <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={2} maxLength={1024} />
          </div>
          <div className="space-y-1.5">
            <Label>Identifiants produits (catalogue Meta)</Label>
            {ids.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={v} onChange={(e) => setId(i, e.target.value)} placeholder="ex : SKU-1024 ou ID variante" className="h-9" />
                {ids.length > 1 && (
                  <button type="button" onClick={() => removeId(i)} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            ))}
            {ids.length < 30 && (
              <button type="button" onClick={addId} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus className="h-3 w-3" /> Ajouter un produit
              </button>
            )}
            <p className="text-[11px] text-muted-foreground">
              Le <code>product_retailer_id</code> est l&apos;identifiant du produit dans votre catalogue Meta (souvent le SKU ou l&apos;ID variante Shopify).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={send} disabled={sending}>
            {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShoppingBag className="mr-1 h-4 w-4" />}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
