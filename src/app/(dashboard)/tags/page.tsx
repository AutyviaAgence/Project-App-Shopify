'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BlobLoaderScreen } from '@/components/blob-loader'

// Tags puis Lifecycle ont été intégrés dans la page Conversations.
// On redirige toute visite de /tags vers /conversations.
export default function TagsRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/conversations')
  }, [router])
  return <BlobLoaderScreen />
}
