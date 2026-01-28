'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Users, CheckCircle, XCircle, LogIn } from 'lucide-react'
import Link from 'next/link'

type InvitationData = {
  team: {
    id: string
    name: string
    slug: string | null
  }
  role: string
}

export default function JoinTeamPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)

  useEffect(() => {
    async function fetchInvitation() {
      try {
        const res = await fetch(`/api/teams/join/${token}`)
        const json = await res.json()

        if (!res.ok) {
          setError(json.error || 'Invitation invalide')
          return
        }

        setInvitation(json.data)
      } catch {
        setError('Erreur de connexion')
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      fetchInvitation()
    }
  }, [token])

  async function handleJoin() {
    setJoining(true)
    try {
      const res = await fetch(`/api/teams/join/${token}`, {
        method: 'POST',
      })
      const json = await res.json()

      if (res.status === 401) {
        // Non authentifié - rediriger vers login
        setNeedsAuth(true)
        setJoining(false)
        return
      }

      if (!res.ok) {
        toast.error(json.error || 'Erreur lors de la jonction')
        setJoining(false)
        return
      }

      setSuccess(true)
      toast.success(`Vous avez rejoint l'équipe ${json.data.team.name}`)

      // Rediriger vers le dashboard après 2 secondes
      setTimeout(() => {
        router.push('/teams')
      }, 2000)
    } catch {
      toast.error('Erreur réseau')
      setJoining(false)
    }
  }

  const roleLabels: Record<string, string> = {
    owner: 'Propriétaire',
    admin: 'Administrateur',
    member: 'Membre',
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] dark:bg-[#1A252C]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] dark:bg-[#1A252C] p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-lg p-8 text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="mt-6 text-xl font-bold">Invitation invalide</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Link href="/login">
            <Button className="mt-6 w-full">
              Retour à la connexion
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] dark:bg-[#1A252C] p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-lg p-8 text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-[#7DC2A5]/10">
            <CheckCircle className="h-8 w-8 text-[#7DC2A5]" />
          </div>
          <h1 className="mt-6 text-xl font-bold">Bienvenue dans l&apos;équipe !</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vous avez rejoint <strong>{invitation?.team.name}</strong> en tant que {roleLabels[invitation?.role || 'member']}.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Redirection en cours...
          </p>
        </div>
      </div>
    )
  }

  if (needsAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] dark:bg-[#1A252C] p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-lg p-8 text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-[#7DC2A5]/10">
            <LogIn className="h-8 w-8 text-[#7DC2A5]" />
          </div>
          <h1 className="mt-6 text-xl font-bold">Connexion requise</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vous devez vous connecter ou créer un compte pour rejoindre l&apos;équipe <strong>{invitation?.team.name}</strong>.
          </p>
          <div className="mt-6 space-y-3">
            <Link href={`/login?redirect=/join/${token}`}>
              <Button className="w-full">
                Se connecter
              </Button>
            </Link>
            <Link href={`/register?redirect=/join/${token}`}>
              <Button variant="outline" className="w-full">
                Créer un compte
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] dark:bg-[#1A252C] p-4">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-lg p-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-gradient-to-br from-[#7DC2A5] to-[#40E9BE]">
            <Users className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-6 text-xl font-bold">Invitation à rejoindre une équipe</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vous avez été invité à rejoindre l&apos;équipe suivante
          </p>
        </div>

        {/* Team info */}
        <div className="mt-8 rounded-xl bg-muted/50 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#7DC2A5]/10 text-[#7DC2A5] font-bold text-lg">
              {invitation?.team.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold">{invitation?.team.name}</p>
              <p className="text-sm text-muted-foreground">
                Rôle : {roleLabels[invitation?.role || 'member']}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 space-y-3">
          <Button
            onClick={handleJoin}
            disabled={joining}
            className="w-full h-11"
          >
            {joining ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Jonction en cours...
              </>
            ) : (
              <>
                <Users className="mr-2 h-4 w-4" />
                Rejoindre l&apos;équipe
              </>
            )}
          </Button>
          <Link href="/dashboard">
            <Button variant="ghost" className="w-full">
              Annuler
            </Button>
          </Link>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          En rejoignant, vous aurez accès aux ressources partagées de l&apos;équipe.
        </p>
      </div>
    </div>
  )
}
