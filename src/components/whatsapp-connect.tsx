'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Smartphone, Wifi, WifiOff, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Session = {
  id: string
  status: string
  phone_number: string | null
  display_name: string | null
  integration_type?: string | null
  waba_phone_number_id?: string | null
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
          <Button variant="ghost" size="icon" className="text-destructive shrink-0" disabled={deleting} onClick={handleDisconnect}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
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
