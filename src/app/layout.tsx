import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { ThemeProvider } from 'next-themes'
import { LanguageProvider } from '@/i18n/context'
import { TenantProvider } from '@/lib/tenant/context'
import { getTenantFromCookies } from '@/lib/tenant/server'

const inter = Inter({ subsets: ['latin'] })

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenantFromCookies()
  return {
    title: `${tenant.appName} — WhatsApp AI Platform`,
    description: 'Plateforme SaaS WhatsApp multi-session avec agents IA',
    icons: tenant.faviconUrl ? { icon: tenant.faviconUrl } : undefined,
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tenant = await getTenantFromCookies()
  return (
    <html suppressHydrationWarning>
      {tenant.faviconUrl && (
        <head>
          <link rel="icon" href={tenant.faviconUrl} />
        </head>
      )}
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            <TenantProvider>
              {children}
              <Toaster richColors position="bottom-right" />
            </TenantProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
