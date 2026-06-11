'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Loader2, Smartphone, Wifi, WifiOff, Plus, Trash2, Link2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

type Session = {
  id: string
  status: string
  phone_number: string | null
  display_name: string | null
  integration_type?: string | null
  waba_phone_number_id?: string | null
}

type WALink = {
  id: string
  slug: string | null
  pre_filled_message: string | null
  ai_agent_id: string | null
  is_active: boolean
}

type AgentOption = {
  id: string
  name: string
}

/**
 * Connexion WhatsApp compacte (1 session WABA par compte).
 * Remplace la page Sessions : affiché sur le Dashboard.
 */
export function WhatsAppConnect() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Form WABA
  const [phoneId, setPhoneId] = useState('')
  const [businessId, setBusinessId] = useState('')
  const [token, setToken] = useState('')

  // Modale "Lien WhatsApp"
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkLoading, setLinkLoading] = useState(false)
  const [link, setLink] = useState<WALink | null>(null)
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [welcomeMsg, setWelcomeMsg] = useState('')
  const [slugValue, setSlugValue] = useState('')
  const [agentId, setAgentId] = useState<string>('')
  const [isActive, setIsActive] = useState(true)
  const [savingLink, setSavingLink] = useState(false)

  const publicUrl = slugValue
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/wa/${slugValue}`
    : ''

  async function openLinkModal() {
    if (!session) return
    setLinkOpen(true)
    setLinkLoading(true)
    try {
      const [linkRes, agentsRes] = await Promise.all([
        fetch(`/api/sessions/${session.id}/link`),
        fetch('/api/agents'),
      ])
      const linkJson = await linkRes.json()
      if (!linkRes.ok) throw new Error(linkJson.error || 'Erreur')
      const l: WALink = linkJson.data
      setLink(l)
      setWelcomeMsg(l.pre_filled_message || '')
      setSlugValue(l.slug || '')
      setAgentId(l.ai_agent_id || '')
      setIsActive(l.is_active)

      const agentsJson = await agentsRes.json()
      if (agentsRes.ok && Array.isArray(agentsJson.data)) {
        setAgents(agentsJson.data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
      setLinkOpen(false)
    } finally {
      setLinkLoading(false)
    }
  }

  async function copyLink() {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      toast.success('Lien copié')
    } catch {
      toast.error('Impossible de copier le lien')
    }
  }

  async function handleSaveLink() {
    if (!link) return
    setSavingLink(true)
    try {
      const res = await fetch(`/api/links/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_filled_message: welcomeMsg,
          slug: slugValue,
          ai_agent_id: agentId || null,
          is_active: isActive,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setLink(json.data)
      toast.success('Lien mis à jour')
      setLinkOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSavingLink(false)
    }
  }

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      const json = await res.json()
      if (res.ok && json.data) {
        setSession(json.data[0] || null) // 1 session max
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSession() }, [fetchSession])

  async function handleConnect() {
    if (!phoneId.trim() || !businessId.trim() || !token.trim()) {
      toast.error('Tous les champs WhatsApp Business sont requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integration_type: 'waba',
          waba_phone_number_id: phoneId.trim(),
          waba_business_account_id: businessId.trim(),
          waba_access_token: token.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setPhoneId(''); setBusinessId(''); setToken('')
      setShowForm(false)
      await fetchSession()
      toast.success('WhatsApp connecté')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    if (!session) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/sessions/${session.id}/disconnect`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      await fetchSession()
      toast.success('WhatsApp déconnecté')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    )
  }

  // Connecté
  if (session) {
    const connected = session.status === 'connected'
    return (
      <div className="rounded-xl border p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15">
              <Smartphone className="h-5 w-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">WhatsApp Business</span>
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-600">
                    <Wifi className="h-3 w-3" /> Connecté
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600">
                    <WifiOff className="h-3 w-3" /> {session.status}
                  </span>
                )}
              </div>
              {session.phone_number && (
                <p className="text-sm text-muted-foreground truncate">+{session.phone_number}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" onClick={openLinkModal}>
              <Link2 className="mr-1 h-4 w-4" /> Lien
            </Button>
            <Button variant="ghost" size="icon" className="text-destructive" disabled={deleting} onClick={handleDisconnect}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Lien WhatsApp</DialogTitle>
              <DialogDescription>
                Partagez ce lien pour que vos clients démarrent une conversation WhatsApp en un clic.
              </DialogDescription>
            </DialogHeader>

            {linkLoading || !link ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : (
              <div className="space-y-4">
                {/* URL + copier */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Votre lien</Label>
                  <div className="flex gap-2">
                    <Input value={publicUrl} readOnly className="text-xs" />
                    <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={copyLink}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Message d'accueil */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Message d&apos;accueil</Label>
                  <textarea
                    value={welcomeMsg}
                    onChange={(e) => setWelcomeMsg(e.target.value)}
                    rows={3}
                    placeholder="Bonjour, je viens de votre boutique !"
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                {/* Slug personnalisé */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Slug personnalisé</Label>
                  <Input
                    value={slugValue}
                    onChange={(e) => setSlugValue(e.target.value)}
                    placeholder="ma-boutique"
                  />
                </div>

                {/* Agent IA */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Agent IA</Label>
                  <select
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Aucun</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Actif / Inactif */}
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">{isActive ? 'Actif' : 'Inactif'}</p>
                    <p className="text-xs text-muted-foreground">
                      {isActive ? 'Le lien redirige vers WhatsApp.' : 'Le lien est désactivé.'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIsActive((v) => !v)}
                  >
                    {isActive ? 'Désactiver' : 'Activer'}
                  </Button>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setLinkOpen(false)} disabled={savingLink}>
                    Annuler
                  </Button>
                  <Button onClick={handleSaveLink} disabled={savingLink}>
                    {savingLink ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    Enregistrer
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Pas connecté
  return (
    <div className="rounded-xl border p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Smartphone className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Connectez votre WhatsApp Business</p>
          <p className="text-sm text-muted-foreground">Reliez votre numéro pour que l&apos;agent IA réponde à vos clients.</p>
        </div>
      </div>

      {!showForm ? (
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-1 h-4 w-4" /> Connecter WhatsApp
        </Button>
      ) : (
        <div className="space-y-3 border-t pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Phone Number ID</Label>
            <Input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="806014969271207" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Business Account ID</Label>
            <Input value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder="838878661876293" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Access Token (Meta)</Label>
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAh..." />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleConnect} disabled={saving} className={cn(saving && 'opacity-50')}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Connecter
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Annuler</Button>
          </div>
        </div>
      )}
    </div>
  )
}
