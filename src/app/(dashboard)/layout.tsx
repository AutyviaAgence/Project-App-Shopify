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
  Smartphone,
  Bot,
  Library,
  BarChart3,
  LogOut,
  Settings,
  ScrollText,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CreditCard,
  Workflow,
  ShieldCheck,
  ClipboardList,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { AlertsDropdown } from '@/components/alerts-dropdown'
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
  { href: '/sessions', labelKey: 'nav.sessions', icon: Smartphone },
  { href: '/agents', labelKey: 'nav.agents', icon: Bot },
  { href: '/ressources', labelKey: 'nav.resources', icon: Library },
  { href: '/lifecycle', labelKey: 'nav.lifecycle', icon: Workflow },
  { href: '/stats', labelKey: 'nav.stats', icon: BarChart3 },
]

const BOTTOM_NAV_KEYS = [
  { href: '/logs', labelKey: 'nav.logs', icon: ScrollText },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
]

// Pages accessibles même sans abonnement actif
const ALLOWED_WITHOUT_SUBSCRIPTION = ['/subscription', '/settings', '/admin', '/onboarding', '/welcome', '/welcome-v2', '/studio']

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
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
      .map(item => ({ ...item, label: t(item.labelKey) }))
    if (isAdminRole) {
      items.unshift({ href: '/admin', labelKey: 'nav.admin', label: 'Admin', icon: ShieldCheck })
    }
    return items
  }, [t, subscription?.role])

  const auditStatus = subscription?.auditStatus ?? 'none'
  const isWelcomePage = pathname.startsWith('/welcome')

  // Vérifier si la page actuelle est accessible sans abonnement
  const isAllowedPage = ALLOWED_WITHOUT_SUBSCRIPTION.some(
    p => pathname === p || pathname.startsWith(p + '/')
  )

  // Rediriger vers /welcome si pas de plan actif
  const shouldRedirectToWelcome =
    !isAdmin &&
    !subscriptionLoading &&
    subscription &&
    !plan &&
    !subscription.isActive &&
    !isAllowedPage &&
    !isWelcomePage

  const isPending = false
  const isOnboardingOnly = false

  // Blocage niveau 2 : a un plan mais subscription inactive (past_due/canceled)
  const isBlocked = !isAdmin && subscription && !!plan && !subscription.isActive && !isAllowedPage

  // Feature gating : Lifecycle est désormais universel (remplace Tags). Seule
  // l'analyse IA dedans est gated par plan (géré dans la page elle-même).
  const isPlanBlocked = false

  // Rediriger vers /welcome-v2 si pas de plan actif
  useEffect(() => {
    if (shouldRedirectToWelcome) {
      router.replace('/welcome-v2')
    }
  }, [shouldRedirectToWelcome, router])

  // Close sidebar on route change (mobile) + escape key
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Rafraîchir l'abonnement quand on quitte le configurateur (pour cacher la bannière après soumission)
  useEffect(() => {
    if (!pathname.startsWith('/onboarding/configurateur')) {
      refetchSubscription()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
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

  const NavLink = ({ item, showLabel = true }: { item: typeof NAV_ITEMS[0]; showLabel?: boolean }) => {
    const studioAliases = ['/agents/[id]/workflow']
    const isActive = pathname === item.href
      || pathname.startsWith(item.href + '/')
      || (item.href === '/studio' && studioAliases.some(p => pathname === p || pathname.startsWith(p + '/')))
    return (
      <Link
        href={item.href}
        className={cn(
          'group relative flex items-center gap-4 px-4 py-4 text-[16px] font-semibold transition-all duration-200',
          isActive
            // Onglet actif : couleur du panneau (--background), arrondi à gauche, colle au bord droit
            // (le panneau est colle ml-0) → fusion sans debordement ni scroll
            ? 'rounded-l-2xl rounded-r-none bg-background text-foreground md:shadow-[-6px_0_16px_-8px_rgba(0,0,0,0.3)]'
            : 'mr-3 rounded-2xl text-white/70 hover:bg-white/10 hover:text-white',
          collapsed && 'justify-center px-2 mr-0'
        )}
        title={collapsed ? item.label : undefined}
      >
        {/* Coins inversés : raccordent l'onglet au panneau (effet "languette") */}
        {isActive && !collapsed && (
          <>
            <span className="pointer-events-none absolute -top-3 right-0 hidden h-3 w-3 bg-background md:block" aria-hidden>
              <span className="absolute inset-0 rounded-br-[12px] bg-[var(--sidebar)]" />
            </span>
            <span className="pointer-events-none absolute -bottom-3 right-0 hidden h-3 w-3 bg-background md:block" aria-hidden>
              <span className="absolute inset-0 rounded-tr-[12px] bg-[var(--sidebar)]" />
            </span>
          </>
        )}
        <item.icon className="h-[25px] w-[25px] shrink-0" />
        {showLabel && (
          <span className={cn(
            'transition-all duration-200',
            collapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'
          )}>
            {item.label}
          </span>
        )}
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

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-[var(--sidebar)] transition-all duration-300 md:relative md:bg-transparent',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          collapsed ? 'w-[84px]' : 'w-[280px] max-w-[85vw] md:w-[300px] md:max-w-none'
        )}
      >
        {/* Logo & Close */}
        <div className={cn(
          'relative flex h-[76px] items-center px-5',
          collapsed ? 'justify-center px-4' : 'justify-between'
        )}>
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-3">
              <Image src={tenant.logoUrl} alt={tenant.appName} width={44} height={44} className="h-11 w-11" />
              <span className="text-2xl font-bold text-white">{tenant.appName}</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/dashboard">
              <Image src={tenant.logoUrl} alt={tenant.appName} width={38} height={38} className="h-[38px] w-[38px]" />
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden py-3 pl-3 pr-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} showLabel={!collapsed} />
          ))}
        </nav>

        {/* Bottom section — pr-0 comme le haut pour que l'onglet actif fusionne
            avec le panneau (sinon separation de couleur a droite) */}
        <div className="py-3 pl-3 pr-0 space-y-1.5">
          {BOTTOM_NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} showLabel={!collapsed} />
          ))}

          <button
            onClick={handleSignOut}
            className={cn(
              'group mr-3 flex w-[calc(100%-0.75rem)] items-center gap-4 rounded-2xl px-4 py-4 text-[16px] font-semibold text-white/70 transition-all duration-200 hover:bg-white/10 hover:text-white',
              collapsed && 'mr-0 w-full justify-center px-2'
            )}
            title={collapsed ? t('nav.signout') : undefined}
          >
            <LogOut className="h-[25px] w-[25px] shrink-0" />
            {!collapsed && <span>{t('nav.signout')}</span>}
          </button>
        </div>

        {/* Collapse toggle (desktop only) — en haut a droite de la sidebar */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          className="absolute right-3 top-6 z-[60] hidden h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 shadow-lg backdrop-blur transition-all hover:scale-110 hover:bg-white/15 hover:text-white md:flex"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </aside>

      {/* Main content — panneau arrondi flottant. Fond global = --sidebar (plus foncé),
          panneau = --background (moins foncé) → démarcation nette en clair ET sombre. */}
      <div className="relative flex flex-1 flex-col overflow-hidden bg-background md:m-3 md:ml-0 md:rounded-[28px] md:shadow-2xl md:ring-1 md:ring-black/5 dark:md:ring-white/10">
        {/* Plus de barre de notif : menu mobile (gauche) + cloche (droite) flottants
            au-dessus du contenu, sans bandeau pleine largeur. */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute left-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-muted-foreground backdrop-blur hover:bg-muted hover:text-foreground md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="absolute right-3 top-3 z-30 md:right-5 md:top-4">
          <AlertsDropdown />
        </div>

        {/* Rappel configurateur : affiché pendant l'audit si le formulaire n'a pas été soumis */}
        {auditStatus === 'acompte_paid' &&
          subscription &&
          !subscription.configurateurSubmitted &&
          !pathname.startsWith('/onboarding') && (
          <Link
            href="/onboarding/configurateur"
            className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2.5 text-white hover:bg-amber-600 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ClipboardList className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium truncate">
                Action requise : remplissez le configurateur pour que nous puissions préparer votre plateforme.
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 text-sm font-semibold">
              Compléter
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        )}

        {/* Subscription banner */}
        <SubscriptionBanner subscription={subscription} />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-transparent [&_[data-page-header]]:md:pr-14">
          {subscriptionLoading ? (
            <BlobLoaderScreen />
          ) : isPending ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md text-center space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Workflow className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-foreground">Bienvenue sur {tenant.appName}</h2>
                  <p className="text-muted-foreground">
                    Pour accéder à votre espace, démarrez la mise en place de votre plateforme WhatsApp IA.
                  </p>
                </div>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <Workflow className="h-5 w-5" />
                  Démarrer la mise en place
                </Link>
              </div>
            </div>
          ) : isOnboardingOnly ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md text-center space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Workflow className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-foreground">Mise en place en cours</h2>
                  <p className="text-muted-foreground">
                    Votre acompte a été reçu. Complétez le configurateur pour que nous puissions préparer votre plateforme.
                  </p>
                </div>
                <Link
                  href="/onboarding/configurateur"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <Workflow className="h-5 w-5" />
                  Compléter le configurateur
                </Link>
              </div>
            </div>
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
          { href: '/ressources', icon: Library, label: t('nav.resources') },
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
