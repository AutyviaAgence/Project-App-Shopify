'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  BarChart3,
  LogOut,
  Settings,
  ScrollText,
  HelpCircle,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CreditCard,
  Workflow,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardTopBar } from '@/components/dashboard-topbar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { BlobLoaderScreen } from '@/components/blob-loader'
import dynamic from 'next/dynamic'

const TourProvider = dynamic(() => import('@/components/guided-tour').then(m => ({ default: m.TourProvider })), {
  ssr: false,
})
import { SubscriptionBanner } from '@/components/subscription-banner'
import { useSubscription } from '@/hooks/use-subscription'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'

const NAV_ITEMS_KEYS = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/conversations', labelKey: 'nav.conversations', icon: MessageSquare },
  { href: '/agents', labelKey: 'nav.agents', icon: Bot },
  { href: '/templates', labelKey: 'nav.templates', icon: FileText },
  { href: '/automations', labelKey: 'nav.automations', label: 'Automatisations', icon: Workflow },
  { href: '/stats', labelKey: 'nav.stats', icon: BarChart3 },
]

const BOTTOM_NAV_KEYS = [
  { href: '/help', labelKey: 'nav.help', label: 'Aide', icon: HelpCircle },
  { href: '/logs', labelKey: 'nav.logs', icon: ScrollText },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
]

