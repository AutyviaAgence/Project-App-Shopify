'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, FileText, Download, Eye, EyeOff, Image as ImageIcon, Mic, Play, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import type { Message } from '@/types/database'

type ExtendedMessage = Message & {
  agent_name?: string
}

export function MessageBubbleContent({ msg, isOutbound, channel }: { msg: ExtendedMessage; isOutbound: boolean; channel?: string }) {
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

  // Messages texte ou types sans média
  if (msg.message_type === 'text' || !isMediaType) {
    const content = msg.content || ''
    const isEmail = channel === 'email'
    const isEmailInbound = isEmail && !isOutbound
    const isHtml = isEmailInbound && /(<html|<!doctype|<body|<div|<p|<table|<br)/i.test(content)

    // Extraire sujet et pièces jointes depuis transcription (format "Objet: ...\nPJ: ...")
    const transcriptionLines = (msg.transcription || '').split('\n')
    const emailSubject = transcriptionLines.find(l => l.startsWith('Objet: '))?.slice(7) ?? null
    const emailPJ = transcriptionLines.find(l => l.startsWith('PJ: '))?.slice(4) ?? null

    const emailMeta = isEmail && (emailSubject || emailPJ)
    const emailPJFiles = emailPJ ? emailPJ.split(',').map(f => f.trim()).filter(Boolean) : []

    return (
      <div className="space-y-1.5">
        {emailMeta && (
          <div className={`space-y-0.5 border-b pb-1.5 mb-1 ${isOutbound ? 'border-white/20' : 'border-border'}`}>
            {emailSubject && (
              <p className={`text-xs font-semibold ${isOutbound ? 'text-white/80' : 'text-foreground/70'}`}>
                {emailSubject}
              </p>
            )}
          </div>
        )}
        {isHtml ? (
          <iframe
            srcDoc={`<style>* { box-sizing: border-box; } html, body { margin: 0; padding: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; color: #111; background: #fff; } img { max-width: 100%; height: auto; display: block; } a { color: #7DC2A5; } p { margin: 0 0 8px 0; } table { max-width: 100%; border-collapse: collapse; } td, th { padding: 4px 8px; } .ReadMsgBody, .ExternalClass { width: 100%; }</style>${content}`}
            sandbox="allow-same-origin allow-popups"
            className="rounded border-0 bg-white"
            style={{ width: '100%', minWidth: 280, minHeight: 80, maxHeight: 500, display: 'block' }}
            scrolling="no"
            onLoad={(e) => {
              const iframe = e.currentTarget
              const doc = iframe.contentDocument
              if (doc?.body) {
                const h = doc.body.scrollHeight
                iframe.style.height = Math.min(h + 16, 500) + 'px'
              }
            }}
          />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
        )}

        {/* Pièces jointes email */}
        {emailPJFiles.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            {emailPJFiles.map((filename, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 max-w-[260px] ${
                  isOutbound ? 'bg-white/10' : 'bg-muted/40'
                }`}
              >
                <FileText className={`h-4 w-4 shrink-0 ${isOutbound ? 'text-white/70' : 'text-muted-foreground'}`} />
                <span className={`text-[11px] truncate ${isOutbound ? 'text-white/80' : 'text-foreground/80'}`}>
                  {filename}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
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
