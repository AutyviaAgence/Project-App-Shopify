'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, ChevronDown } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { track } from '@/lib/posthog/events'
import { useTranslation } from '@/i18n/context'

// Fréquence par défaut quand on active depuis l'interrupteur.
const DEFAULT_ON = 3

/**
 * Contrôle rapide du « tag automatique IA » sur la page Conversations.
 * Interrupteur ON/OFF + choix de fréquence (toutes les 1/3/5/10 messages).
 * Écrit le MÊME réglage que Settings → Lifecycle (`lifecycle_analysis_threshold`
 * via /api/profile) : null = manuel, N = analyse auto toutes les N messages.
 */
export function AutoTagToggle() {
  const { t } = useTranslation()
  const [threshold, setThreshold] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/profile')
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (active && json?.data) setThreshold(json.data.lifecycle_analysis_threshold ?? null)
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function save(next: number | null) {
    const prev = threshold
    setThreshold(next)          // optimiste
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifecycle_analysis_threshold: next }),
      })
      if (!res.ok) throw new Error()
      if (next) track('auto_tag_enabled', { frequency: next })
      toast.success(next ? t('conversations.autotag_on_toast') : t('conversations.autotag_off_toast'))
    } catch {
      setThreshold(prev)        // rollback
      toast.error(t('common.network_error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null
  const enabled = threshold != null && threshold > 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
            enabled
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground'
          )}
          title={t('conversations.autotag_title')}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span className="hidden md:inline">{t('conversations.autotag_label')}</span>
          {enabled && <span className="rounded bg-primary/20 px-1 text-[10px]">{threshold}</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('conversations.autotag_title')}</p>
              <p className="text-xs text-muted-foreground">{t('conversations.autotag_desc')}</p>
            </div>
            <Switch
              checked={enabled}
              disabled={saving}
              onCheckedChange={(on) => save(on ? DEFAULT_ON : null)}
            />
          </div>

          {enabled && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">{t('settings.lifecycle_frequency')}</p>
              <Select
                value={String(threshold)}
                onValueChange={(v) => save(Number(v))}
                disabled={saving}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t('settings.lifecycle_every_msg')}</SelectItem>
                  <SelectItem value="3">{t('settings.lifecycle_every_3')}</SelectItem>
                  <SelectItem value="5">{t('settings.lifecycle_every_5')}</SelectItem>
                  <SelectItem value="10">{t('settings.lifecycle_every_10')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t('settings.lifecycle_every_note')}</p>
            </div>
          )}
          {!enabled && (
            <p className="border-t pt-3 text-[11px] text-muted-foreground">{t('settings.lifecycle_manual_note')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
