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
} from 'lucide-react'
import Link from 'next/link'

// Options de rétention des données
const RETENTION_OPTIONS = [
  { value: 'null', label: 'Conserver indéfiniment', months: null },
  { value: '1', label: '1 mois', months: 1 },
  { value: '3', label: '3 mois', months: 3 },
  { value: '6', label: '6 mois', months: 6 },
  { value: '12', label: '1 an', months: 12 },
  { value: '24', label: '2 ans', months: 24 },
  { value: '36', label: '3 ans', months: 36 },
]

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
  const [formDataRetention, setFormDataRetention] = useState<number | null>(null)

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

  // Purge state
  const [purgePreview, setPurgePreview] = useState<{ messages_to_delete: number; cutoff_date: string | null } | null>(null)
  const [loadingPurgePreview, setLoadingPurgePreview] = useState(false)
  const [purging, setPurging] = useState(false)
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false)

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
          setFormDataRetention(json.data.data_retention_months)
        }
      } catch {
        toast.error('Erreur lors du chargement du profil')
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
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
      const res = await fetch('/api/account/export')
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Erreur lors de l\'export')
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

      toast.success('Export téléchargé avec succès')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'export')
    } finally {
      setExporting(false)
    }
  }

  async function loadPurgePreview() {
    setLoadingPurgePreview(true)
    try {
      const res = await fetch('/api/account/purge')
      const json = await res.json()
      if (res.ok) {
        setPurgePreview(json)
      } else {
        toast.error(json.error || 'Erreur lors du chargement')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setLoadingPurgePreview(false)
    }
  }

  async function handlePurgeData() {
    setPurging(true)
    try {
      const res = await fetch('/api/account/purge', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        toast.success(json.message || 'Messages supprimés')
        setPurgeDialogOpen(false)
        setPurgePreview(null)
      } else {
        toast.error(json.error || 'Erreur lors de la purge')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setPurging(false)
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
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Paramètres</h1>
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

        {/* Abonnement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Abonnement
            </CardTitle>
            <CardDescription>Gérez votre abonnement Autyvia.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Consultez le statut de votre abonnement, souscrivez ou gérez votre paiement.
            </p>
            <Link href="/subscription">
              <Button variant="outline">
                <CreditCard className="mr-2 h-4 w-4" />
                Gérer mon abonnement
              </Button>
            </Link>
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
              Vos données
            </CardTitle>
            <CardDescription>
              Exportez toutes vos données personnelles (RGPD).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Téléchargez une archive ZIP contenant toutes vos données : profil, sessions,
              contacts, conversations, messages, agents IA, documents, campagnes et équipes.
            </p>
            <Button onClick={handleExportData} disabled={exporting} variant="outline">
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exporter mes données
            </Button>
          </CardContent>
        </Card>

        {/* Documents juridiques */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Documents juridiques
            </CardTitle>
            <CardDescription>
              Consultez nos documents légaux et notre politique de confidentialité.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <Link
                href="/privacy"
                target="_blank"
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium">Politique de confidentialité</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/cgu"
                target="_blank"
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium">Conditions Générales d&apos;Utilisation</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/cgv"
                target="_blank"
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium">Conditions Générales de Vente</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/legal"
                target="_blank"
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium">Mentions légales</span>
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
              Rétention des données
            </CardTitle>
            <CardDescription>
              Définissez la durée de conservation de vos messages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="data-retention">Durée de conservation</Label>
              <Select
                value={formDataRetention === null ? 'null' : String(formDataRetention)}
                onValueChange={(value) => {
                  setFormDataRetention(value === 'null' ? null : Number(value))
                }}
              >
                <SelectTrigger id="data-retention">
                  <SelectValue placeholder="Sélectionnez une durée" />
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
                Les messages plus anciens que cette durée seront automatiquement supprimés.
                Les conversations et contacts seront conservés.
              </p>
            </div>

            {formDataRetention !== null && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="inline-block h-4 w-4 mr-1" />
                  Les messages de plus de {formDataRetention} mois seront purgés automatiquement.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Enregistrer
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
                  Purger maintenant
                </Button>
              )}
            </div>
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

      {/* Dialog de confirmation de purge */}
      <AlertDialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Purger les anciens messages
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
                      Vous êtes sur le point de supprimer définitivement les messages
                      de plus de <strong>{profile?.data_retention_months} mois</strong>.
                    </p>
                    {purgePreview.messages_to_delete > 0 ? (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="inline-block h-4 w-4 mr-1" />
                          <strong>{purgePreview.messages_to_delete}</strong> message(s) seront supprimés.
                          {purgePreview.cutoff_date && (
                            <span className="block mt-1 text-xs">
                              Messages antérieurs au {new Date(purgePreview.cutoff_date).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                        <p className="text-sm text-green-600 dark:text-green-400">
                          Aucun message à supprimer. Tous vos messages sont récents.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p>Erreur lors du chargement de l&apos;aperçu.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handlePurgeData()
              }}
              disabled={purging || !purgePreview || purgePreview.messages_to_delete === 0}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {purging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Purger les messages
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
