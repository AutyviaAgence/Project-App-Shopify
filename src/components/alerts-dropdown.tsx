'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, Trash2, AlertTriangle, WifiOff, AlertCircle, Info, Zap, Bot, BotOff, UserX, ExternalLink, CalendarCheck } from 'lucide-react'
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

export function AlertsDropdown() {
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
      toast.error('Erreur lors du marquage')
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
      toast.error('Erreur lors du marquage')
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

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
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
                        {alert.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTime(alert.created_at)}
                      </span>
                    </div>
                    <p className={cn(
                      'text-xs text-muted-foreground mt-0.5',
                      isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
                    )}>
                      {alert.message}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
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
                          Voir conversation
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
                        Supprimer
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
