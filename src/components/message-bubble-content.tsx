'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, FileText, Download, Eye, EyeOff, Image as ImageIcon, Mic, Play } from 'lucide-react'
import { toast } from 'sonner'
import type { Message } from '@/types/database'

type ExtendedMessage = Message & {
  agent_name?: string
}

export function MessageBubbleContent({ msg, isOutbound }: { msg: ExtendedMessage; isOutbound: boolean }) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  const [transcription, setTranscription] = useState<string | null>(msg.transcription || null)
  const [showTranscription, setShowTranscription] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const isMediaType = ['image', 'audio', 'video', 'document'].includes(msg.message_type)
  const hasStoredMedia = !!msg.media_url

  // Charger l'URL signée du média
  const loadMedia = useCallback(async () => {
    if (mediaUrl || mediaLoading || !hasStoredMedia || mediaError) return
    setMediaLoading(true)
    try {
      const res = await fetch(`/api/media/${msg.id}`)
      const json = await res.json()
      if (res.ok && json.url) {
        setMediaUrl(json.url)
      } else {
        setMediaError(true)
      }
    } catch {
      setMediaError(true)
    } finally {
      setMediaLoading(false)
    }
  }, [mediaUrl, mediaLoading, hasStoredMedia, mediaError, msg.id])

  // Auto-load média pour images, audio, vidéo
  useEffect(() => {
    if (hasStoredMedia && isMediaType && msg.message_type !== 'document') {
      loadMedia()
    }
  }, [hasStoredMedia, isMediaType, msg.message_type, loadMedia])

  // Transcription on-demand
  async function handleTranscribe() {
    if (transcription) {
      setShowTranscription(!showTranscription)
      return
    }
    setTranscribing(true)
    try {
      const res = await fetch(`/api/messages/${msg.id}/transcribe`, { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.transcription) {
        setTranscription(json.transcription)
        setShowTranscription(true)
      } else {
        toast.error(json.error || 'Transcription échouée')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setTranscribing(false)
    }
  }

  // Messages texte ou types sans média : rendu simple
  if (msg.message_type === 'text' || !isMediaType) {
    const content = msg.content || ''
    const isHtml = /^\s*(<(!doctype|html|body|head)\b|<[a-z]+[^>]*>[\s\S]*<\/[a-z]+>)/i.test(content)
    if (isHtml) {
      return (
        <iframe
          srcDoc={content}
          sandbox="allow-same-origin"
          className="w-full min-h-[120px] max-h-[600px] rounded border-0 bg-white"
          style={{ colorScheme: 'light' }}
          onLoad={(e) => {
            const iframe = e.currentTarget
            const body = iframe.contentDocument?.body
            if (body) {
              iframe.style.height = Math.min(body.scrollHeight + 16, 600) + 'px'
            }
          }}
        />
      )
    }
    return (
      <p className="whitespace-pre-wrap break-words text-sm">
        {content}
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      {/* Rendu Image */}
      {msg.message_type === 'image' && (
        hasStoredMedia ? (
          mediaLoading ? (
            <div className="w-[240px] h-[160px] bg-muted/50 rounded-lg animate-pulse flex items-center justify-center">
              <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
            </div>
          ) : mediaUrl ? (
            <img
              src={mediaUrl}
              alt={msg.content || 'Image'}
              className="max-w-[280px] max-h-[300px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity object-cover"
              onClick={() => setLightboxOpen(true)}
              loading="lazy"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
              <span>{msg.content || '[Image]'}</span>
            </div>
          )
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
        )
      )}

      {/* Rendu Audio */}
      {msg.message_type === 'audio' && (
        hasStoredMedia ? (
          mediaLoading ? (
            <div className="w-[240px] h-[42px] bg-muted/50 rounded-full animate-pulse flex items-center justify-center">
              <Mic className="h-4 w-4 text-muted-foreground/50" />
            </div>
          ) : mediaUrl ? (
            <audio controls className="max-w-[280px] h-[42px]" preload="metadata">
              <source src={mediaUrl} type={msg.media_mime_type || 'audio/ogg'} />
            </audio>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mic className="h-4 w-4" />
              <span>Message vocal</span>
            </div>
          )
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
        )
      )}

      {/* Rendu Vidéo */}
      {msg.message_type === 'video' && (
        hasStoredMedia ? (
          mediaLoading ? (
            <div className="w-[240px] h-[160px] bg-muted/50 rounded-lg animate-pulse flex items-center justify-center">
              <Play className="h-6 w-6 text-muted-foreground/50" />
            </div>
          ) : mediaUrl ? (
            <video controls className="max-w-[280px] rounded-lg" preload="metadata">
              <source src={mediaUrl} type={msg.media_mime_type || 'video/mp4'} />
            </video>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
          )
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
        )
      )}

      {/* Rendu Document */}
      {msg.message_type === 'document' && (
        <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3 max-w-[280px]">
          <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {msg.content?.match(/Document\s*:\s*(.+?)[\]]/)?.[1] || 'Document'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {msg.media_mime_type || 'Document'}
            </p>
          </div>
          {hasStoredMedia && (
            mediaUrl ? (
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
                onClick={(e) => {
                  if (!mediaUrl) {
                    e.preventDefault()
                    loadMedia()
                  }
                }}
              >
                <Download className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
              </a>
            ) : mediaLoading ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            ) : (
              <button onClick={loadMedia} className="shrink-0">
                <Download className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
              </button>
            )
          )}
        </div>
      )}

      {/* Caption pour images avec légende */}
      {msg.message_type === 'image' && msg.content && !msg.content.startsWith('[') && (
        <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
      )}

      {/* Bouton transcription */}
      {hasStoredMedia && ['audio', 'image', 'document'].includes(msg.message_type) && (
        <button
          onClick={handleTranscribe}
          disabled={transcribing}
          className={`flex items-center gap-1.5 text-[10px] transition-colors mt-0.5 ${
            isOutbound
              ? 'text-white/60 hover:text-white/90'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {transcribing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : showTranscription ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
          {transcription
            ? (showTranscription ? 'Masquer la transcription' : 'Afficher la transcription')
            : (msg.message_type === 'audio' ? 'Transcrire' : msg.message_type === 'image' ? 'Décrire' : 'Analyser')}
        </button>
      )}

      {/* Bloc transcription */}
      {showTranscription && transcription && (
        <div className={`text-xs rounded-lg p-2 mt-0.5 italic ${
          isOutbound
            ? 'bg-white/10 text-white/80'
            : 'bg-muted/50 text-muted-foreground'
        }`}>
          {transcription}
        </div>
      )}

      {/* Lightbox images */}
      {lightboxOpen && mediaUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer"
          onClick={() => setLightboxOpen(false)}
        >
          <img
            src={mediaUrl}
            alt="Image en taille réelle"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
