'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BlobLoaderScreen } from '@/components/blob-loader'

// La page Tags a été fusionnée dans Lifecycle (étiquettes multiples).
// On redirige toute visite de /tags vers /lifecycle.
export default function TagsRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/lifecycle')
  }, [router])
  return <BlobLoaderScreen />
}
