'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import type { Profile, ConversationTag } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Loader2,
  Save,
  Sun,
  Moon,
  Monitor,
  Lock,
  Trash2,
  AlertTriangle,
  Eye,
  EyeOff,
  Globe,
  Download,
  FileArchive,
  Clock,
  Scale,
  ExternalLink,
  CreditCard,
  Cpu,
  Zap,
  Workflow,
  Sparkles,
  MessageSquare,
  Mic,
  Image as ImageIcon,
  Play,
  FileText,
  Tag,
  Volume2,
  VolumeX,
  Gift,
  Copy,
  Check,
  Users,
  User,
  Shield,
  Database,
  HelpCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/i18n/context'
import { HelpContent } from '@/app/(dashboard)/help/page'
import { useTenant } from '@/lib/tenant/context'
import type { Locale } from '@/i18n/context'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { MacrosManager } from '@/components/macros-manager'

const RETENTION_KEYS = [
  { value: 'null', labelKey: 'settings.retention_keep', months: null },
  { value: '1', labelKey: 'settings.retention_1m', months: 1 },
  { value: '3', labelKey: 'settings.retention_3m', months: 3 },
  { value: '6', labelKey: 'settings.retention_6m', months: 6 },
  { value: '12', labelKey: 'settings.retention_1y', months: 12 },
  { value: '24', labelKey: 'settings.retention_2y', months: 24 },
  { value: '36', labelKey: 'settings.retention_3y', months: 36 },
]

const MESSAGE_TYPE_KEYS = [
  { value: 'text', labelKey: 'settings.msg_type_text', icon: MessageSquare },
  { value: 'audio', labelKey: 'settings.msg_type_audio', icon: Mic },
  { value: 'image', labelKey: 'settings.msg_type_image', icon: ImageIcon },
  { value: 'video', labelKey: 'settings.msg_type_video', icon: Play },
  { value: 'document', labelKey: 'settings.msg_type_document', icon: FileText },
]

const THEME_KEYS = [
  { value: 'light', labelKey: 'settings.theme_light', icon: Sun },
  { value: 'dark', labelKey: 'settings.theme_dark', icon: Moon },
  { value: 'system', labelKey: 'settings.theme_system', icon: Monitor },
]

