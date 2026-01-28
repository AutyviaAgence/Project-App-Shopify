'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Team, TeamMember, Profile } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  Link2,
} from 'lucide-react'

type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member' }

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

  // Form state
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)

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
    setFormSlug('')
    setCreateDialogOpen(true)
  }

  function openEditDialog(team: TeamWithRole) {
    setSelectedTeam(team)
    setFormName(team.name)
    setFormSlug(team.slug || '')
    setEditDialogOpen(true)
  }

  function openMembersDialog(team: TeamWithRole) {
    setSelectedTeam(team)
    setMembers([])
    setInvitationUrl(null)
    setInviteRole('member')
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
        body: JSON.stringify({
          name: formName.trim(),
          slug: formSlug.trim() || undefined,
        }),
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
        body: JSON.stringify({
          name: formName.trim(),
          slug: formSlug.trim() || null,
        }),
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

  async function handleCreateInvitation() {
    if (!selectedTeam) return

    setSaving(true)
    try {
      const res = await fetch(`/api/teams/${selectedTeam.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: inviteRole }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setInvitationUrl(json.data.invitation_url)
        setMembers((prev) => [...prev, json.data])
        toast.success('Lien d\'invitation créé')
      } else {
        toast.error(json.error || 'Erreur lors de la création')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
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

  function copyInvitationLink() {
    if (invitationUrl) {
      navigator.clipboard.writeText(invitationUrl)
      toast.success('Lien copié !')
    }
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
        return <Badge variant="default" className="gap-1"><Crown className="h-3 w-3" />Propriétaire</Badge>
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
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Équipes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez vos équipes et invitez des collaborateurs.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle équipe
        </Button>
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Aucune équipe</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Créez une équipe pour partager vos ressources avec vos collaborateurs.
            </p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Créer une équipe
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{team.name}</CardTitle>
                  {getRoleBadge(team.my_role)}
                </div>
                {team.slug && (
                  <CardDescription className="text-xs">/{team.slug}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openMembersDialog(team)}
                  >
                    <Users className="mr-1 h-3 w-3" />
                    Membres
                  </Button>
                  {(team.my_role === 'owner' || team.my_role === 'admin') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditDialog(team)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                  {team.my_role === 'owner' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(team)}
                    >
                      <Trash2 className="h-3 w-3" />
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
              Créez une équipe pour partager sessions, agents et documents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="team-name">Nom de l&apos;équipe *</Label>
              <Input
                id="team-name"
                placeholder="Mon équipe"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-slug">Identifiant (optionnel)</Label>
              <Input
                id="team-slug"
                placeholder="mon-equipe"
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
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
              <Label htmlFor="edit-team-name">Nom de l&apos;équipe *</Label>
              <Input
                id="edit-team-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-team-slug">Identifiant</Label>
              <Input
                id="edit-team-slug"
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
              />
            </div>
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
              Gérez les membres et créez des liens d&apos;invitation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Invitation section */}
            {selectedTeam && (selectedTeam.my_role === 'owner' || selectedTeam.my_role === 'admin') && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <h4 className="text-sm font-medium mb-3">Inviter un membre</h4>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Rôle</Label>
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'member')}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Membre</SelectItem>
                        {selectedTeam.my_role === 'owner' && (
                          <SelectItem value="admin">Admin</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" onClick={handleCreateInvitation} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
                    Créer lien
                  </Button>
                </div>
                {invitationUrl && (
                  <div className="mt-3 flex gap-2">
                    <Input value={invitationUrl} readOnly className="text-xs h-8" />
                    <Button size="sm" variant="outline" onClick={copyInvitationLink}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Members list */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Membres ({members.filter(m => m.status === 'accepted').length})</h4>
              {membersLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-auto">
                  {members.filter(m => m.status === 'accepted').map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                          {getRoleIcon(member.role)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {member.profile?.full_name || member.profile?.email || 'Utilisateur'}
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
                            <SelectTrigger className="h-7 w-24 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Membre</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {member.role === 'owner' && (
                          <Badge variant="default" className="h-7">Propriétaire</Badge>
                        )}
                        {member.role !== 'owner' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <LogOut className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Pending invitations */}
                  {members.filter(m => m.status === 'pending').length > 0 && (
                    <>
                      <h5 className="text-xs font-medium text-muted-foreground mt-4">Invitations en attente</h5>
                      {members.filter(m => m.status === 'pending').map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between rounded-lg border border-dashed p-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              <Link2 className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm">Invitation ({member.role})</p>
                              <p className="text-xs text-muted-foreground">
                                En attente d&apos;acceptation
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
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
              Les ressources de l&apos;équipe ne seront pas supprimées mais n&apos;auront plus d&apos;équipe associée.
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
