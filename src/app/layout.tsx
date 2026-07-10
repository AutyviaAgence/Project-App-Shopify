import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
// CSS du canvas React Flow (campagnes). Importé ici et non via @import Tailwind
// ni dans le composant dynamic ssr:false, où il n'était pas appliqué → le canvas
// rendait des nœuds invisibles et des contrôles sans style.
import '@xyflow/react/dist/style.css'
import { Toaster } from 'sonner'
import { ThemeProvider } from 'next-themes'
import { LanguageProvider } from '@/i18n/context'
import { TenantProvider } from '@/lib/tenant/context'
import { PostHogProvider } from '@/lib/posthog/provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'WhatsApp AI Platform',
  description: 'Plateforme SaaS WhatsApp multi-session avec agents IA',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo-xeyo.svg" type="image/svg+xml" />
      </head>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <PostHogProvider>
            <LanguageProvider>
              <TenantProvider>
                {children}
                <Toaster richColors position="bottom-right" />
              </TenantProvider>
            </LanguageProvider>
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
