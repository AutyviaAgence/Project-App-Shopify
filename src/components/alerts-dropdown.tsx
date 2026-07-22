'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, Trash2, AlertTriangle, WifiOff, AlertCircle, Info, Zap, Bot, BotOff, UserX, ExternalLink, CalendarCheck, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/context'
import type { UserAlert } from '@/types/database'

const ALERT_ICONS: Record<string, typeof AlertTriangle> = {
  session_disconnected: WifiOff,
  quota_reached: Zap,
  ai_error: AlertCircle,
  webhook_error: AlertTriangle,
  info: Info,
  campaign_opt_out: UserX,
  agent_started: Bot,
  agent_stopped: BotOff,
  booking_click: CalendarCheck,
}

const ALERT_COLORS: Record<string, string> = {
  session_disconnected: 'text-orange-500',
  quota_reached: 'text-yellow-500',
  ai_error: 'text-red-500',
  webhook_error: 'text-red-500',
  info: 'text-blue-500',
  campaign_opt_out: 'text-sky-500',
  agent_started: 'text-green-500',
  agent_stopped: 'text-orange-500',
  booking_click: 'text-emerald-500',
}

/**
 * Traduction au rendu.
 *
 * Les titres/messages stockés en base sont écrits en français au moment de
 * l'événement : le serveur ignore la langue du marchand. On les re-rend donc
 * ici depuis `alert_type` (clé stable) + `metadata` (les valeurs dynamiques).
 * Toute alerte dont le type n'est pas couvert — ou dont un paramètre manque —
 * retombe sur le texte stocké, jamais sur un « {n} » brut à l'écran.
 */
type AlertText = { titleKey: string; messageKey: string; params: Record<string, string | number> }

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function resolveAlertText(alert: UserAlert): AlertText | null {
  const m = (alert.metadata || {}) as Record<string, unknown>

  // L'union de `UserAlert` est en retard sur les types réellement insérés
  // (contact_opted_in/out, human_handoff, fair_use_reached,
  // whatsapp_template_paused) : on compare sur la chaîne brute.
  switch (alert.alert_type as string) {
    case 'agent_stopped': {
      const name = str(m.agent_name)
      const condition = str(m.stop_condition)
      if (!name || !condition) return null
      return { titleKey: 'alerts.agent_stopped.title', messageKey: 'alerts.agent_stopped.message', params: { name, condition } }
    }
    case 'ai_credits_low': {
      const used = num(m.used)
      const limit = num(m.limit)
      if (used === undefined || limit === undefined) return null
      return {
        titleKey: 'alerts.ai_credits_low.title',
        messageKey: 'alerts.ai_credits_low.message',
        params: { used, limit, remaining: Math.max(0, limit - used) },
      }
    }
    case 'booking_click': {
      const contact = str(m.contact_name)
      const agent = str(m.agent_name)
      if (!contact || !agent) return null
      const phone = str(m.contact_phone)
      return phone
        ? { titleKey: 'alerts.booking_click.title', messageKey: 'alerts.booking_click.message_phone', params: { contact, agent, phone } }
        : { titleKey: 'alerts.booking_click.title', messageKey: 'alerts.booking_click.message', params: { contact, agent } }
    }
    case 'contact_opted_in':
      return { titleKey: 'alerts.contact_opted_in.title', messageKey: 'alerts.contact_opted_in.message', params: {} }
    case 'contact_opted_out': {
      const reason = str(m.reason)
      return reason
        ? { titleKey: 'alerts.contact_opted_out.title', messageKey: 'alerts.contact_opted_out.message_reason', params: { reason } }
        : { titleKey: 'alerts.contact_opted_out.title', messageKey: 'alerts.contact_opted_out.message', params: {} }
    }
    case 'conversation_long': {
      // Deux variantes : plafond atteint (assistant en pause) ou simple soft cap.
      const cap = num(m.cap)
      if (m.variant === 'paused' && cap !== undefined) {
        return { titleKey: 'alerts.conversation_long.paused_title', messageKey: 'alerts.conversation_long.paused_message', params: { cap } }
      }
      const n = num(m.ai_messages)
      if (n === undefined) return null
      return { titleKey: 'alerts.conversation_long.title', messageKey: 'alerts.conversation_long.message', params: { n } }
    }
    case 'fair_use_reached': {
      const cap = num(m.cap)
      const used = num(m.used)
      if (cap === undefined || used === undefined) return null
      return { titleKey: 'alerts.fair_use_reached.title', messageKey: 'alerts.fair_use_reached.message', params: { cap, used } }
    }
    case 'human_handoff': {
      const reason = str(m.reason)
      return reason
        ? { titleKey: 'alerts.human_handoff.title', messageKey: 'alerts.human_handoff.message_reason', params: { reason } }
        : { titleKey: 'alerts.human_handoff.title', messageKey: 'alerts.human_handoff.message', params: {} }
    }
    case 'quota_reached': {
      const limit = num(m.limit)
      const plan = str(m.plan)
      if (limit === undefined || !plan) return null
      return { titleKey: 'alerts.quota_reached.title', messageKey: 'alerts.quota_reached.message', params: { limit, plan } }
    }
    case 'session_disconnected': {
      const name = str(m.instance_name)
      if (!name) return null
      return { titleKey: 'alerts.session_disconnected.title', messageKey: 'alerts.session_disconnected.message', params: { name } }
    }
    case 'token_limit_reached': {
      const used = num(m.tokens_used)
      const limit = num(m.tokens_limit)
      const percent = num(m.usage_percent)
      if (limit === undefined) return null
      // Les anciennes lignes n'ont pas de `variant` : le pourcentage suffit.
      const variant = str(m.variant) || (percent !== undefined && percent >= 100 ? 'reached' : percent !== undefined && percent >= 90 ? 'warn_90' : 'warn_80')
      if (variant === 'reached') {
        return {
          titleKey: 'alerts.token_limit_reached.reached_title',
          messageKey: 'alerts.token_limit_reached.reached_message',
          params: { limit: limit.toLocaleString() },
        }
      }
      if (used === undefined || percent === undefined) return null
      return {
        titleKey: `alerts.token_limit_reached.${variant}_title`,
        messageKey: `alerts.token_limit_reached.${variant}_message`,
        params: { percent, used: used.toLocaleString(), limit: limit.toLocaleString() },
      }
    }
    case 'whatsapp_template_paused': {
      const name = str(m.template)
      if (!name) return null
      const disabled = m.status === 'disabled'
      const reason = str(m.reason)
      const prefix = disabled ? 'disabled_' : ''
      return {
        titleKey: `alerts.whatsapp_template_paused.${disabled ? 'disabled_title' : 'title'}`,
        messageKey: `alerts.whatsapp_template_paused.${prefix}${reason ? 'message_reason' : 'message'}`,
        params: reason ? { name, reason } : { name },
      }
    }
    // `info` couvre des événements hétérogènes (activation, achat, parrainage,
    // escalation) qui partagent le même type : on garde le texte stocké.
    default:
      return null
  }
}

