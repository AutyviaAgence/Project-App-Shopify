'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BlobLoaderScreen } from '@/components/blob-loader'

// La page Liens a été regroupée dans la page Ressources (onglet Liens).
export default function LinksRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/ressources?tab=liens')
  }, [router])
  return <BlobLoaderScreen />
}
