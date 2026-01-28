'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Team, TeamMember, Profile } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { toast } from 'sonner'
import {
  Plus,
  Users,
  Copy,
  Trash2,
  Pencil,
  Loader2,
  Crown,
  Shield,
  UserIcon,
  LogOut,
  Check,
  KeyRound,
} from 'lucide-react'

type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member'; join_code?: string }

type TeamMemberWithProfile = TeamMember & {
  profile?: Profile | null
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<TeamWithRole | null>(null)
  const [members, setMembers] = useState<TeamMemberWithProfile[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams')
      const json = await res.json()
      if (res.ok && json.data) {
        setTeams(json.data)
      }
    } catch {
      toast.error('Erreur lors du chargement des équipes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  async function fetchMembers(teamId: string) {
    setMembersLoading(true)
    try {
      const res = await fetch(`/api/teams/${teamId}/members`)
      const json = await res.json()
      if (res.ok && json.data) {
        setMembers(json.data)
      }
    } catch {
      toast.error('Erreur lors du chargement des membres')
    } finally {
      setMembersLoading(false)
    }
  }

  function openCreateDialog() {
    setFormName('')
    setCreateDialogOpen(true)
  }

  function openEditDialog(team: TeamWithRole) {
    setSelectedTeam(team)
    setFormName(team.name)
    setEditDialogOpen(true)
  }

  function openMembersDialog(team: TeamWithRole) {
    setSelectedTeam(team)
    setMembers([])
    fetchMembers(team.id)
    setMembersDialogOpen(true)
  }

  function openDeleteDialog(team: TeamWithRole) {
    setSelectedTeam(team)
    setDeleteDialogOpen(true)
  }

  async function handleCreate() {
    if (!formName.trim()) {
      toast.error('Nom requis')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim() }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setTeams((prev) => [json.data, ...prev])
        toast.success('Équipe créée')
        setCreateDialogOpen(false)
      } else {
        toast.error(json.error || 'Erreur lors de la création')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit() {
    if (!selectedTeam || !formName.trim()) return

    setSaving(true)
    try {
      const res = await fetch(`/api/teams/${selectedTeam.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim() }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setTeams((prev) => prev.map((t) => (t.id === selectedTeam.id ? json.data : t)))
        toast.success('Équipe modifiée')
        setEditDialogOpen(false)
      } else {
        toast.error(json.error || 'Erreur lors de la modification')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedTeam) return

    setSaving(true)
    try {
      const res = await fetch(`/api/teams/${selectedTeam.id}`, { method: 'DELETE' })
      if (res.ok) {
        setTeams((prev) => prev.filter((t) => t.id !== selectedTeam.id))
        toast.success('Équipe supprimée')
        setDeleteDialogOpen(false)
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  async function handleJoinWithCode() {
    if (!joinCode.trim()) {
      toast.error('Entrez un code')
      return
    }

    setJoining(true)
    try {
      const res = await fetch('/api/teams/join-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode.trim() }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        toast.success(`Vous avez rejoint l'équipe ${json.data.team.name}`)
        setJoinCode('')
        fetchTeams()
      } else {
        toast.error(json.error || 'Code invalide')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setJoining(false)
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!selectedTeam) return

    try {
      const res = await fetch(`/api/teams/${selectedTeam.id}/members/${memberId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== memberId))
        toast.success('Membre retiré')
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur réseau')
    }
  }

  async function handleChangeMemberRole(memberId: string, role: 'admin' | 'member') {
    if (!selectedTeam) return

    try {
      const res = await fetch(`/api/teams/${selectedTeam.id}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)))
        toast.success('Rôle modifié')
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur réseau')
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    toast.success('Code copié !')
    setTimeout(() => setCopiedCode(null), 2000)
  }

  function getRoleIcon(role: string) {
    switch (role) {
      case 'owner':
        return <Crown className="h-3 w-3" />
      case 'admin':
        return <Shield className="h-3 w-3" />
      default:
        return <UserIcon className="h-3 w-3" />
    }
  }

  function getRoleBadge(role: string) {
    switch (role) {
      case 'owner':
        return <Badge className="gap-1 bg-[#7DC2A5] hover:bg-[#7DC2A5]/80"><Crown className="h-3 w-3" />Propriétaire</Badge>
      case 'admin':
        return <Badge variant="secondary" className="gap-1"><Shield className="h-3 w-3" />Admin</Badge>
      default:
        return <Badge variant="outline" className="gap-1"><UserIcon className="h-3 w-3" />Membre</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl md:text-2xl font-bold">Équipes</h1>
        <p className="text-sm text-muted-foreground">
          Créez ou rejoignez une équipe pour partager vos ressources.
        </p>
      </div>

      {/* Join with code */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="join-code" className="text-xs text-muted-foreground">
                Rejoindre avec un code
              </Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="join-code"
                  placeholder="AUTY-XXXX"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="font-mono"
                  maxLength={9}
                />
                <Button onClick={handleJoinWithCode} disabled={joining || !joinCode.trim()}>
                  {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                  Rejoindre
                </Button>
              </div>
            </div>
            <div className="hidden sm:block border-l mx-4" />
            <div className="flex items-end">
              <Button onClick={openCreateDialog} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Créer une équipe
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Teams list */}
      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-medium">Aucune équipe</h3>
            <p className="mt-1 text-sm text-muted-foreground text-center">
              Créez une équipe ou rejoignez-en une avec un code.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Card key={team.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{team.name}</CardTitle>
                    {team.join_code && (team.my_role === 'owner' || team.my_role === 'admin') && (
                      <button
                        onClick={() => copyCode(team.join_code!)}
                        className="mt-1 inline-flex items-center gap-1.5 text-xs font-mono bg-muted px-2 py-1 rounded hover:bg-muted/80 transition-colors"
                      >
                        {copiedCode === team.join_code ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {team.join_code}
                      </button>
                    )}
                  </div>
                  {getRoleBadge(team.my_role)}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openMembersDialog(team)}
                    className="h-8"
                  >
                    <Users className="mr-1.5 h-3.5 w-3.5" />
                    Membres
                  </Button>
                  {(team.my_role === 'owner' || team.my_role === 'admin') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditDialog(team)}
                      className="h-8 w-8 p-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {team.my_role === 'owner' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(team)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle équipe</DialogTitle>
            <DialogDescription>
              Un code de jonction sera généré automatiquement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="team-name">Nom de l&apos;équipe</Label>
              <Input
                id="team-name"
                placeholder="Mon équipe"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <Button onClick={handleCreate} disabled={saving || !formName.trim()} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Créer l&apos;équipe
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier l&apos;équipe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-team-name">Nom de l&apos;équipe</Label>
              <Input
                id="edit-team-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
              />
            </div>
            {selectedTeam?.join_code && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Code de jonction</Label>
                <div className="flex gap-2">
                  <Input value={selectedTeam.join_code} readOnly className="font-mono" />
                  <Button variant="outline" size="icon" onClick={() => copyCode(selectedTeam.join_code!)}>
                    {copiedCode === selectedTeam.join_code ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Partagez ce code pour que d&apos;autres personnes puissent rejoindre votre équipe.
                </p>
              </div>
            )}
            <Button onClick={handleEdit} disabled={saving || !formName.trim()} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Membres de {selectedTeam?.name}</DialogTitle>
            <DialogDescription>
              {selectedTeam?.join_code && (selectedTeam?.my_role === 'owner' || selectedTeam?.my_role === 'admin') && (
                <span className="inline-flex items-center gap-2 mt-2">
                  Code de jonction :
                  <button
                    onClick={() => copyCode(selectedTeam.join_code!)}
                    className="inline-flex items-center gap-1.5 font-mono bg-muted px-2 py-1 rounded hover:bg-muted/80 transition-colors"
                  >
                    {copiedCode === selectedTeam.join_code ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {selectedTeam.join_code}
                  </button>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {membersLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-auto">
                {members.filter(m => m.status === 'accepted').map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-xl border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#7DC2A5] to-[#40E9BE] text-white text-sm font-medium">
                        {member.profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {member.profile?.full_name || 'Utilisateur'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.profile?.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.role !== 'owner' && selectedTeam?.my_role === 'owner' && (
                        <Select
                          value={member.role}
                          onValueChange={(v) => handleChangeMemberRole(member.id, v as 'admin' | 'member')}
                        >
                          <SelectTrigger className="h-8 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Membre</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {member.role === 'owner' && (
                        <Badge className="h-7 bg-[#7DC2A5]">Propriétaire</Badge>
                      )}
                      {member.role !== 'owner' && (selectedTeam?.my_role === 'owner' || selectedTeam?.my_role === 'admin') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {members.filter(m => m.status === 'accepted').length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    Aucun membre
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l&apos;équipe ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les membres perdront l&apos;accès aux ressources partagées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
