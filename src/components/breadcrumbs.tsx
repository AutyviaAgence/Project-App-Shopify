'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  sessions: 'Sessions',
  conversations: 'Conversations',
  agents: 'Agents IA',
  knowledge: 'Base de connaissances',
  links: 'Liens WhatsApp',
  stats: 'Statistiques',
  settings: 'Paramètres',
}

export function Breadcrumbs() {
  const pathname = usePathname()

  // Parse path segments
  const segments = pathname.split('/').filter(Boolean)

  // Don't show breadcrumbs for single-segment paths (e.g., /dashboard)
  if (segments.length <= 1) {
    return null
  }

  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const label = ROUTE_LABELS[segment] || segment
    const isLast = index === segments.length - 1

    return {
      href,
      label,
      isLast,
    }
  })

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground px-6 py-3 border-b bg-muted/20">
      <Link
        href="/dashboard"
        className="flex items-center hover:text-foreground transition-colors"
      >
        <Home className="h-4 w-4" />
      </Link>

      {breadcrumbs.map((crumb, index) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
