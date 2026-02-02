'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import type { Profile } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Checkbox } from '@/components/ui/checkbox'
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
  Upload,
  FileArchive,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

type WhatsAppSession = {
  id: string
  instance_name: string
  display_name: string | null
  phone_number: string | null
  status: string
}

const THEMES = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Système', icon: Monitor },
] as const

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

export default function SettingsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formFullName, setFormFullName] = useState('')
  const [formAvatarUrl, setFormAvatarUrl] = useState('')
  const [formTimezone, setFormTimezone] = useState('Europe/Paris')

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Account deletion state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportOptions, setExportOptions] = useState({
    sessions: true,
    contacts: true,
    conversations: true,
    agents: true,
    knowledge: true,
    links: true,
    tags: true,
    campaigns: true,
  })
  const [exportSessionId, setExportSessionId] = useState<string>('')

  // Import state
  const [importing, setImporting] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importOptions, setImportOptions] = useState({
    agents: true,
    knowledge: true,
    tags: true,
    links: true,
    campaigns: true,
  })
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [targetSessionId, setTargetSessionId] = useState<string>('')
  const [importResult, setImportResult] = useState<{
    success: boolean
    summary: { totalImported: number; totalErrors: number }
    result: Record<string, { imported: number; errors: string[] }>
  } | null>(null)

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

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
        }
      } catch {
        toast.error('Erreur lors du chargement du profil')
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [])

  // Charger les sessions pour l'import
  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch('/api/sessions')
        const json = await res.json()
        if (res.ok && json.data) {
          setSessions(json.data)
          if (json.data.length > 0) {
            setTargetSessionId(json.data[0].id)
          }
        }
      } catch {
        // Silencieux - pas critique
      }
    }
    loadSessions()
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
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setProfile(json.data)
        toast.success('Profil mis à jour')
      } else {
        toast.error(json.error || 'Erreur lors de la mise à jour')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) {
      toast.error('Veuillez remplir tous les champs')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Le nouveau mot de passe doit contenir au moins 8 caractères')
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
        toast.success('Mot de passe modifié avec succès')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        toast.error(json.error || 'Erreur lors du changement de mot de passe')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleDeleteAccount() {
    if (!deletePassword) {
      toast.error('Veuillez entrer votre mot de passe')
      return
    }
    if (deleteConfirmation !== 'SUPPRIMER') {
      toast.error('Veuillez taper SUPPRIMER pour confirmer')
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
        toast.success('Compte supprimé')
        router.push('/login')
      } else {
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setDeleting(false)
    }
  }

  async function handleExportData() {
    setExporting(true)
    try {
      const res = await fetch('/api/account/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...exportOptions,
          sessionId: exportSessionId || undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Erreur lors de l\'export')
      }

      // Télécharger le fichier ZIP
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Extraire le nom du fichier depuis Content-Disposition si disponible
      const contentDisposition = res.headers.get('Content-Disposition')
      let fileName = `export_${new Date().toISOString().split('T')[0]}.zip`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) fileName = match[1]
      }
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success('Export téléchargé avec succès')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'export')
    } finally {
      setExporting(false)
    }
  }

  async function handleImportData() {
    if (!importFile) {
      toast.error('Veuillez sélectionner un fichier ZIP')
      return
    }

    setImporting(true)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', importFile)
      formData.append('options', JSON.stringify({
        ...importOptions,
        targetSessionId: importOptions.links ? targetSessionId : undefined,
      }))

      const res = await fetch('/api/account/import', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Erreur lors de l\'import')
      }

      setImportResult(json)

      if (json.summary.totalErrors === 0) {
        toast.success(`Import réussi : ${json.summary.totalImported} éléments importés`)
      } else {
        toast.warning(`Import terminé : ${json.summary.totalImported} importés, ${json.summary.totalErrors} erreurs`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'import')
    } finally {
      setImporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
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

  // Grouper les timezones par région
  const timezonesByRegion = TIMEZONES.reduce((acc, tz) => {
    if (!acc[tz.region]) acc[tz.region] = []
    acc[tz.region].push(tz)
    return acc
  }, {} as Record<string, typeof TIMEZONES>)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gérez votre profil et vos préférences.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Profil */}
        <Card>
          <CardHeader>
            <CardTitle>Profil</CardTitle>
            <CardDescription>Vos informations personnelles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={formAvatarUrl || undefined} alt={formFullName || 'Avatar'} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">{profile?.full_name || 'Sans nom'}</p>
                <p className="text-xs text-muted-foreground">{profile?.email}</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                value={profile?.email || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                L&apos;email ne peut pas être modifié ici.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-name">Nom complet</Label>
              <Input
                id="profile-name"
                placeholder="Votre nom"
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-avatar">URL de l&apos;avatar</Label>
              <Input
                id="profile-avatar"
                placeholder="https://example.com/avatar.png"
                value={formAvatarUrl}
                onChange={(e) => setFormAvatarUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                URL d&apos;une image pour votre photo de profil.
              </p>
            </div>

            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Enregistrer
            </Button>
          </CardContent>
        </Card>

        {/* Préférences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Préférences
            </CardTitle>
            <CardDescription>Personnalisez votre expérience.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="timezone">Fuseau horaire</Label>
              <Select value={formTimezone} onValueChange={setFormTimezone}>
                <SelectTrigger id="timezone">
                  <SelectValue placeholder="Sélectionnez un fuseau horaire" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(timezonesByRegion).map(([region, tzs]) => (
                    <div key={region}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {region}
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
                Utilisé pour l&apos;affichage des dates et la planification des campagnes.
              </p>
            </div>

            {/* Thème */}
            <div className="space-y-2">
              <Label>Thème</Label>
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
                Le thème &laquo; Système &raquo; suit les préférences de votre navigateur.
              </p>
            </div>

            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Enregistrer les préférences
            </Button>
          </CardContent>
        </Card>

        {/* Sécurité - Changement de mot de passe */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Sécurité
            </CardTitle>
            <CardDescription>Modifiez votre mot de passe.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Mot de passe actuel</Label>
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
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
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
                Minimum 8 caractères
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmer le nouveau mot de passe</Label>
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
              Changer le mot de passe
            </Button>
          </CardContent>
        </Card>

        {/* Export des données (RGPD) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileArchive className="h-5 w-5" />
              Exporter vos données
            </CardTitle>
            <CardDescription>
              Exportez vos données pour backup ou transfert vers une autre session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sélectionnez les données à exporter. Vous pouvez filtrer par session
              pour n&apos;exporter que la configuration liée à une session spécifique.
            </p>

            {/* Filtre par session (optionnel) */}
            <div className="space-y-2">
              <Label htmlFor="export-session">Filtrer par session (optionnel)</Label>
              <Select value={exportSessionId} onValueChange={setExportSessionId}>
                <SelectTrigger id="export-session">
                  <SelectValue placeholder="Toutes les sessions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Toutes les sessions</SelectItem>
                  {sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.display_name || session.phone_number || session.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Laissez vide pour exporter toutes vos données, ou sélectionnez une session
                pour n&apos;exporter que les données liées à celle-ci.
              </p>
            </div>

            {/* Options d'export */}
            <div className="space-y-3">
              <Label>Données à exporter</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="export-sessions"
                    checked={exportOptions.sessions}
                    onCheckedChange={(checked) =>
                      setExportOptions((prev) => ({ ...prev, sessions: !!checked }))
                    }
                  />
                  <label htmlFor="export-sessions" className="text-sm cursor-pointer">
                    Sessions
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="export-contacts"
                    checked={exportOptions.contacts}
                    onCheckedChange={(checked) =>
                      setExportOptions((prev) => ({ ...prev, contacts: !!checked }))
                    }
                  />
                  <label htmlFor="export-contacts" className="text-sm cursor-pointer">
                    Contacts
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="export-conversations"
                    checked={exportOptions.conversations}
                    onCheckedChange={(checked) =>
                      setExportOptions((prev) => ({ ...prev, conversations: !!checked }))
                    }
                  />
                  <label htmlFor="export-conversations" className="text-sm cursor-pointer">
                    Conversations
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="export-agents"
                    checked={exportOptions.agents}
                    onCheckedChange={(checked) =>
                      setExportOptions((prev) => ({ ...prev, agents: !!checked }))
                    }
                  />
                  <label htmlFor="export-agents" className="text-sm cursor-pointer">
                    Agents IA
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="export-knowledge"
                    checked={exportOptions.knowledge}
                    onCheckedChange={(checked) =>
                      setExportOptions((prev) => ({ ...prev, knowledge: !!checked }))
                    }
                  />
                  <label htmlFor="export-knowledge" className="text-sm cursor-pointer">
                    Bases de connaissances
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="export-links"
                    checked={exportOptions.links}
                    onCheckedChange={(checked) =>
                      setExportOptions((prev) => ({ ...prev, links: !!checked }))
                    }
                  />
                  <label htmlFor="export-links" className="text-sm cursor-pointer">
                    Liens WhatsApp
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="export-tags"
                    checked={exportOptions.tags}
                    onCheckedChange={(checked) =>
                      setExportOptions((prev) => ({ ...prev, tags: !!checked }))
                    }
                  />
                  <label htmlFor="export-tags" className="text-sm cursor-pointer">
                    Tags
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="export-campaigns"
                    checked={exportOptions.campaigns}
                    onCheckedChange={(checked) =>
                      setExportOptions((prev) => ({ ...prev, campaigns: !!checked }))
                    }
                  />
                  <label htmlFor="export-campaigns" className="text-sm cursor-pointer">
                    Campagnes
                  </label>
                </div>
              </div>
            </div>

            <Button onClick={handleExportData} disabled={exporting} variant="outline">
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exporter les données sélectionnées
            </Button>
          </CardContent>
        </Card>

        {/* Import des données */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importer des données
            </CardTitle>
            <CardDescription>
              Importez des données depuis un fichier d&apos;export (ZIP).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vous pouvez importer des agents IA, bases de connaissances, tags, liens et campagnes
              depuis un fichier d&apos;export. Les éléments existants avec le même nom seront ignorés.
            </p>

            {/* Sélection du fichier */}
            <div className="space-y-2">
              <Label htmlFor="import-file">Fichier ZIP d&apos;export</Label>
              <Input
                id="import-file"
                type="file"
                accept=".zip"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null)
                  setImportResult(null)
                }}
              />
            </div>

            {/* Options d'import */}
            <div className="space-y-3">
              <Label>Données à importer</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="import-agents"
                    checked={importOptions.agents}
                    onCheckedChange={(checked) =>
                      setImportOptions((prev) => ({ ...prev, agents: !!checked }))
                    }
                  />
                  <label htmlFor="import-agents" className="text-sm cursor-pointer">
                    Agents IA
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="import-knowledge"
                    checked={importOptions.knowledge}
                    onCheckedChange={(checked) =>
                      setImportOptions((prev) => ({ ...prev, knowledge: !!checked }))
                    }
                  />
                  <label htmlFor="import-knowledge" className="text-sm cursor-pointer">
                    Bases de connaissances
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="import-tags"
                    checked={importOptions.tags}
                    onCheckedChange={(checked) =>
                      setImportOptions((prev) => ({ ...prev, tags: !!checked }))
                    }
                  />
                  <label htmlFor="import-tags" className="text-sm cursor-pointer">
                    Tags
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="import-links"
                    checked={importOptions.links}
                    onCheckedChange={(checked) =>
                      setImportOptions((prev) => ({ ...prev, links: !!checked }))
                    }
                  />
                  <label htmlFor="import-links" className="text-sm cursor-pointer">
                    Liens WhatsApp
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="import-campaigns"
                    checked={importOptions.campaigns}
                    onCheckedChange={(checked) =>
                      setImportOptions((prev) => ({ ...prev, campaigns: !!checked }))
                    }
                  />
                  <label htmlFor="import-campaigns" className="text-sm cursor-pointer">
                    Campagnes
                  </label>
                </div>
              </div>
            </div>

            {/* Session cible pour les liens */}
            {importOptions.links && sessions.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="target-session">Session cible pour les liens</Label>
                <Select value={targetSessionId} onValueChange={setTargetSessionId}>
                  <SelectTrigger id="target-session">
                    <SelectValue placeholder="Sélectionnez une session" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((session) => (
                      <SelectItem key={session.id} value={session.id}>
                        {session.display_name || session.phone_number || session.instance_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Les liens importés seront associés à cette session WhatsApp.
                </p>
              </div>
            )}

            {importOptions.links && sessions.length === 0 && (
              <p className="text-sm text-amber-600">
                Aucune session WhatsApp disponible. Les liens ne pourront pas être importés.
              </p>
            )}

            {/* Résultat de l'import */}
            {importResult && (
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {importResult.summary.totalErrors === 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-amber-500" />
                  )}
                  <span className="font-medium">
                    {importResult.summary.totalImported} éléments importés
                    {importResult.summary.totalErrors > 0 &&
                      `, ${importResult.summary.totalErrors} erreurs`}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  {Object.entries(importResult.result).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="capitalize">{key}</span>
                      <span>
                        {value.imported} importé(s)
                        {value.errors.length > 0 && (
                          <span className="text-amber-600 ml-1">
                            ({value.errors.length} erreur(s))
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleImportData}
              disabled={importing || !importFile}
              variant="outline"
            >
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Importer les données
            </Button>
          </CardContent>
        </Card>

        {/* Zone de danger - Suppression du compte */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Zone de danger
            </CardTitle>
            <CardDescription>
              Actions irréversibles sur votre compte.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <h4 className="font-medium text-destructive">Supprimer le compte</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Cette action supprimera définitivement votre compte et toutes vos données :
                sessions WhatsApp, contacts, conversations, agents IA, documents, campagnes, etc.
                Cette action est irréversible.
              </p>
              <Button
                variant="destructive"
                className="mt-4"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer mon compte
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Supprimer votre compte
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Cette action est <strong>irréversible</strong>. Toutes vos données seront
                  définitivement supprimées.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="delete-password">Mot de passe</Label>
                  <Input
                    id="delete-password"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Entrez votre mot de passe"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delete-confirmation">
                    Tapez <strong>SUPPRIMER</strong> pour confirmer
                  </Label>
                  <Input
                    id="delete-confirmation"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder="SUPPRIMER"
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
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteAccount()
              }}
              disabled={deleting || !deletePassword || deleteConfirmation !== 'SUPPRIMER'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
