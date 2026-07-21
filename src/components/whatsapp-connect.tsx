'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
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
import { Loader2, Smartphone, Wifi, WifiOff, Plus, Trash2, Link2, Copy, UserCog } from 'lucide-react'
import { cn } from '@/lib/utils'
import { track } from '@/lib/posthog/events'
import { WhatsAppProfileDialog } from '@/components/whatsapp-profile-dialog'
import { WhatsAppEmbeddedSignup, embeddedSignupAvailable } from '@/components/whatsapp-embedded-signup'
import { useSubscription } from '@/hooks/use-subscription'
import { useTranslation } from '@/i18n/context'

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
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<{ quality: string | null; tierLabel: string | null; used?: number; limit?: number | null; marketingPaused?: boolean; nameDeclined?: boolean } | null>(null)
  const [showForm, setShowForm] = useState(false)
  // La saisie manuelle des 3 identifiants Meta n'est proposée qu'aux ADMINS :
  // Meta interdit l'Embedded Signup sur le portefeuille business qui possède
  // l'app, donc l'équipe Xeyo doit pouvoir relier son propre numéro à la main.
  // Les marchands, eux, passent toujours par la popup Facebook.
  const { subscription } = useSubscription()
  const isAdmin = subscription?.role === 'admin'
  const manualAllowed = !embeddedSignupAvailable || isAdmin
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Form WABA
  const [phoneId, setPhoneId] = useState('')
  const [businessId, setBusinessId] = useState('')
  const [token, setToken] = useState('')

  // Modale "Lien WhatsApp"
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkLoading, setLinkLoading] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
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
      if (!linkRes.ok) throw new Error(linkJson.error || t('components.whatsapp_toast_err'))
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
      toast.error(e instanceof Error ? e.message : t('components.whatsapp_toast_err'))
      setLinkOpen(false)
    } finally {
      setLinkLoading(false)
    }
  }

  async function copyLink() {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      toast.success(t('components.whatsapp_toast_link_copied'))
    } catch {
      toast.error(t('components.whatsapp_toast_copy_failed'))
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
          ai_agent_id: agentId || null,
          is_active: isActive,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('components.whatsapp_toast_err'))
      setLink(json.data)
      toast.success(t('components.whatsapp_toast_link_updated'))
      setLinkOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('components.whatsapp_toast_err'))
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

  // Santé du numéro (qualité Meta + palier d'envoi) — clé pour l'e-commerce à
  // fort volume de templates : voir venir les restrictions avant le ban.
  useEffect(() => {
    if (session?.status !== 'connected') return
    fetch('/api/whatsapp/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json?.data?.connected) setHealth(json.data) })
      .catch(() => {})
  }, [session?.status])

  async function handleConnect() {
    if (!phoneId.trim() || !businessId.trim() || !token.trim()) {
      toast.error(t('components.whatsapp_toast_fields_required'))
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
      if (!res.ok) throw new Error(json.error || t('components.whatsapp_toast_err'))
      setPhoneId(''); setBusinessId(''); setToken('')
      setShowForm(false)
      await fetchSession()
      const n = json.imported_templates || 0
      track('whatsapp_connected', { imported_templates: n })
      toast.success(n > 0
        ? t('components.whatsapp_toast_imported', { count: n, plural: n > 1 ? 's' : '' })
        : t('components.whatsapp_toast_connected'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('components.whatsapp_toast_err'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    if (!session) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/sessions/${session.id}/disconnect`, { method: 'DELETE' })
      if (!res.ok) throw new Error(t('components.whatsapp_toast_err'))
      await fetchSession()
      toast.success(t('components.whatsapp_toast_disconnected'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('components.whatsapp_toast_err'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('components.loading')}
      </div>
    )
  }

  // Connecté
  if (session) {
    const connected = session.status === 'connected'
    return (
      <div className="rounded-xl border p-4 sm:p-5">
        {/* Mobile : en-tête puis actions dessous. Desktop : côte à côte.
            Les 3 boutons en shrink-0 débordaient de l'écran en dessous de ~500px. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5">
              {/* Logo agrandi (scale) : il a beaucoup de marge transparente, il
                  paraissait petit dans le cercle. Le cercle, lui, ne change pas. */}
              <Image src="/brand/whatsapp-logo.webp" alt="WhatsApp" width={40} height={40} className="h-10 w-10 scale-125" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{t('components.whatsapp_business')}</span>
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-600">
                    <Wifi className="h-3 w-3" /> {t('components.whatsapp_connected')}
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
              {health && (health.quality || health.tierLabel) && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {health.quality && health.quality !== 'UNKNOWN' && (
                    <span className={
                      'inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ' +
                      (health.quality === 'GREEN' ? 'bg-emerald-500/15 text-emerald-600'
                        : health.quality === 'YELLOW' ? 'bg-amber-500/15 text-amber-600'
                        : 'bg-red-500/15 text-red-600')
                    }
                      title={t('components.whatsapp_quality_title')}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {t('components.whatsapp_quality_prefix')} {health.quality === 'GREEN' ? t('components.whatsapp_quality_good') : health.quality === 'YELLOW' ? t('components.whatsapp_quality_medium') : t('components.whatsapp_quality_critical')}
                    </span>
                  )}
                  {typeof health.used === 'number' && (
                    // Compteur honnête : volume d'envois INITIÉS sur 24h glissantes.
                    // Meta ne renvoie pas de plafond fiable par API → on n'affiche
                    // que le consommé (avec /plafond seulement s'il est connu).
                    <span className={
                      'inline-flex cursor-help items-center rounded-full px-2 py-0.5 text-[11px] ' +
                      (health.limit && health.used / health.limit >= 0.9
                        ? 'bg-amber-500/15 text-amber-600'
                        : 'bg-muted text-muted-foreground')
                    }
                      title={t('components.whatsapp_sends_title')}>
                      {t('components.whatsapp_sends_initiated')} {health.used}{health.limit ? `/${health.limit}` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 sm:shrink-0">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setProfileOpen(true)}>
              <UserCog className="mr-1 h-4 w-4" /> {t('components.whatsapp_profile')}
            </Button>
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={openLinkModal}>
              <Link2 className="mr-1 h-4 w-4" /> {t('components.whatsapp_link')}
            </Button>
            <Button variant="ghost" size="icon" className="text-destructive" disabled={deleting} onClick={handleDisconnect}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Marketing suspendu automatiquement (qualité ROUGE) */}
        {health?.marketingPaused && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-600">
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-medium">{t('components.whatsapp_marketing_paused_strong')}</span> {t('components.whatsapp_marketing_paused_desc')}
            </span>
          </div>
        )}

        <WhatsAppProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />

        <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('components.whatsapp_link_title')}</DialogTitle>
              <DialogDescription>
                {t('components.whatsapp_link_desc')}
              </DialogDescription>
            </DialogHeader>

            {linkLoading || !link ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('components.loading')}
              </div>
            ) : (
              <div className="space-y-4">
                {/* URL + copier */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('components.whatsapp_your_link')}</Label>
                  <div className="flex gap-2">
                    <Input value={publicUrl} readOnly className="text-xs" />
                    <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={copyLink}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Message d'accueil */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('components.whatsapp_welcome_message')}</Label>
                  <textarea
                    value={welcomeMsg}
                    onChange={(e) => setWelcomeMsg(e.target.value)}
                    rows={3}
                    placeholder={t('components.whatsapp_welcome_placeholder')}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                {/* Identifiant du lien (fixe, basé sur la boutique) */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('components.whatsapp_link_id')}</Label>
                  <Input value={slugValue} readOnly disabled className="opacity-70" />
                  <p className="text-[11px] text-muted-foreground">{t('components.whatsapp_link_id_hint')}</p>
                </div>

                {/* Agent IA */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('components.whatsapp_ai_agent')}</Label>
                  <select
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">{t('components.whatsapp_agent_none')}</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Actif / Inactif */}
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">{isActive ? t('components.whatsapp_active') : t('components.whatsapp_inactive')}</p>
                    <p className="text-xs text-muted-foreground">
                      {isActive ? t('components.whatsapp_link_active_desc') : t('components.whatsapp_link_inactive_desc')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIsActive((v) => !v)}
                  >
                    {isActive ? t('components.whatsapp_deactivate') : t('components.whatsapp_activate')}
                  </Button>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setLinkOpen(false)} disabled={savingLink}>
                    {t('components.whatsapp_cancel')}
                  </Button>
                  <Button onClick={handleSaveLink} disabled={savingLink}>
                    {savingLink ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    {t('components.whatsapp_save')}
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
  //
  // `h-full` : la carte remplit sa cellule de grille (les deux cartes de
  // connexion partagent la même hauteur, alignées sur la plus grande). `flex-col`
  // + `mt-auto` sur le bloc d'action pousse le bouton en bas, pour que les deux
  // boutons soient à la même ligne même si un texte au-dessus est plus long.
  return (
    <div className="flex h-full flex-col rounded-xl border p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5">
          <Image src="/brand/whatsapp-logo.webp" alt="WhatsApp" width={40} height={40} className="h-10 w-10 scale-125" />
        </div>
        <div>
          <p className="font-medium">{t('components.whatsapp_connect_title')}</p>
          <p className="text-sm text-muted-foreground">{t('components.whatsapp_connect_desc')}</p>
        </div>
      </div>

      {/* Chemin principal : popup Meta (aucun identifiant à copier).
          `mt-auto` colle ce bloc au bas de la carte → bouton aligné avec celui
          de la carte Shopify. */}
      {embeddedSignupAvailable && !showForm && (
        <div className="mt-auto space-y-2">
          <WhatsAppEmbeddedSignup onConnected={fetchSession} />
          <p className="text-[11px] text-muted-foreground">
            {t('components.whatsapp_embedded_hint')}
          </p>
        </div>
      )}

      {/* Repli ADMIN uniquement : saisie manuelle des 3 identifiants Meta. */}
      {!showForm ? (
        manualAllowed && (
          embeddedSignupAvailable ? (
            <button onClick={() => setShowForm(true)} className="text-xs text-muted-foreground underline hover:text-foreground">
              {t('components.whatsapp_manual_admin')} <span className="opacity-60">{t('components.whatsapp_manual_admin_tag')}</span>
            </button>
          ) : (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-1 h-4 w-4" /> {t('components.whatsapp_connect_btn')}
            </Button>
          )
        )
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
            <Label className="text-xs">{t('components.whatsapp_access_token')}</Label>
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAh..." />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleConnect} disabled={saving} className={cn(saving && 'opacity-50')}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {t('components.whatsapp_connect_action')}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>{t('components.whatsapp_cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
