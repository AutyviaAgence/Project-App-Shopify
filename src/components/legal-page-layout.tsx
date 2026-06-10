'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  Shield,
  FileText,
  ScrollText,
  Scale,
  ArrowLeft,
  Mail,
  Calendar,
  ChevronRight,
} from 'lucide-react'
import { useTenant } from '@/lib/tenant/context'

const LEGAL_PAGES = [
  { href: '/privacy', label: 'Politique de confidentialité', icon: Shield, color: 'text-blue-500' },
  { href: '/cgu', label: "Conditions d'utilisation", icon: FileText, color: 'text-violet-500' },
  { href: '/cgv', label: 'Conditions de vente', icon: ScrollText, color: 'text-emerald-500' },
  { href: '/legal', label: 'Mentions légales', icon: Scale, color: 'text-amber-500' },
]

interface TocItem {
  id: string
  text: string
  level: number
}

interface LegalPageLayoutProps {
  children: React.ReactNode
  title: string
  description?: string
  lastUpdated: string
  /** Contenu anglais (affiché par défaut). Si fourni, un sélecteur FR/EN apparaît. */
  childrenEn?: React.ReactNode
  titleEn?: string
  descriptionEn?: string
  lastUpdatedEn?: string
}

export function LegalPageLayout({
  children, title, description, lastUpdated,
  childrenEn, titleEn, descriptionEn, lastUpdatedEn,
}: LegalPageLayoutProps) {
  const pathname = usePathname()
  const tenant = useTenant()
  const contentRef = useRef<HTMLDivElement>(null)
  const [toc, setToc] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string>('')
  // Langue des documents légaux : anglais par défaut (exigences Meta/Google/Shopify)
  const hasEn = childrenEn != null
  const [lang, setLang] = useState<'en' | 'fr'>(hasEn ? 'en' : 'fr')
  const displayTitle = lang === 'en' && titleEn ? titleEn : title
  const displayDescription = lang === 'en' && descriptionEn ? descriptionEn : description
  const displayLastUpdated = lang === 'en' && lastUpdatedEn ? lastUpdatedEn : lastUpdated
  const displayChildren = lang === 'en' && hasEn ? childrenEn : children

  // Générer la table des matières depuis les h2
  useEffect(() => {
    if (!contentRef.current) return
    const headings = contentRef.current.querySelectorAll('h2')
    const items: TocItem[] = []
    headings.forEach((h, i) => {
      if (!h.id) h.id = `section-${i}`
      items.push({ id: h.id, text: h.textContent || '', level: 2 })
    })
    setToc(items)
  }, [children])

  // Highlight section active au scroll
  useEffect(() => {
    if (toc.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
            break
          }
        }
      },
      { rootMargin: '-20% 0% -70% 0%', threshold: 0 }
    )
    toc.forEach(item => {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [toc])

  const currentPage = LEGAL_PAGES.find(p => p.href === pathname)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md dark:bg-slate-950/90">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <Image src={tenant.logoUrl} alt={tenant.appName} width={28} height={28} className="h-7 w-7" />
            <span className="text-base font-semibold text-slate-900 dark:text-white">{tenant.appName}</span>
          </Link>
          <div className="flex items-center gap-3">
            {hasEn && (
              <div className="flex items-center rounded-lg border bg-white p-0.5 text-xs dark:bg-slate-900">
                <button
                  onClick={() => setLang('en')}
                  className={cn('rounded-md px-2 py-1 font-medium transition-colors',
                    lang === 'en' ? 'bg-primary text-primary-foreground' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}
                >EN</button>
                <button
                  onClick={() => setLang('fr')}
                  className={cn('rounded-md px-2 py-1 font-medium transition-colors',
                    lang === 'fr' ? 'bg-primary text-primary-foreground' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}
                >FR</button>
              </div>
            )}
            <Link
              href="/login"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {lang === 'en' ? 'Back' : 'Retour'}
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 lg:py-10">
        <div className="grid gap-6 lg:grid-cols-[240px_1fr_200px] lg:gap-8 xl:grid-cols-[260px_1fr_220px]">

          {/* Sidebar gauche — navigation */}
          <aside className="lg:sticky lg:top-20 lg:h-fit space-y-4">
            <nav className="rounded-xl border bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Documents légaux
                </p>
              </div>
              <div className="p-2">
                {LEGAL_PAGES.map((page) => {
                  const isActive = pathname === page.href
                  return (
                    <Link
                      key={page.href}
                      href={page.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                      )}
                    >
                      <page.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-current' : page.color)} />
                      {page.label}
                      {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />}
                    </Link>
                  )
                })}
              </div>
            </nav>

            {/* Contact */}
            <div className="rounded-xl border bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Contact</p>
              </div>
              <div className="p-4 space-y-2.5">
                <a
                  href="mailto:contact@autyvia.fr"
                  className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-primary transition-colors"
                >
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">contact@autyvia.fr</span>
                </a>
              </div>
            </div>
          </aside>

          {/* Contenu principal */}
          <main className="min-w-0">
            {/* Hero du document */}
            <div className="mb-6 rounded-xl border bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-primary to-primary/40" />
              <div className="p-6 lg:p-8">
                <div className="flex items-start gap-4">
                  {currentPage && (
                    <div className={cn('mt-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 p-2.5 shrink-0')}>
                      <currentPage.icon className={cn('h-5 w-5', currentPage.color)} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white lg:text-3xl leading-tight">
                      {displayTitle}
                    </h1>
                    {displayDescription && (
                      <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                        {displayDescription}
                      </p>
                    )}
                    <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
                      <Calendar className="h-3.5 w-3.5" />
                      {lang === 'en' ? 'Last updated: ' : 'Dernière mise à jour : '}
                      <span className="font-medium text-slate-500">{displayLastUpdated}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Corps du document */}
            <div className="rounded-xl border bg-white dark:bg-slate-900 shadow-sm p-6 lg:p-8">
              <div
                ref={contentRef}
                className="prose prose-slate max-w-none dark:prose-invert
                  prose-headings:scroll-mt-24
                  prose-h2:text-lg prose-h2:font-semibold prose-h2:mt-10 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-100 dark:prose-h2:border-slate-800 prose-h2:text-slate-900 dark:prose-h2:text-white prose-h2:first:mt-0
                  prose-h3:text-base prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-2 prose-h3:text-slate-800 dark:prose-h3:text-slate-200
                  prose-p:text-slate-600 dark:prose-p:text-slate-400 prose-p:leading-relaxed prose-p:text-sm
                  prose-li:text-slate-600 dark:prose-li:text-slate-400 prose-li:text-sm
                  prose-strong:text-slate-900 dark:prose-strong:text-white prose-strong:font-semibold
                  prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                  prose-table:text-sm
                  prose-th:bg-slate-50 dark:prose-th:bg-slate-800 prose-th:font-semibold
                  prose-td:text-slate-600 dark:prose-td:text-slate-400
                "
              >
                {displayChildren}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white dark:bg-slate-900 px-5 py-3 text-xs text-slate-400 shadow-sm">
              <p>© {new Date().getFullYear()} Xeyo — Julian TOURAILLE-TRAN</p>
              <p>SIRET : 992 684 829 00011</p>
            </div>
          </main>

          {/* Sidebar droite — table des matières */}
          {toc.length > 0 && (
            <aside className="hidden lg:block lg:sticky lg:top-20 lg:h-fit">
              <div className="rounded-xl border bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Sur cette page
                  </p>
                </div>
                <nav className="p-3 space-y-0.5">
                  {toc.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={cn(
                        'block rounded-md px-3 py-1.5 text-xs leading-snug transition-all',
                        activeId === item.id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                      )}
                    >
                      {item.text}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
