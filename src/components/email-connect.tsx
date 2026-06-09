'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Mail, Plus, Trash2 } from 'lucide-react'

type EmailSession = {
  id: string
  email_address: string | null
  display_name: string | null
  provider: string | null
  status?: string | null
}

/**
 * Connexion Email compacte (1 boîte par compte).
 * Gmail en 1 clic (OAuth) ou SMTP (avancé). Affiché sur le Dashboard.
 */
export function EmailConnect() {
  const [session, setSession] = useState<EmailSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<null | 'choose' | 'smtp'>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Form SMTP
  const [form, setForm] = useState({
    name: '', email_address: '', smtp_host: '', smtp_port: '587',
    smtp_user: '', smtp_password: '', imap_host: '', imap_port: '993',
  })

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/email-sessions')
      const json = await res.json()
      if (res.ok && json.data) setSession(json.data[0] || null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSession() }, [fetchSession])

  async function connectGmail() {
    setBusy(true)
    try {
      const res = await fetch('/api/oauth/gmail-session/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_name: 'Email', display_name: undefined }),
      })
      const json = await res.json()
      if (res.ok && json.url) {
        window.location.href = json.url
      } else {
        toast.error(json.error || 'Erreur OAuth Gmail')
        setBusy(false)
      }
    } catch {
      toast.error('Erreur réseau')
      setBusy(false)
    }
  }

  async function connectSmtp() {
    if (!form.email_address.trim() || !form.smtp_host.trim() || !form.smtp_user.trim() || !form.smtp_password.trim()) {
      toast.error('Renseignez l\'adresse et les informations SMTP')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/email-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || form.email_address,
          email_address: form.email_address,
          provider: 'smtp',
          smtp_host: form.smtp_host,
          smtp_port: parseInt(form.smtp_port) || 587,
          smtp_user: form.smtp_user,
          smtp_password: form.smtp_password,
          imap_host: form.imap_host || undefined,
          imap_port: form.imap_port ? parseInt(form.imap_port) : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setMode(null)
      await fetchSession()
      toast.success('Email connecté')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!session) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/email-sessions/${session.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      await fetchSession()
      toast.success('Email déconnecté')
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
    return (
      <div className="rounded-xl border p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/15">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">Email</span>
                <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-600">Connecté</span>
              </div>
              <p className="text-sm text-muted-foreground truncate">{session.email_address}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="text-destructive shrink-0" disabled={deleting} onClick={disconnect}>
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
          <Mail className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Connectez votre Email (optionnel)</p>
          <p className="text-sm text-muted-foreground">Gérez vos emails dans le même inbox que WhatsApp.</p>
        </div>
      </div>

      {mode === null && (
        <Button variant="outline" onClick={() => setMode('choose')}>
          <Plus className="mr-1 h-4 w-4" /> Connecter un email
        </Button>
      )}

      {mode === 'choose' && (
        <div className="space-y-2 border-t pt-4">
          <Button onClick={connectGmail} disabled={busy} className="w-full justify-start">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Connecter Gmail (recommandé)
          </Button>
          <Button variant="outline" onClick={() => setMode('smtp')} className="w-full justify-start">
            Configurer un autre email (SMTP)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode(null)}>Annuler</Button>
        </div>
      )}

      {mode === 'smtp' && (
        <div className="space-y-3 border-t pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Adresse email</Label>
              <Input value={form.email_address} onChange={(e) => setForm({ ...form, email_address: e.target.value })} placeholder="contact@maboutique.fr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Serveur SMTP</Label>
              <Input value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} placeholder="smtp.exemple.fr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Port</Label>
              <Input value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: e.target.value })} placeholder="587" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Utilisateur</Label>
              <Input value={form.smtp_user} onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mot de passe</Label>
              <Input type="password" value={form.smtp_password} onChange={(e) => setForm({ ...form, smtp_password: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={connectSmtp} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Connecter
            </Button>
            <Button variant="outline" onClick={() => setMode('choose')} disabled={busy}>Retour</Button>
          </div>
        </div>
      )}
    </div>
  )
}
