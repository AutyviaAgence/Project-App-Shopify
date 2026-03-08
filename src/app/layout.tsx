import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { ThemeProvider } from 'next-themes'
import { LanguageProvider } from '@/i18n/context'
import { TenantProvider } from '@/lib/tenant/context'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Autyvia — WhatsApp AI Platform',
  description: 'Plateforme SaaS WhatsApp multi-session avec agents IA',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html suppressHydrationWarning>
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
