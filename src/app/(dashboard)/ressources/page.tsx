'use client'

import { Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, Link2, Library } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { LibrarySection } from './_components/library-section'
import { LinksSection } from './_components/links-section'

type TabKey = 'bibliotheque' | 'liens'

function RessourcesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab: TabKey = rawTab === 'liens' ? 'liens' : 'bibliotheque'

  const onTabChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`/ressources?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  return (
    <div className="flex flex-col h-full">
      {/* Header unifié + onglets */}
      <div className="border-b px-6 pt-4" data-tour="resources-header">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Library className="h-5 w-5 text-primary" />
          Ressources
        </h1>
        <Tabs value={tab} onValueChange={onTabChange} className="mt-3">
          <TabsList variant="line">
            <TabsTrigger value="bibliotheque">
              <BookOpen className="h-4 w-4" />
              Bibliothèque
            </TabsTrigger>
            <TabsTrigger value="liens">
              <Link2 className="h-4 w-4" />
              Liens
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Contenu de la section active */}
      <div className="flex-1 min-h-0">
        {tab === 'liens' ? <LinksSection /> : <LibrarySection />}
      </div>
    </div>
  )
}

export default function RessourcesPage() {
  return (
    <Suspense fallback={<BlobLoaderScreen />}>
      <RessourcesContent />
    </Suspense>
  )
}