// Timezones les plus courants, groupés par région
const TIMEZONES = [
  { value: 'Europe/Paris', label: 'Paris (UTC+1/+2)', region: 'Europe' },
  { value: 'Europe/London', label: 'Londres (UTC+0/+1)', region: 'Europe' },
  { value: 'Europe/Brussels', label: 'Bruxelles (UTC+1/+2)', region: 'Europe' },
  { value: 'Europe/Zurich', label: 'Zurich (UTC+1/+2)', region: 'Europe' },
  { value: 'Europe/Berlin', label: 'Berlin (UTC+1/+2)', region: 'Europe' },
  { value: 'Europe/Madrid', label: 'Madrid (UTC+1/+2)', region: 'Europe' },
  { value: 'Europe/Rome', label: 'Rome (UTC+1/+2)', region: 'Europe' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (UTC+1/+2)', region: 'Europe' },
  { value: 'America/New_York', label: 'New York (UTC-5/-4)', region: 'Amérique' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (UTC-8/-7)', region: 'Amérique' },
  { value: 'America/Chicago', label: 'Chicago (UTC-6/-5)', region: 'Amérique' },
  { value: 'America/Toronto', label: 'Toronto (UTC-5/-4)', region: 'Amérique' },
  { value: 'America/Montreal', label: 'Montréal (UTC-5/-4)', region: 'Amérique' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (UTC-3)', region: 'Amérique' },
  { value: 'Africa/Casablanca', label: 'Casablanca (UTC+0/+1)', region: 'Afrique' },
  { value: 'Africa/Tunis', label: 'Tunis (UTC+1)', region: 'Afrique' },
  { value: 'Africa/Algiers', label: 'Alger (UTC+1)', region: 'Afrique' },
  { value: 'Africa/Dakar', label: 'Dakar (UTC+0)', region: 'Afrique' },
  { value: 'Africa/Abidjan', label: 'Abidjan (UTC+0)', region: 'Afrique' },
  { value: 'Asia/Dubai', label: 'Dubaï (UTC+4)', region: 'Asie' },
  { value: 'Asia/Singapore', label: 'Singapour (UTC+8)', region: 'Asie' },
  { value: 'Asia/Tokyo', label: 'Tokyo (UTC+9)', region: 'Asie' },
  { value: 'Asia/Shanghai', label: 'Shanghai (UTC+8)', region: 'Asie' },
  { value: 'Australia/Sydney', label: 'Sydney (UTC+10/+11)', region: 'Océanie' },
  { value: 'Pacific/Auckland', label: 'Auckland (UTC+12/+13)', region: 'Océanie' },
]

function ReferralSection() {
  const { t } = useTranslation()
  const [data, setData] = useState<{ referral_code: string; referral_link: string; referees: any[]; total_tokens_earned: number } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/referral').then(r => r.json()).then(j => setData(j)).catch(() => {})
  }, [])

  function copyLink() {
    if (!data?.referral_link) return
    navigator.clipboard.writeText(data.referral_link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5" />
          {t('settings.referral')}
        </CardTitle>
        <CardDescription>{t('settings.referral_desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data ? (
          <>
            <div className="space-y-2">
              <Label>{t('settings.referral_link')}</Label>
              <div className="flex gap-2">
                <Input value={data.referral_link} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-muted-foreground">{t('settings.referees')}</p>
                <p className="text-xl font-bold">{data.referees.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('settings.tokens_earned')}</p>
                <p className="text-xl font-bold">{(data.total_tokens_earned / 1000).toFixed(0)}k</p>
              </div>
            </div>
            {data.referees.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('settings.referee')}</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('settings.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.referees.map((r: any) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2">{r.full_name || r.email}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.subscription_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                            {r.subscription_status === 'active' ? t('settings.referee_subscribed') : t('settings.referee_signed_up')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        )}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { t, locale, setLocale } = useTranslation()
  const tenant = useTenant()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formFullName, setFormFullName] = useState('')
  const [formAvatarUrl, setFormAvatarUrl] = useState('')
  const [formTimezone, setFormTimezone] = useState('Europe/Paris')
  const [formDataRetention, setFormDataRetention] = useState<number | null>(null)
  const [formLifecycleThreshold, setFormLifecycleThreshold] = useState<number | null>(null)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Account deletion state
  const [isOAuthUser, setIsOAuthUser] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Export state
  const [exporting, setExporting] = useState(false)

  // Purge state
  const [purgePreview, setPurgePreview] = useState<{ messages_to_delete: number; media_to_delete: number; cutoff_date: string | null } | null>(null)
  const [loadingPurgePreview, setLoadingPurgePreview] = useState(false)
  const [purging, setPurging] = useState(false)
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false)

  // Purge filters
  const [allTags, setAllTags] = useState<ConversationTag[]>([])
  const [purgeTagIds, setPurgeTagIds] = useState<string[]>([])
  const [purgeMessageTypes, setPurgeMessageTypes] = useState<string[]>([])

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [tab, setTab] = useState('compte')

  useEffect(() => {
    const stored = localStorage.getItem('autyvia_sound_enabled')
    if (stored !== null) setSoundEnabled(stored !== 'false')
  }, [])

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled)
    localStorage.setItem('autyvia_sound_enabled', String(enabled))
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch('/api/profile')
        const json = await res.json()
        if (res.ok && json.data) {
          setProfile(json.data)
          setFormFullName(json.data.full_name || '')
          setFormAvatarUrl(json.data.avatar_url || '')
          setFormTimezone(json.data.timezone || 'Europe/Paris')
          setFormDataRetention(json.data.data_retention_months)
          setFormLifecycleThreshold(json.data.lifecycle_analysis_threshold ?? null)
          setIsOAuthUser(json.data.auth_provider && json.data.auth_provider !== 'email')
        }
      } catch {
        toast.error(t('settings.load_error'))
      } finally {
        setLoading(false)
      }
    }
    loadProfile()

    // Charger les tags pour les filtres de purge
    async function loadTags() {
      try {
        const res = await fetch('/api/tags')
        const json = await res.json()
        if (res.ok && json.data) {
          setAllTags(json.data)
        }
      } catch {
        // silently ignore
      }
    }
    loadTags()
  }, [])

  async function handleSaveProfile() {
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formFullName.trim(),
          avatar_url: formAvatarUrl.trim(),
          timezone: formTimezone,
          data_retention_months: formDataRetention,
          lifecycle_analysis_threshold: formLifecycleThreshold,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setProfile(json.data)
        toast.success(t('settings.profile_saved'))
      } else {
        toast.error(json.error || t('settings.profile_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) {
      toast.error(t('settings.fill_all_fields'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('settings.passwords_mismatch'))
      return
    }
    if (newPassword.length < 8) {
      toast.error(t('settings.password_too_short'))
      return
    }

    setChangingPassword(true)
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(t('settings.password_changed'))
        const { createClient } = await import('@/lib/supabase/client')
        await createClient().auth.signOut()
        router.push('/login')
      } else {
        toast.error(json.error || t('settings.password_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleSendSetPasswordEmail() {
    try {
      const supabase = (await import('@/lib/supabase/client')).createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return
      await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth/callback?redirect=/settings`,
      })
      toast.success(t('settings.password_email_sent'))
    } catch {
      toast.error(t('common.network_error'))
    }
  }

  async function handleDeleteAccount() {
    if (!isOAuthUser && !deletePassword) {
      toast.error(t('settings.delete_password_required'))
      return
    }
    if (deleteConfirmation !== (locale === 'fr' ? 'SUPPRIMER' : 'DELETE')) {
      toast.error(t('settings.delete_confirm_required'))
      return
    }

    setDeleting(true)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: deletePassword,
          confirmation: deleteConfirmation,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(t('settings.account_deleted'))
        router.push('/login')
      } else {
        toast.error(json.error || t('settings.delete_account_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setDeleting(false)
    }
  }

  async function handleExportData() {
    setExporting(true)
    try {
      const res = await fetch('/api/account/export')
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || t('settings.export_error'))
      }

      // Télécharger le fichier ZIP
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export_${new Date().toISOString().split('T')[0]}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success(t('settings.export_success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.export_error'))
    } finally {
      setExporting(false)
    }
  }

  async function loadPurgePreview() {
    setLoadingPurgePreview(true)
    try {
      const params = new URLSearchParams()
      if (purgeTagIds.length > 0) params.set('tag_ids', purgeTagIds.join(','))
      if (purgeMessageTypes.length > 0) params.set('message_types', purgeMessageTypes.join(','))
      const queryStr = params.toString()
      const res = await fetch(`/api/account/purge${queryStr ? `?${queryStr}` : ''}`)
      const json = await res.json()
      if (res.ok) {
        setPurgePreview(json)
      } else {
        toast.error(json.error || t('settings.purge_load_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setLoadingPurgePreview(false)
    }
  }

  async function handlePurgeData() {
    setPurging(true)
    try {
      const res = await fetch('/api/account/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_ids: purgeTagIds.length > 0 ? purgeTagIds : undefined,
          message_types: purgeMessageTypes.length > 0 ? purgeMessageTypes : undefined,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(json.message || t('settings.messages_purged'))
        setPurgeDialogOpen(false)
        setPurgePreview(null)
      } else {
        toast.error(json.error || t('settings.purge_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setPurging(false)
    }
  }

  function togglePurgeTag(tagId: string) {
    setPurgeTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  function togglePurgeMessageType(type: string) {
    setPurgeMessageTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  if (loading) {
    return (
      <BlobLoaderScreen />
    )
  }

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : profile?.email?.charAt(0).toUpperCase() || '?'

  const RETENTION_OPTIONS = RETENTION_KEYS.map(o => ({ ...o, label: t(o.labelKey) }))
  const MESSAGE_TYPE_OPTIONS = MESSAGE_TYPE_KEYS.map(o => ({ ...o, label: t(o.labelKey) }))
  const THEMES = THEME_KEYS.map(o => ({ ...o, label: t(o.labelKey) }))

  // Grouper les timezones par région
  const timezonesByRegion = TIMEZONES.reduce((acc, tz) => {
    if (!acc[tz.region]) acc[tz.region] = []
    acc[tz.region].push(tz)
    return acc
  }, {} as Record<string, typeof TIMEZONES>)

  const deleteWord = locale === 'fr' ? 'SUPPRIMER' : 'DELETE'

  const TABS = [
    { id: 'compte', label: t('settings.tab_account'), icon: User },
    { id: 'abonnement', label: t('settings.tab_subscription'), icon: CreditCard },
    { id: 'securite', label: t('settings.tab_security'), icon: Shield },
    { id: 'macros', label: t('settings.tab_macros'), icon: Zap },
    { id: 'donnees', label: t('settings.tab_data'), icon: Database },
    { id: 'aide', label: t('settings.tab_help'), icon: HelpCircle },
    { id: 'danger', label: t('settings.tab_danger'), icon: AlertTriangle },
  ]

  return (
    <div className="p-4 sm:p-6">
      <div data-tour="settings-header" className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.description')}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        {/* Sidebar d'onglets */}
        <Card className="h-fit md:sticky md:top-6 p-2">
          <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors ${
                  tab === id
                    ? id === 'danger'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </Card>

        {/* Contenu de l'onglet actif */}
        <div className="space-y-6">
        {tab === 'compte' && (<>
        {/* Profil */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.profile')}</CardTitle>
            <CardDescription>{t('settings.profile_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={formAvatarUrl || undefined} alt={formFullName || 'Avatar'} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">{profile?.full_name || t('settings.no_name')}</p>
                <p className="text-xs text-muted-foreground">{profile?.email}</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="profile-email">{t('settings.email_label')}</Label>
              <Input
                id="profile-email"
                value={profile?.email || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.email_note')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-name">{t('settings.full_name')}</Label>
              <Input
                id="profile-name"
                placeholder={t('settings.name_placeholder')}
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-avatar">{t('settings.avatar_url')}</Label>
              <Input
                id="profile-avatar"
                placeholder="https://example.com/avatar.png"
                value={formAvatarUrl}
                onChange={(e) => setFormAvatarUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.avatar_note')}
              </p>
            </div>

            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('common.save')}
            </Button>
          </CardContent>
        </Card>

        {/* Préférences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {t('settings.preferences')}
            </CardTitle>
            <CardDescription>{t('settings.preferences_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Language */}
            <div className="space-y-2">
              <Label>{t('settings.language')}</Label>
              <div className="flex gap-2">
                {([
                  { value: 'fr' as Locale, label: 'Français', flag: '🇫🇷' },
                  { value: 'en' as Locale, label: 'English', flag: '🇬🇧' },
                ]).map(({ value, label, flag }) => (
                  <Button
                    key={value}
                    variant={locale === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLocale(value)}
                    className="gap-2"
                  >
                    <span>{flag}</span>
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="timezone">{t('settings.timezone_label')}</Label>
              <Select value={formTimezone} onValueChange={setFormTimezone}>
                <SelectTrigger id="timezone">
                  <SelectValue placeholder={t('settings.timezone_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(timezonesByRegion).map(([region, tzs]) => (
                    <div key={region}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {t('settings.region_' + ({ 'Europe': 'europe', 'Amérique': 'america', 'Afrique': 'africa', 'Asie': 'asia', 'Océanie': 'oceania' }[region] || 'europe'))}
                      </div>
                      {tzs.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('settings.timezone_note')}
              </p>
            </div>

            {/* Thème */}
            <div className="space-y-2">
              <Label>{t('settings.theme')}</Label>
              {mounted ? (
                <div className="flex gap-2">
                  {THEMES.map(({ value, label, icon: Icon }) => (
                    <Button
                      key={value}
                      variant={theme === value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTheme(value)}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2">
                  {THEMES.map(({ value, label, icon: Icon }) => (
                    <Button
                      key={value}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t('settings.theme_note')}
              </p>
            </div>

            {/* Sons de notification */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                {soundEnabled ? <Volume2 className="h-5 w-5 text-primary" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-medium">{t('settings.notif_sounds')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.notif_sounds_desc')}</p>
                </div>
              </div>
              <Switch checked={soundEnabled} onCheckedChange={handleSoundToggle} />
            </div>

            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('settings.save_preferences')}
            </Button>
          </CardContent>
        </Card>
        </>)}

        {tab === 'macros' && (<>
        {/* Macros (réponses pré-enregistrées) */}
        <MacrosManager />
        </>)}

        {tab === 'abonnement' && (<>
        {/* Abonnement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('settings.subscription_title')}
            </CardTitle>
            <CardDescription>{t('settings.subscription_desc', { appName: tenant.appName })}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.subscription_info')}
            </p>
            <Link href="/subscription">
              <Button variant="outline">
                <CreditCard className="mr-2 h-4 w-4" />
                {t('settings.manage_subscription')}
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Tokens IA supplémentaires */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              {t('settings.tokens_title')}
            </CardTitle>
            <CardDescription>{t('settings.tokens_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.tokens_info')}
            </p>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">{t('settings.tokens_amount')}</p>
                <p className="text-sm text-muted-foreground">{t('settings.tokens_payment')}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">50&euro;</p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/stripe/buy-tokens', { method: 'POST' })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error)
                      window.location.href = data.url
                    } catch {
                      toast.error(t('settings.tokens_buy_error'))
                    }
                  }}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  {t('settings.tokens_buy')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parrainage */}
        <ReferralSection />
        </>)}

        {tab === 'securite' && (<>
        {/* Sécurité - Changement de mot de passe */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              {t('settings.security')}
            </CardTitle>
            <CardDescription>{t('settings.security_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isOAuthUser ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t('settings.oauth_no_password')}
                  {typeof window !== 'undefined' ? window.location.hostname : 'cette application'}.
                  {' '}{t('settings.oauth_set_password_hint')}
                </p>
                <Button variant="outline" onClick={handleSendSetPasswordEmail}>
                  <Lock className="mr-2 h-4 w-4" />
                  {t('settings.set_password_email')}
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="current-password">{t('settings.current_password')}</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">{t('settings.new_password')}</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.min_chars')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t('settings.confirm_password')}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                >
                  {changingPassword ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="mr-2 h-4 w-4" />
                  )}
                  {t('settings.change_password')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        </>)}

        {tab === 'donnees' && (<>
        {/* Export des données (RGPD) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileArchive className="h-5 w-5" />
              {t('settings.data_title')}
            </CardTitle>
            <CardDescription>
              {t('settings.data_desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.data_info')}
            </p>
            <Button onClick={handleExportData} disabled={exporting} variant="outline">
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {t('settings.export_data')}
            </Button>
          </CardContent>
        </Card>

        {/* Documents juridiques */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              {t('settings.legal_title')}
            </CardTitle>
            <CardDescription>
              {t('settings.legal_desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <Link
                href="/privacy"
                target="_blank"
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium">{t('settings.privacy_policy')}</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/cgu"
                target="_blank"
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium">{t('settings.terms')}</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/cgv"
                target="_blank"
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium">{t('settings.sales_terms')}</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/legal"
                target="_blank"
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium">{t('settings.legal_notice')}</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Rétention des données */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('settings.retention_title')}
            </CardTitle>
            <CardDescription>
              {t('settings.retention_desc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="data-retention">{t('settings.retention_label')}</Label>
              <Select
                value={formDataRetention === null ? 'null' : String(formDataRetention)}
                onValueChange={(value) => {
                  setFormDataRetention(value === 'null' ? null : Number(value))
                }}
              >
                <SelectTrigger id="data-retention">
                  <SelectValue placeholder={t('settings.retention_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('settings.retention_note')}
              </p>
            </div>

            {formDataRetention !== null && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="inline-block h-4 w-4 mr-1" />
                  {t('settings.retention_warning', { months: String(formDataRetention) })}
                </p>
              </div>
            )}

            {/* Filtres de purge */}
            {profile?.data_retention_months && (
              <Separator />
            )}

            {profile?.data_retention_months && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  {t('settings.purge_filters')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.purge_filters_desc')}
                </p>

                {/* Filtre par tags */}
                {allTags.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{t('settings.purge_by_tags')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.map((tag) => {
                        const isSelected = purgeTagIds.includes(tag.id)
                        return (
                          <button
                            key={tag.id}
                            onClick={() => togglePurgeTag(tag.id)}
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                              isSelected
                                ? 'ring-2 ring-offset-1 ring-offset-background'
                                : 'opacity-60 hover:opacity-100'
                            }`}
                            style={{
                              backgroundColor: `${tag.color}20`,
                              color: tag.color,
                              ...(isSelected ? { ringColor: tag.color } : {}),
                            }}
                          >
                            {tag.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Filtre par type de message */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{t('settings.purge_by_type')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {MESSAGE_TYPE_OPTIONS.map((opt) => {
                      const Icon = opt.icon
                      const isSelected = purgeMessageTypes.includes(opt.value)
                      return (
                        <button
                          key={opt.value}
                          onClick={() => togglePurgeMessageType(opt.value)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border ${
                            isSelected
                              ? 'bg-primary/10 text-primary border-primary/30'
                              : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Résumé des filtres actifs */}
                {(purgeTagIds.length > 0 || purgeMessageTypes.length > 0) && (
                  <div className="rounded-lg border bg-muted/30 p-2.5">
                    <p className="text-xs text-muted-foreground">
                      {purgeMessageTypes.length > 0 && (
                        <> {t('settings.purge_summary_types')} <strong>{purgeMessageTypes.map(mt => MESSAGE_TYPE_OPTIONS.find(o => o.value === mt)?.label).filter(Boolean).join(', ')}</strong></>
                      )}
                      {purgeTagIds.length > 0 && (
                        <> {purgeTagIds.length > 1 ? t('settings.purge_summary_tags_plural') : t('settings.purge_summary_tags_single')} <strong>{purgeTagIds.map(id => allTags.find(tg => tg.id === id)?.name).filter(Boolean).join(' + ')}</strong></>
                      )}
                      {purgeMessageTypes.length === 0 && purgeTagIds.length > 0 && <> {t('settings.purge_summary_all_types')}</>}
                    </p>
                    <button
                      onClick={() => { setPurgeTagIds([]); setPurgeMessageTypes([]) }}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      {t('settings.purge_reset_filters')}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('common.save')}
              </Button>

              {profile?.data_retention_months && (
                <Button
                  variant="outline"
                  onClick={() => {
                    loadPurgePreview()
                    setPurgeDialogOpen(true)
                  }}
                  disabled={loadingPurgePreview}
                >
                  {loadingPurgePreview ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  {t('settings.purge_now')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Analyse Lifecycle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5" />
              {t('settings.lifecycle_title')}
            </CardTitle>
            <CardDescription>
              {t('settings.lifecycle_desc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('settings.lifecycle_frequency')}</Label>
              <Select
                value={formLifecycleThreshold === null ? 'null' : String(formLifecycleThreshold)}
                onValueChange={(value) => {
                  setFormLifecycleThreshold(value === 'null' ? null : Number(value))
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.lifecycle_frequency_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="null">{t('settings.lifecycle_manual')}</SelectItem>
                  <SelectItem value="1">{t('settings.lifecycle_every_msg')}</SelectItem>
                  <SelectItem value="3">{t('settings.lifecycle_every_3')}</SelectItem>
                  <SelectItem value="5">{t('settings.lifecycle_every_5')}</SelectItem>
                  <SelectItem value="10">{t('settings.lifecycle_every_10')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formLifecycleThreshold === null ? (
                  <>{t('settings.lifecycle_manual_note')}</>
                ) : formLifecycleThreshold === 1 ? (
                  <>
                    <Sparkles className="inline h-3 w-3 mr-1" />
                    {t('settings.lifecycle_every_note')}
                  </>
                ) : (
                  <>
                    <Sparkles className="inline h-3 w-3 mr-1" />
                    {t('settings.lifecycle_n_note', { n: String(formLifecycleThreshold) })}
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
        </>)}

        {tab === 'aide' && (
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.help_center')}</CardTitle>
              <CardDescription>{t('settings.help_center_desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <HelpContent embedded />
            </CardContent>
          </Card>
        )}

        {tab === 'danger' && (<>
        {/* Zone de danger - Suppression du compte */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t('settings.danger_zone')}
            </CardTitle>
            <CardDescription>
              {t('settings.danger_desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <h4 className="font-medium text-destructive">{t('settings.delete_account')}</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.delete_account_info')}
              </p>
              <Button
                variant="destructive"
                className="mt-4"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('settings.delete_my_account')}
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                {t('settings.data_deletion_email_hint')}
                <a href="/data-deletion" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {t('settings.data_deletion_see_procedure')}
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
        </>)}
        </div>
      </div>

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t('settings.delete_dialog_title')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  {t('settings.delete_dialog_warning')}
                </p>

                {!isOAuthUser && (
                  <div className="space-y-2">
                    <Label htmlFor="delete-password">{t('settings.delete_password_label')}</Label>
                    <Input
                      id="delete-password"
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder={t('settings.delete_password_placeholder')}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="delete-confirmation">
                    {t('settings.delete_confirm_label')}
                  </Label>
                  <Input
                    id="delete-confirmation"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder={t('settings.delete_confirm_placeholder')}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              onClick={() => {
                setDeletePassword('')
                setDeleteConfirmation('')
              }}
            >
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteAccount()
              }}
              disabled={deleting || (!isOAuthUser && !deletePassword) || deleteConfirmation !== deleteWord}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('settings.delete_confirm_btn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmation de purge */}
      <AlertDialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('settings.purge_title')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                {loadingPurgePreview ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : purgePreview ? (
                  <>
                    <p>
                      {t('settings.purge_confirm', { months: String(profile?.data_retention_months) })}
                    </p>

                    {/* Filtres actifs */}
                    {(purgeTagIds.length > 0 || purgeMessageTypes.length > 0) && (
                      <div className="rounded-lg border bg-muted/30 p-2.5 space-y-1">
                        {purgeTagIds.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Tags : <strong>{purgeTagIds.map(id => allTags.find(t => t.id === id)?.name).filter(Boolean).join(' + ')}</strong>
                          </p>
                        )}
                        {purgeMessageTypes.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Types : <strong>{purgeMessageTypes.map(mt => MESSAGE_TYPE_OPTIONS.find(o => o.value === mt)?.label).filter(Boolean).join(', ')}</strong>
                          </p>
                        )}
                      </div>
                    )}

                    {purgePreview.messages_to_delete > 0 ? (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-1">
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="inline-block h-4 w-4 mr-1" />
                          {t('settings.purge_count', { count: String(purgePreview.messages_to_delete) })}
                          {purgePreview.cutoff_date && (
                            <span className="block mt-1 text-xs">
                              {t('settings.purge_cutoff', { date: new Date(purgePreview.cutoff_date).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US') })}
                            </span>
                          )}
                        </p>
                        {purgePreview.media_to_delete > 0 && (
                          <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                            {t('settings.purge_media', { count: String(purgePreview.media_to_delete) })}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                        <p className="text-sm text-green-600 dark:text-green-400">
                          {t('settings.purge_none')}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p>{t('settings.purge_preview_error')}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handlePurgeData()
              }}
              disabled={purging || !purgePreview || purgePreview.messages_to_delete === 0}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {purging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('settings.purge_messages')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
