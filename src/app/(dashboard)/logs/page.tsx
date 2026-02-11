'use client'

import { useEffect, useState, useCallback } from 'react'
import type { WebhookLog } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  MinusCircle,
  Webhook,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { useTranslation } from '@/i18n/context'

export default function LogsPage() {
  const { t, locale } = useTranslation()
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<{ id: string; instance_name: string }[]>([])

  const dateFnsLocale = locale === 'fr' ? fr : enUS
  const numberLocale = locale === 'fr' ? 'fr-FR' : 'en-US'

  // Filters
  const [filterSession, setFilterSession] = useState<string>('all')
  const [filterEvent, setFilterEvent] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalLogs, setTotalLogs] = useState(0)
  const ITEMS_PER_PAGE = 50

  // Detail dialog
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      const json = await res.json()
      if (res.ok && json.data) {
        setSessions(json.data.map((s: { id: string; instance_name: string }) => ({
          id: s.id,
          instance_name: s.instance_name,
        })))
      }
    } catch {
      // silently ignore
    }
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterSession !== 'all') params.set('session_id', filterSession)
      if (filterEvent !== 'all') params.set('event_type', filterEvent)
      if (filterStatus !== 'all') params.set('status', filterStatus)
      params.set('page', page.toString())
      params.set('limit', ITEMS_PER_PAGE.toString())

      const res = await fetch(`/api/webhook-logs?${params.toString()}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setLogs(json.data)
        if (json.pagination) {
          setTotalPages(json.pagination.totalPages)
          setTotalLogs(json.pagination.total)
        }
      }
    } catch {
      toast.error(t('logs.load_error'))
    } finally {
      setLoading(false)
    }
  }, [filterSession, filterEvent, filterStatus, page, t])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  async function handleCleanup() {
    try {
      const res = await fetch('/api/webhook-logs', { method: 'DELETE' })
      const json = await res.json()
      if (res.ok) {
        toast.success(t('logs.cleaned', { count: String(json.deleted) }))
        fetchLogs()
      } else {
        toast.error(json.error || t('logs.clean_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'skipped':
        return <MinusCircle className="h-4 w-4 text-yellow-500" />
      default:
        return null
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'success':
        return <Badge variant="outline" className="text-green-600 border-green-300">{t('logs.success')}</Badge>
      case 'error':
        return <Badge variant="outline" className="text-red-600 border-red-300">{t('logs.error')}</Badge>
      case 'skipped':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300">{t('logs.ignored')}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  function getEventBadge(event: string) {
    const colors: Record<string, string> = {
      'messages.upsert': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      'connection.update': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      'qrcode.updated': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    }
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[event] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
        {event}
      </span>
    )
  }

  if (loading && logs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t('logs.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('logs.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('logs.refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCleanup}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('logs.clean_7d')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={filterSession} onValueChange={(v) => { setFilterSession(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t('logs.all_sessions')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('logs.all_sessions')}</SelectItem>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.instance_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterEvent} onValueChange={(v) => { setFilterEvent(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t('logs.all_events')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('logs.all_events')}</SelectItem>
            <SelectItem value="messages.upsert">messages.upsert</SelectItem>
            <SelectItem value="connection.update">connection.update</SelectItem>
            <SelectItem value="qrcode.updated">qrcode.updated</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder={t('logs.all_statuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('logs.all_statuses')}</SelectItem>
            <SelectItem value="success">{t('logs.success')}</SelectItem>
            <SelectItem value="error">{t('logs.error')}</SelectItem>
            <SelectItem value="skipped">{t('logs.ignored')}</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">
          {t('logs.log_count', { count: String(totalLogs) })}
        </span>
      </div>

      {/* Logs table */}
      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Webhook className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium">{t('logs.no_logs')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('logs.no_logs_desc')}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 sm:px-4 py-2 text-left font-medium">{t('logs.status')}</th>
                  <th className="px-3 sm:px-4 py-2 text-left font-medium">{t('logs.event')}</th>
                  <th className="px-3 sm:px-4 py-2 text-left font-medium hidden sm:table-cell">{t('logs.instance')}</th>
                  <th className="px-3 sm:px-4 py-2 text-left font-medium hidden md:table-cell">{t('logs.time')}</th>
                  <th className="px-3 sm:px-4 py-2 text-left font-medium">{t('logs.date')}</th>
                  <th className="px-3 sm:px-4 py-2 text-left font-medium">{t('logs.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b hover:bg-muted/30">
                    <td className="px-3 sm:px-4 py-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(log.status)}
                        {getStatusBadge(log.status)}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2">{getEventBadge(log.event_type)}</td>
                    <td className="px-3 sm:px-4 py-2 font-mono text-xs hidden sm:table-cell">{log.instance_name}</td>
                    <td className="px-3 sm:px-4 py-2 text-muted-foreground hidden md:table-cell">
                      {log.processing_time_ms != null ? `${log.processing_time_ms}ms` : '-'}
                    </td>
                    <td className="px-3 sm:px-4 py-2 text-muted-foreground">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: dateFnsLocale })}
                    </td>
                    <td className="px-3 sm:px-4 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t('common.page_x_of_y', { x: String(page), y: String(totalPages) })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('logs.detail_title')}</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t('logs.event')}</p>
                  <p className="font-medium">{selectedLog.event_type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('logs.status')}</p>
                  {getStatusBadge(selectedLog.status)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('logs.instance')}</p>
                  <p className="font-mono text-sm">{selectedLog.instance_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('logs.processing_time')}</p>
                  <p>{selectedLog.processing_time_ms != null ? `${selectedLog.processing_time_ms}ms` : '-'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">{t('logs.date')}</p>
                  <p>{new Date(selectedLog.created_at).toLocaleString(numberLocale)}</p>
                </div>
              </div>

              {selectedLog.error_message && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t('logs.error')}</p>
                  <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                    {selectedLog.error_message}
                  </p>
                </div>
              )}

              {selectedLog.payload && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t('logs.payload')}</p>
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">
                    {JSON.stringify(selectedLog.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
