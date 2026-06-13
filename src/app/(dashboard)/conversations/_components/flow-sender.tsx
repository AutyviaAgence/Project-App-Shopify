'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import { FormInput, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WhatsAppFlow } from '@/types/database'

/** Envoi d'un formulaire (Flow) publié dans une conversation. */
export function FlowSender({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false)
  const [flows, setFlows] = useState<WhatsAppFlow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/flows')
      .then((r) => r.json())
      .then((j) => setFlows((j.data || []).filter((f: WhatsAppFlow) => f.status === 'published')))
      .catch(() => {})
  }, [open])

  async function send() {
    if (!selected) { toast.error('Sélectionnez un formulaire.'); return }
    setSending(true)
    try {
      const res = await fetch(`/api/conversations/${conversationId}/send-flow`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_id: selected }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      toast.success('Formulaire envoyé')
      setOpen(false); setSelected(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally { setSending(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Envoyer un formulaire" className="shrink-0">
          <FormInput className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Envoyer un formulaire</DialogTitle></DialogHeader>
        {flows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucun formulaire publié. Créez-en un dans la section « Formulaires » puis publiez-le.
          </p>
        ) : (
          <div className="space-y-1.5">
            {flows.map((f) => (
              <button key={f.id} type="button" onClick={() => setSelected(f.id)}
                className={cn('w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  selected === f.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
                <span className="font-medium">{f.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{(f.screens || []).length} écran(s)</span>
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button onClick={send} disabled={sending || !selected}>
            {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FormInput className="mr-1 h-4 w-4" />}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
