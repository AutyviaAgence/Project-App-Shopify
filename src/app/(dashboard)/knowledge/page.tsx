'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BlobLoaderScreen } from '@/components/blob-loader'

// La Bibliothèque a été regroupée dans la page Ressources (onglet Bibliothèque).
export default function KnowledgeRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/ressources?tab=bibliotheque')
  }, [router])
  return <BlobLoaderScreen />
}
