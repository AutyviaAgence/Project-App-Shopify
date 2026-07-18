'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, Settings } from 'lucide-react'
import { AlertsDropdown } from '@/components/alerts-dropdown'
import { TourGuideButton } from '@/components/guided-tour'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { UsageBar } from '@/components/usage-bar'
import { cn } from '@/lib/utils'

type Profile = { full_name?: string | null; avatar_url?: string | null }

/**
 * Barre du haut globale (toutes les pages du dashboard).
 * À droite : cloche (alertes) · réglages · avatar profil.
 * À gauche (mobile) : bouton menu pour ouvrir la sidebar.
 */
export function DashboardTopBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/profile')
      .then(r => (r.ok ? r.json() : null))
      .then(json => { if (active && json?.data) setProfile(json.data) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const initials = (profile?.full_name || '')
    .split(' ')
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '·'

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4 md:px-5">
      {/* Menu mobile */}
      <button
        onClick={onOpenSidebar}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Consommation IA du mois, barre pleine largeur, lien vers /subscription */}
      <div className="flex flex-1 items-center px-1 md:px-3">
        <UsageBar />
      </div>

      {/* Actions à droite */}
      <div className="flex items-center gap-1.5">
        {/* Emplacement rempli par la page courante (ex : bascule Messagerie/Tableau
            dans Conversations) via un portail sur cet id. */}
        <div id="topbar-slot" className="flex items-center" />

        {/* Guide interactif — relançable à tout moment. */}
        <TourGuideButton />

        <AlertsDropdown />

        <Link
          href="/settings"
          aria-label="Réglages"
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
          )}
        >
          <Settings className="h-[18px] w-[18px]" />
        </Link>

        <Link href="/settings" aria-label="Profil" className="ml-1 rounded-full ring-offset-2 ring-offset-background transition-all hover:ring-2 hover:ring-border">
          <Avatar size="default">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name || 'Profil'} />}
            <AvatarFallback className="text-[11px] font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  )
}
