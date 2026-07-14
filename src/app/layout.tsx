import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
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
        {/*
          ⚠️ APP BRIDGE DOIT ÊTRE LE TOUT PREMIER <script> DU <head>.

          Shopify l'exige, et son script le VÉRIFIE : s'il porte `async`, `defer`
          ou `type=module`, ou s'il n'est pas premier, il lève
          « must be included as the first <script> tag […] Aborting » et
          s'interrompt. `window.shopify` n'existe alors jamais, `idToken()` non
          plus, toutes les requêtes embedded partent SANS session token → 401, et
          l'app affiche « Installation requise » sans aucune trace côté serveur.

          C'est exactement ce qui se passait : `<Script strategy="beforeInteractive">`
          de next/script ajoute `async`. On écrit donc le tag EN DUR ici, dans le
          root layout, avant tout le reste.

          Le client_id est PUBLIC par nature (présent dans chaque URL OAuth) — le
          mettre en dur n'expose rien. Le secret (SHOPIFY_API_SECRET) reste, lui,
          strictement côté serveur.

          Ce script est chargé sur TOUTES les pages : hors admin Shopify il est
          simplement inerte (~20 ko, mis en cache par le CDN).

          ⚠️ Il logue alors « App Bridge Next: missing required configuration
          fields: shop » dans la console. C'est BRUYANT MAIS INOFFENSIF : hors de
          l'iframe Shopify, App Bridge n'a rien à faire et rien ne dépend de lui.
          NE PAS « corriger » en le déplaçant dans un layout imbriqué (/shopify) :
          il ne serait plus le premier <script> du <head> et s'aborterait — c'est
          précisément le bug qui faisait afficher « Installation requise » pendant
          des heures. Le silence de la console ne vaut pas ce risque.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          data-api-key={
            process.env.SHOPIFY_API_KEY ||
            process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ||
            'f9d37d1f9ab1427165874c33eb7c4926'
          }
        />
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
