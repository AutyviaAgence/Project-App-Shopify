'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Team, TeamMember, Profile, WhatsAppSession, AIAgent, WALink } from '@/types/database'
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
import { Checkbox } from '@/components/ui/checkbox'
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
  Ticket,
  MessageSquare,
  Bot,
  Link2,
} from 'lucide-react'

type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member' }

type TeamMemberWithProfile = TeamMember & {
  profile?: Profile | null
}

type TeamInvitation = {
  id: string
  code: string
  role: 'admin' | 'member'
  allowed_session_ids: string[] | null
  allowed_agent_ids: string[] | null
  allowed_link_ids: string[] | null
  used_by: string | null
  expires_at: string | null
  created_at: string
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<TeamWithRole | null>(null)
  const [members, setMembers] = useState<TeamMemberWithProfile[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Invitation state
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [links, setLinks] = useState<WALink[]>([])
  const [selectedSessions, setSelectedSessions] = useState<string[]>([])
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [selectedLinks, setSelectedLinks] = useState<string[]>([])
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<TeamInvitation[]>([])
  const [invitationsLoading, setInvitationsLoading] = useState(false)

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

  async function openInviteDialog(team: TeamWithRole) {
    setSelectedTeam(team)
    setInviteRole('member')
    setSelectedSessions([])
    setSelectedAgents([])
    setSelectedLinks([])
    setGeneratedCode(null)
    setInviteDialogOpen(true)

    // Charger les ressources et invitations existantes
    setResourcesLoading(true)
    setInvitationsLoading(true)

    try {
      const [sessionsRes, agentsRes, linksRes, invitationsRes] = await Promise.all([
        fetch('/api/sessions'),
        fetch('/api/agents'),
        fetch('/api/links'),
        fetch(`/api/teams/${team.id}/invitations`)
      ])

      const [sessionsJson, agentsJson, linksJson, invitationsJson] = await Promise.all([
        sessionsRes.json(),
        agentsRes.json(),
        linksRes.json(),
        invitationsRes.json()
      ])

      // Filtrer uniquement les ressources appartenant à cette équipe
      setSessions(sessionsJson.data?.filter((s: WhatsAppSession) => s.team_id === team.id) || [])
      setAgents(agentsJson.data?.filter((a: AIAgent) => a.team_id === team.id) || [])
      setLinks(linksJson.data?.filter((l: WALink) => l.team_id === team.id) || [])
      setInvitations(invitationsJson.data || [])
    } catch {
      toast.error('Erreur lors du chargement des ressources')
    } finally {
      setResourcesLoading(false)
      setInvitationsLoading(false)
    }
  }

  async function generateInviteCode() {
    if (!selectedTeam) return

    setGeneratingInvite(true)
    try {
      const res = await fetch(`/api/teams/${selectedTeam.id}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: inviteRole,
          allowed_session_ids: selectedSessions.length > 0 ? selectedSessions : null,
          allowed_agent_ids: selectedAgents.length > 0 ? selectedAgents : null,
          allowed_link_ids: selectedLinks.length > 0 ? selectedLinks : null,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setGeneratedCode(json.data.code)
        setInvitations(prev => [json.data, ...prev])
        toast.success('Code d\'invitation généré !')
      } else {
        toast.error(json.error || 'Erreur lors de la génération')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setGeneratingInvite(false)
    }
  }

  async function deleteInvitation(invitationId: string) {
    if (!selectedTeam) return

    try {
      const res = await fetch(`/api/teams/${selectedTeam.id}/invitations/${invitationId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setInvitations(prev => prev.filter(i => i.id !== invitationId))
        toast.success('Invitation supprimée')
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur réseau')
    }
  }

  function toggleSession(sessionId: string) {
    setSelectedSessions(prev =>
      prev.includes(sessionId)
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    )
  }

  function toggleAgent(agentId: string) {
    setSelectedAgents(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    )
  }

  function toggleLink(linkId: string) {
    setSelectedLinks(prev =>
      prev.includes(linkId)
        ? prev.filter(id => id !== linkId)
        : [...prev, linkId]
    )
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
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="font-mono"
                  maxLength={6}
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
                  <CardTitle className="text-base truncate">{team.name}</CardTitle>
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
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openInviteDialog(team)}
                        className="h-8"
                      >
                        <Ticket className="mr-1.5 h-3.5 w-3.5" />
                        Inviter
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditDialog(team)}
                        className="h-8 w-8 p-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </>
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
              Créez une équipe puis invitez des membres avec des codes d&apos;invitation.
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
              Gérez les membres de votre équipe.
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

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inviter un membre</DialogTitle>
            <DialogDescription>
              Générez un code d&apos;invitation à usage unique avec les permissions souhaitées.
            </DialogDescription>
          </DialogHeader>

          {generatedCode ? (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-4 p-6 bg-muted/50 rounded-xl">
                <p className="text-sm text-muted-foreground">Code d&apos;invitation généré :</p>
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-mono font-bold tracking-wider">{generatedCode}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyCode(generatedCode)}
                  >
                    {copiedCode === generatedCode ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Partagez ce code. Il ne peut être utilisé qu&apos;une seule fois.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setGeneratedCode(null)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Générer un autre code
              </Button>
            </div>
          ) : (
            <div className="space-y-6 py-2">
              {/* Role selection */}
              <div className="space-y-2">
                <Label>Rôle</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'member')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Membre</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {resourcesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Sessions */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquare className="h-4 w-4 text-[#7DC2A5]" />
                      Sessions WhatsApp
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {selectedSessions.length === 0 ? 'Toutes' : `${selectedSessions.length}/${sessions.length}`}
                      </Badge>
                    </div>
                    {sessions.length > 0 ? (
                      <div className="space-y-2 pl-1">
                        {sessions.map(session => (
                          <label
                            key={session.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedSessions.includes(session.id)}
                              onCheckedChange={() => toggleSession(session.id)}
                            />
                            <span className="text-sm">{session.instance_name}</span>
                            <Badge variant="outline" className="ml-auto text-xs">
                              {session.status}
                            </Badge>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground pl-6">Aucune session dans cette équipe</p>
                    )}
                    <p className="text-xs text-muted-foreground pl-6">
                      {selectedSessions.length === 0 ? 'Accès à toutes les sessions' : 'Accès limité aux sessions sélectionnées'}
                    </p>
                  </div>

                  {/* Agents */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Bot className="h-4 w-4 text-[#40E9BE]" />
                      Agents IA
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {selectedAgents.length === 0 ? 'Tous' : `${selectedAgents.length}/${agents.length}`}
                      </Badge>
                    </div>
                    {agents.length > 0 ? (
                      <div className="space-y-2 pl-1">
                        {agents.map(agent => (
                          <label
                            key={agent.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedAgents.includes(agent.id)}
                              onCheckedChange={() => toggleAgent(agent.id)}
                            />
                            <span className="text-sm">{agent.name}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground pl-6">Aucun agent dans cette équipe</p>
                    )}
                    <p className="text-xs text-muted-foreground pl-6">
                      {selectedAgents.length === 0 ? 'Accès à tous les agents' : 'Accès limité aux agents sélectionnés'}
                    </p>
                  </div>

                  {/* Links */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Link2 className="h-4 w-4 text-[#7DC2A5]" />
                      Liens WhatsApp
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {selectedLinks.length === 0 ? 'Tous' : `${selectedLinks.length}/${links.length}`}
                      </Badge>
                    </div>
                    {links.length > 0 ? (
                      <div className="space-y-2 pl-1">
                        {links.map(link => (
                          <label
                            key={link.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedLinks.includes(link.id)}
                              onCheckedChange={() => toggleLink(link.id)}
                            />
                            <span className="text-sm">{link.name}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground pl-6">Aucun lien dans cette équipe</p>
                    )}
                    <p className="text-xs text-muted-foreground pl-6">
                      {selectedLinks.length === 0 ? 'Accès à tous les liens' : 'Accès limité aux liens sélectionnés'}
                    </p>
                  </div>
                </>
              )}

              <Button
                onClick={generateInviteCode}
                disabled={generatingInvite || resourcesLoading}
                className="w-full"
              >
                {generatingInvite ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Ticket className="mr-2 h-4 w-4" />
                )}
                Générer le code
              </Button>

              {/* Existing invitations */}
              {!invitationsLoading && invitations.filter(i => !i.used_by).length > 0 && (
                <div className="space-y-3 pt-4 border-t">
                  <p className="text-sm font-medium text-muted-foreground">Codes actifs</p>
                  <div className="space-y-2">
                    {invitations.filter(i => !i.used_by).map(invitation => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-medium">{invitation.code}</span>
                          <Badge variant="outline" className="text-xs">
                            {invitation.role}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => copyCode(invitation.code)}
                          >
                            {copiedCode === invitation.code ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteInvitation(invitation.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
