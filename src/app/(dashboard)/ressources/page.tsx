'use client'

import { Suspense } from 'react'
import { BookOpen } from 'lucide-react'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { LibrarySection } from './_components/library-section'

/**
 * Page Connaissances — la base de connaissances qui alimente l'agent IA (RAG).
 * (Les liens WhatsApp/QR ont été déplacés vers /acquisition.)
 */
function ConnaissancesContent() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 pt-4 sm:px-6" data-tour="resources-header">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Connaissances
        </h1>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          Les documents et informations que votre agent IA utilise pour répondre à vos clients.
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <LibrarySection />
      </div>
    </div>
  )
}

export default function RessourcesPage() {
  return (
    <Suspense fallback={<BlobLoaderScreen />}>
      <ConnaissancesContent />
    </Suspense>
  )
}
