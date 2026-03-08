'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Shield,
  FileText,
  ScrollText,
  Scale,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/lib/tenant/context'

const LEGAL_PAGES = [
  { href: '/privacy', label: 'Politique de confidentialité', icon: Shield },
  { href: '/cgu', label: "Conditions d'utilisation", icon: FileText },
  { href: '/cgv', label: 'Conditions de vente', icon: ScrollText },
  { href: '/legal', label: 'Mentions légales', icon: Scale },
]

interface LegalPageLayoutProps {
  children: React.ReactNode
  title: string
  description?: string
  lastUpdated: string
}

export function LegalPageLayout({ children, title, description, lastUpdated }: LegalPageLayoutProps) {
  const pathname = usePathname()
  const tenant = useTenant()

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm dark:bg-slate-950/80">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <Image src={tenant.logoUrl} alt={tenant.appName} width={36} height={36} className="h-9 w-9" />
            <span className="text-xl font-bold text-slate-900 dark:text-white">{tenant.appName}</span>
          </Link>
          <Button variant="outline" size="sm" asChild>
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Link>
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[280px_1fr] lg:gap-12">
          {/* Sidebar Navigation */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <nav className="space-y-1 rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900">
              <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Documents légaux
              </p>
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
                    <page.icon className="h-4 w-4" />
                    {page.label}
                  </Link>
                )
              })}
            </nav>

            {/* Contact Card */}
            <div className="mt-6 rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900">
              <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
                Contact
              </p>
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <a
                  href="mailto:autyviaagence@gmail.com"
                  className="flex items-center gap-2 hover:text-primary"
                >
                  <Mail className="h-4 w-4" />
                  autyviaagence@gmail.com
                </a>
                <a href="tel:+33636006808" className="flex items-center gap-2 hover:text-primary">
                  <Phone className="h-4 w-4" />
                  06 36 00 68 08
                </a>
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  778 routes des barthes
                </p>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main>
            {/* Page Header */}
            <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm dark:bg-slate-900 lg:p-8">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white lg:text-3xl">
                {title}
              </h1>
              {description && (
                <p className="mt-2 text-slate-600 dark:text-slate-400">{description}</p>
              )}
              <p className="mt-4 text-sm text-slate-500">
                Dernière mise à jour : {lastUpdated}
              </p>
            </div>

            {/* Content */}
            <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-slate-900 lg:p-8">
              <div className="prose prose-slate max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h3:text-lg prose-h3:font-medium prose-h3:mt-6 prose-h3:mb-3 prose-p:text-slate-600 dark:prose-p:text-slate-400 prose-li:text-slate-600 dark:prose-li:text-slate-400 prose-strong:text-slate-900 dark:prose-strong:text-white prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
                {children}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-4 text-sm text-slate-500 shadow-sm dark:bg-slate-900">
              <p>
                © {new Date().getFullYear()} Autyvia - Julian TOURAILLE-TRAN
              </p>
              <p>SIRET : 992 684 829 00011</p>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
