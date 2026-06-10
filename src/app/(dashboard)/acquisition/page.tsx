'use client'

import { Suspense } from 'react'
import { Link2 } from 'lucide-react'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { LinksSection } from '../ressources/_components/links-section'

/**
 * Page Acquisition — points d'entrée WhatsApp (liens wa.me + QR codes).
 * Canal d'acquisition indépendant de Shopify : à afficher en boutique
 * physique, sur les réseaux, les emballages, etc.
 */
function AcquisitionContent() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 pt-4 sm:px-6">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          Acquisition
        </h1>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          Générez des liens WhatsApp et QR codes à partager pour que vos clients démarrent une conversation.
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <LinksSection />
      </div>
    </div>
  )
}

export default function AcquisitionPage() {
  return (
    <Suspense fallback={<BlobLoaderScreen />}>
      <AcquisitionContent />
    </Suspense>
  )
}