// Pages accessibles même sans abonnement actif
const ALLOWED_WITHOUT_SUBSCRIPTION = ['/subscription', '/settings', '/admin', '/help']

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pinned, setPinned] = useState(true)   // sidebar épinglée ouverte par défaut (desktop)
  const [hovered, setHovered] = useState(false)  // survol → élargissement temporaire
  const [profile, setProfile] = useState<{ full_name?: string | null; avatar_url?: string | null } | null>(null)
  // Sur desktop, la sidebar est « large » si épinglée ou survolée.
  const expanded = pinned || hovered
  const { subscription, loading: subscriptionLoading, refetch: refetchSubscription } = useSubscription()
  const { t } = useTranslation()
  const tenant = useTenant()

  const plan = subscription?.plan ?? null
  const isAdmin = subscription?.role === 'admin'

  const NAV_ITEMS = useMemo(() =>
    NAV_ITEMS_KEYS
      .map(item => ({ ...item, label: (item as { label?: string }).label || t(item.labelKey) })),
    [t]
  )
  const BOTTOM_NAV_ITEMS = useMemo(() => {
    const isAdminRole = subscription?.role === 'admin'
    // Logs reserve aux admins
    const items = BOTTOM_NAV_KEYS
      .filter(item => item.href !== '/logs' || isAdminRole)
      .map(item => ({ ...item, label: (item as { label?: string }).label || t(item.labelKey) }))
    if (isAdminRole) {
      items.unshift({ href: '/admin', labelKey: 'nav.admin', label: 'Admin', icon: ShieldCheck })
    }
    return items
  }, [t, subscription?.role])

  // Vérifier si la page actuelle est accessible sans abonnement
  const isAllowedPage = ALLOWED_WITHOUT_SUBSCRIPTION.some(
    p => pathname === p || pathname.startsWith(p + '/')
  )

  // Nouveau modèle : accès direct (essai libre). Plus de redirection forcée
  // vers le configurateur/welcome-v2. Les limites (conversations/tokens IA)
  // sont gérées au cas par cas ; l'abonnement se gère depuis /subscription.
  // Blocage niveau 2 : a un plan mais subscription inactive (past_due/canceled)
  const isBlocked = !isAdmin && subscription && !!plan && !subscription.isActive && !isAllowedPage

  // Feature gating : Lifecycle est désormais universel (remplace Tags). Seule
  // l'analyse IA dedans est gated par plan (géré dans la page elle-même).
  const isPlanBlocked = false

  // Close sidebar on route change (mobile) + escape key
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Rafraîchir l'abonnement au changement de page
  useEffect(() => {
    refetchSubscription()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  // Profil (avatar du bas de sidebar)
  useEffect(() => {
    let active = true
    fetch('/api/profile')
      .then(r => (r.ok ? r.json() : null))
      .then(json => { if (active && json?.data) setProfile(json.data) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const handleSignOut = useCallback(async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error(t('nav.signout_error'))
      return
    }
    router.push('/login')
    router.refresh()
  }, [router, t])

  // Lien de nav. Mobile : pleine largeur + libellé. Desktop : carré 56px replié,
  // ou pleine largeur + libellé quand la sidebar est élargie (épinglée/survolée).
  // Quand la sidebar est épinglée (collée au panneau), l'onglet actif prend le
  // fond du panneau (--background) et se raccorde via des coins inversés.
  const NavLink = ({ item }: { item: typeof NAV_ITEMS[0] }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    // Effet « languette » uniquement quand la sidebar est épinglée (pas au survol,
    // où elle flotte encore) et large.
    const tab = pinned
    return (
      <Link
        href={item.href}
        title={!expanded ? item.label : undefined}
        className={cn(
          'group relative flex items-center gap-3 text-[15px] font-medium transition-all duration-200',
          'rounded-xl px-3 py-3',
          expanded
            ? 'md:w-full md:justify-start md:px-3 md:py-2.5'
            : 'md:h-12 md:w-12 md:justify-center md:gap-0 md:px-0 md:py-0',
          isActive
            ? tab
              // Languette : fond = panneau, arrondi à gauche, traverse le padding
              // de la sidebar (px-2 nav + p-2 aside = -mr-4) pour coller au panneau.
              ? 'md:-mr-4 md:rounded-r-none md:rounded-l-xl md:bg-background md:text-foreground'
              : 'bg-white/10 text-white ring-1 ring-white/15'
            : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
        )}
      >
        {/* Coins inversés : raccordent l'onglet au panneau (haut + bas) */}
        {isActive && tab && (
          <>
            <span className="pointer-events-none absolute -top-3 right-0 hidden h-3 w-4 bg-background md:block" aria-hidden>
              <span className="absolute inset-0 rounded-br-[12px] bg-[var(--sidebar)]" />
            </span>
            <span className="pointer-events-none absolute -bottom-3 right-0 hidden h-3 w-4 bg-background md:block" aria-hidden>
              <span className="absolute inset-0 rounded-tr-[12px] bg-[var(--sidebar)]" />
            </span>
          </>
        )}
        <item.icon className="h-[22px] w-[22px] shrink-0" />
        <span className={cn(expanded ? 'md:inline' : 'md:hidden')}>{item.label}</span>
      </Link>
    )
  }

  return (
    <TourProvider plan={plan ?? undefined}>
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--sidebar)]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — carte flottante (style Framer). Repliée : 81px (icônes).
          Élargie (épinglée ou survolée) : 240px avec libellés. Mobile : drawer. */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          'group/sidebar fixed inset-y-0 left-0 z-50 flex w-[260px] max-w-[80vw] flex-col bg-[var(--sidebar)] transition-all duration-300',
          'md:relative md:inset-y-auto md:m-2 md:mr-0 md:h-[calc(100dvh-1rem)] md:max-w-none md:p-2',
          // Épinglée : colle au panneau (pas d'arrondi à droite). Sinon : carte arrondie.
          pinned ? 'md:rounded-l-[10px] md:rounded-r-none' : 'md:rounded-[10px]',
          expanded ? 'md:w-[240px]' : 'md:w-[81px]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo & Close + flèche pin (desktop) */}
        <div className={cn(
          'relative flex h-[60px] items-center px-5 md:h-auto md:px-0 md:pb-2 md:pt-1',
          expanded ? 'justify-between md:px-2' : 'justify-between md:justify-center'
        )}>
          <Link href="/dashboard" className="flex items-center gap-3">
            <Image src={tenant.logoUrl} alt={tenant.appName} width={40} height={40} className="h-10 w-10 md:h-9 md:w-9" />
            <span className={cn('text-2xl font-bold text-white', expanded ? 'md:inline' : 'md:hidden')}>{tenant.appName}</span>
          </Link>

          {/* Mobile : fermer */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Desktop : flèche pour épingler/ouvrir la sidebar */}
          <button
            onClick={() => setPinned(p => !p)}
            title={pinned ? 'Réduire le menu' : 'Agrandir le menu'}
            className={cn(
              'hidden h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-all hover:bg-white/15 hover:text-white md:flex',
              expanded ? '' : 'md:absolute md:-right-1 md:top-1/2 md:-translate-y-1/2 md:opacity-0 md:group-hover/sidebar:opacity-100'
            )}
          >
            {expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className={cn(
          'flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden px-3 py-2 md:flex md:flex-col md:gap-2 md:space-y-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          expanded ? 'md:items-stretch md:px-2' : 'md:items-center md:px-0'
        )}>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>

        {/* Bas : nav secondaire + déconnexion + avatar */}
        <div className={cn(
          'space-y-1.5 px-3 py-2 md:flex md:flex-col md:gap-2 md:space-y-0',
          expanded ? 'md:items-stretch md:px-2' : 'md:items-center md:px-0'
        )}>
          {BOTTOM_NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          <button
            onClick={handleSignOut}
            title={!expanded ? t('nav.signout') : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl text-[15px] font-medium text-white/55 transition-all duration-200 hover:bg-white/[0.06] hover:text-white',
              'px-3 py-3',
              expanded ? 'md:w-full md:justify-start md:px-3 md:py-2.5' : 'md:h-12 md:w-12 md:justify-center md:gap-0 md:px-0 md:py-0'
            )}
          >
            <LogOut className="h-[22px] w-[22px] shrink-0" />
            <span className={cn(expanded ? 'md:inline' : 'md:hidden')}>{t('nav.signout')}</span>
          </button>

          {/* Avatar */}
          <Link
            href="/settings"
            title={profile?.full_name || 'Profil'}
            className={cn(
              'mt-1 flex items-center gap-3 rounded-xl px-3 py-2',
              expanded ? 'md:justify-start md:px-3' : 'md:justify-center md:px-0'
            )}
          >
            <Avatar size="default" className="ring-1 ring-white/15">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name || 'Profil'} />}
              <AvatarFallback className="bg-white/10 text-[11px] font-semibold text-white">
                {(profile?.full_name || '').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '·'}
              </AvatarFallback>
            </Avatar>
            <span className={cn('text-sm font-medium text-white/80', expanded ? 'md:inline' : 'md:hidden')}>{profile?.full_name || 'Profil'}</span>
          </Link>
        </div>
      </aside>

      {/* Main content — panneau. Collé à la sidebar quand elle est épinglée
          (l'onglet actif s'y raccorde via la languette), sinon flottant. */}
      <div className={cn(
        'relative flex flex-1 flex-col overflow-hidden bg-background md:my-2 md:mr-2 md:shadow-2xl',
        // Anneau seulement quand le panneau flotte (non épinglé) : sinon il dessine
        // un liseré sur le bord gauche, juste là où la languette doit fusionner.
        pinned ? 'md:ml-0 md:rounded-l-none md:rounded-r-[20px]' : 'md:ml-2 md:rounded-[20px] md:ring-1 md:ring-black/5 dark:md:ring-white/10'
      )}>
        {/* Topbar globale : menu mobile (gauche) + cloche/réglages/profil (droite) */}
        <DashboardTopBar onOpenSidebar={() => setSidebarOpen(true)} />

        {/* Subscription banner */}
        <SubscriptionBanner subscription={subscription} />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-transparent">
          {subscriptionLoading ? (
            <BlobLoaderScreen />
          ) : isPlanBlocked ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md text-center space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <CreditCard className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-foreground">Upgrade requis</h2>
                  <p className="text-muted-foreground">
                    {pathname.startsWith('/campaigns')
                      ? 'Les campagnes broadcast sont disponibles uniquement avec le plan Scale.'
                      : 'Le module Lifecycle est disponible à partir du plan Pro.'}
                  </p>
                </div>
                <Link
                  href="/subscription"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <CreditCard className="h-5 w-5" />
                  Voir les plans
                </Link>
              </div>
            </div>
          ) : isBlocked ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md text-center space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-foreground">{t('blocked.title')}</h2>
                  <p className="text-muted-foreground">
                    {subscription?.status === 'canceled'
                      ? t('blocked.cancelled')
                      : subscription?.status === 'past_due'
                        ? t('blocked.expired', { appName: tenant.appName })
                        : t('blocked.trial_ended', { appName: tenant.appName })}
                  </p>
                </div>
                <Link
                  href="/subscription"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <CreditCard className="h-5 w-5" />
                  {t('blocked.manage_subscription')}
                </Link>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in-up h-full w-full">
              {children}
            </div>
          )}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t bg-background safe-area-bottom md:hidden">
        {[
          { href: '/dashboard', icon: LayoutDashboard, label: t('nav.home') },
          { href: '/conversations', icon: MessageSquare, label: t('nav.chat') },
          { href: '/agents', icon: Bot, label: t('common.agents') },
          { href: '/settings', icon: Settings, label: t('nav.config') },
        ].map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Spacer for mobile bottom nav */}
      <div className="h-16 md:hidden" />
    </div>
    </TourProvider>
  )
}