export function AlertsDropdown() {
  const { t } = useTranslation()
  const router = useRouter()
  const [alerts, setAlerts] = useState<UserAlert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts?limit=10')
      if (!res.ok) return
      const data = await res.json()
      setAlerts(data.data || [])
      setUnreadCount(data.unread_count || 0)
    } catch {
      // Silently fail
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
    // Poll every 30 seconds
    const interval = setInterval(fetchAlerts, 30000)
    return () => clearInterval(interval)
  }, [fetchAlerts])

  const handleMarkAsRead = async (alertId: string) => {
    try {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_ids: [alertId] }),
      })
      if (!res.ok) throw new Error()
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      toast.error(t('alerts.mark_read_error'))
    }
  }

  const handleMarkAllRead = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      })
      if (!res.ok) throw new Error()
      setAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
      setUnreadCount(0)
      toast.success('Toutes les alertes marquées comme lues')
    } catch {
      toast.error(t('alerts.mark_read_error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (alertId: string) => {
    try {
      const res = await fetch(`/api/alerts?id=${alertId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      const wasUnread = alerts.find(a => a.id === alertId)?.is_read === false
      setAlerts(prev => prev.filter(a => a.id !== alertId))
      if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'À l\'instant'
    if (diffMins < 60) return `Il y a ${diffMins}min`
    if (diffHours < 24) return `Il y a ${diffHours}h`
    if (diffDays < 7) return `Il y a ${diffDays}j`
    return date.toLocaleDateString('fr-FR')
  }

  const handleViewConversation = (alert: UserAlert) => {
    const conversationId = (alert.metadata as Record<string, unknown>)?.conversation_id as string | undefined
    if (conversationId) {
      setIsOpen(false)
      // Marquer comme lu si non lu
      if (!alert.is_read) {
        handleMarkAsRead(alert.id)
      }
      router.push(`/conversations?open=${conversationId}`)
    }
  }

  const hasConversationLink = (alert: UserAlert) => {
    return !!(alert.metadata as Record<string, unknown>)?.conversation_id
  }

  // « Continuer avec l'IA » : réactive l'assistant sur la conversation mise en
  // pause (plafond de messages atteint). Répond à la demande « OUI/NON » du
  // marchand DEPUIS la notif, sans avoir à ouvrir la conversation.
  const [resuming, setResuming] = useState<string | null>(null)
  const handleResumeAI = async (alert: UserAlert) => {
    const conversationId = (alert.metadata as Record<string, unknown>)?.conversation_id as string | undefined
    if (!conversationId) return
    setResuming(alert.id)
    try {
      const res = await fetch(`/api/conversations/${conversationId}/agent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_ai_active: true }),
      })
      if (res.ok) {
        toast.success(t('alerts.resume_ok'))
        handleMarkAsRead(alert.id)
      } else {
        toast.error(t('alerts.resume_ko'))
      }
    } catch {
      toast.error('Erreur réseau.')
    } finally {
      setResuming(null)
    }
  }

  // Une pause d'assistant (plafond atteint) → on propose de reprendre.
  const isPausedAlert = (alert: UserAlert) =>
    alert.alert_type === 'conversation_long' && !!(alert.metadata as Record<string, unknown>)?.conversation_id

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground">
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleMarkAllRead}
              disabled={isLoading}
            >
              <Check className="mr-1 h-3 w-3" />
              Tout lire
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {alerts.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Aucune notification
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            {alerts.map((alert) => {
              // Vérifier si c'est un booking_click via metadata (car le type en BDD est 'info')
              const metadataType = (alert.metadata as Record<string, unknown>)?.type as string | undefined
              const effectiveType = metadataType === 'booking_click' ? 'booking_click' : alert.alert_type
              const Icon = ALERT_ICONS[effectiveType] || Info
              const color = ALERT_COLORS[effectiveType] || 'text-muted-foreground'
              const isExpanded = expandedAlertId === alert.id
              // Traduit si le type est couvert, sinon repli sur le texte stocké.
              const i18n = resolveAlertText(alert)
              const title = i18n ? t(i18n.titleKey, i18n.params) : alert.title
              const message = i18n ? t(i18n.messageKey, i18n.params) : alert.message

              return (
                <DropdownMenuItem
                  key={alert.id}
                  className={cn(
                    'flex items-start gap-3 p-3 cursor-pointer',
                    !alert.is_read && 'bg-muted/50'
                  )}
                  onSelect={(e) => {
                    e.preventDefault()
                    setExpandedAlertId(isExpanded ? null : alert.id)
                  }}
                >
                  <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-sm font-medium', !alert.is_read && 'font-semibold', !isExpanded && 'truncate')}>
                        {title}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTime(alert.created_at)}
                      </span>
                    </div>
                    <p className={cn(
                      'text-xs text-muted-foreground mt-0.5',
                      isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
                    )}>
                      {message}
                    </p>
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {/* Assistant en pause (plafond atteint) → « Continuer avec l'IA ».
                          C'est le OUI de la question posée dans la notification ;
                          « Voir conversation » sert de NON (le marchand prend la main). */}
                      {isPausedAlert(alert) && (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          disabled={resuming === alert.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleResumeAI(alert)
                          }}
                        >
                          <Play className="mr-1 h-2.5 w-2.5" />
                          {resuming === alert.id ? '…' : t('alerts.resume_ai')}
                        </Button>
                      )}
                      {hasConversationLink(alert) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewConversation(alert)
                          }}
                        >
                          <ExternalLink className="mr-1 h-2.5 w-2.5" />
                          {t('alerts.view_conversation')}
                        </Button>
                      )}
                      {!alert.is_read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMarkAsRead(alert.id)
                          }}
                        >
                          <Check className="mr-0.5 h-2.5 w-2.5" />
                          Lu
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(alert.id)
                        }}
                      >
                        <Trash2 className="mr-0.5 h-2.5 w-2.5" />
                        {t('alerts.delete')}
                      </Button>
                    </div>
                  </div>
                </DropdownMenuItem>
              )
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
