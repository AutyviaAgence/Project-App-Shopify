'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Send,
  Loader2,
  X,
  Paperclip,
  Mic,
  Square,
  FileText,
  Video,
  Zap,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from '@/i18n/context'
import type { Macro } from '@/types/database'

interface MessageInputProps {
  onSendText: (content: string) => Promise<void>
  onSendMedia: (file: File, caption?: string) => Promise<void>
  sending: boolean
  conversationId?: string
  /** Ouvre le sélecteur de modèle approuvé (template WhatsApp). */
  onSendTemplate?: () => void
}

export function MessageInput({ onSendText, onSendMedia, sending, conversationId, onSendTemplate }: MessageInputProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [newMessage, setNewMessage] = useState('')
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null)

  // Macros (réponses pré-enregistrées)
  const [macros, setMacros] = useState<Macro[]>([])
  const [macrosOpen, setMacrosOpen] = useState(false)

  useEffect(() => {
    if (!macrosOpen || macros.length > 0) return
    fetch('/api/macros').then(r => r.json()).then(j => { if (j.data) setMacros(j.data) }).catch(() => {})
  }, [macrosOpen, macros.length])

  function insertMacro(m: Macro) {
    setNewMessage(prev => (prev ? prev + ' ' : '') + m.content)
    setMacrosOpen(false)
    inputRef.current?.focus()
    // Incrémenter le compteur d'usage (best effort)
    fetch(`/api/macros/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ used: true }) }).catch(() => {})
  }

  // Suggestion IA : génère un brouillon de réponse (à relire avant envoi)
  const [suggesting, setSuggesting] = useState(false)
  async function suggestReply() {
    if (!conversationId || suggesting) return
    setSuggesting(true)
    try {
      const res = await fetch(`/api/conversations/${conversationId}/suggest`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      if (json.text) { setNewMessage(json.text); inputRef.current?.focus() }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSuggesting(false)
    }
  }

  // Voice recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      toast.error(t('conversations.file_too_large'))
      return
    }
    setAttachedFile(file)
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setAttachedPreview(url)
    } else {
      setAttachedPreview(null)
    }
  }

  function clearAttachment() {
    setAttachedFile(null)
    if (attachedPreview) {
      URL.revokeObjectURL(attachedPreview)
      setAttachedPreview(null)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSendMediaInternal(file: File, caption?: string) {
    await onSendMedia(file, caption)
    clearAttachment()
    setNewMessage('')
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (attachedFile) {
      await handleSendMediaInternal(attachedFile, newMessage.trim() || undefined)
      return
    }
    if (!newMessage.trim() || sending) return
    const content = newMessage.trim()
    setNewMessage('')
    await onSendText(content)
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      audioChunksRef.current = []
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], 'voice-message.webm', { type: 'audio/webm' })
        handleSendMediaInternal(file)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingDuration(0)
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1)
      }, 1000)
    } catch {
      toast.error(t('conversations.mic_permission_error') || 'Microphone access denied')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop())
      }
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    setRecordingDuration(0)
    audioChunksRef.current = []
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }
  }

  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-background border-t">
      {/* Attachment preview */}
      {attachedFile && (
        <div className="px-3 pt-3 max-w-3xl mx-auto">
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-2.5">
            {attachedPreview ? (
              <img src={attachedPreview} alt="" className="h-14 w-14 rounded-md object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-md bg-muted">
                {attachedFile.type.startsWith('video/') ? (
                  <Video className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <FileText className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{attachedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(attachedFile.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={clearAttachment}
              className="shrink-0 p-1 rounded-full hover:bg-muted"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Recording indicator */}
      {isRecording ? (
        <div className="p-3">
          <div className="flex items-center gap-3 max-w-3xl mx-auto">
            <div className="flex items-center gap-2 flex-1 rounded-full bg-red-50 dark:bg-red-950/30 px-4 h-11">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                {t('conversations.recording')} {formatDuration(recordingDuration)}
              </span>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={cancelRecording}
              className="h-11 w-11 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={stopRecording}
              className="h-11 w-11 rounded-full shrink-0 bg-red-500 hover:bg-red-600"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSend} className="p-3">
          <div className="flex items-center gap-2 max-w-3xl mx-auto">
            {/* Attachment button */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              className="h-11 w-11 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
              title={t('conversations.attach_file')}
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            {/* Macros (réponses pré-enregistrées) */}
            <div className="relative shrink-0">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setMacrosOpen(o => !o)}
                disabled={sending}
                className="h-11 w-11 rounded-full text-muted-foreground hover:text-foreground"
                title="Macros"
              >
                <Zap className="h-4 w-4" />
              </Button>
              {macrosOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMacrosOpen(false)} />
                  <div className="absolute bottom-12 left-0 z-20 w-72 rounded-xl border bg-popover p-2 shadow-lg">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Réponses pré-enregistrées</div>
                    <div className="max-h-64 overflow-y-auto">
                      {macros.length === 0 ? (
                        <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                          Aucune macro. Créez-en dans Paramètres → Macros.
                        </div>
                      ) : (
                        macros.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => insertMacro(m)}
                            className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60"
                          >
                            <div className="text-sm font-medium">{m.title}</div>
                            <div className="truncate text-xs text-muted-foreground">{m.content}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Suggestion IA */}
            {conversationId && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={suggestReply}
                disabled={sending || suggesting}
                className="h-11 w-11 rounded-full shrink-0 text-muted-foreground hover:text-primary"
                title="Suggérer une réponse (IA)"
              >
                {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </Button>
            )}

            {/* Envoyer un modèle approuvé (template WhatsApp) */}
            {onSendTemplate && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={onSendTemplate}
                disabled={sending}
                className="h-11 w-11 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
                title={t('conversations.send_template')}
              >
                <FileText className="h-4 w-4" />
              </Button>
            )}

            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={attachedFile ? t('conversations.caption_placeholder') : t('conversations.write_message')}
                disabled={sending}
                maxLength={4096}
                className="pr-4 h-11 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary rounded-full"
              />
            </div>

            {/* Send or Mic button */}
            {newMessage.trim() || attachedFile ? (
              <Button
                type="submit"
                size="icon"
                disabled={(!newMessage.trim() && !attachedFile) || sending}
                className="h-11 w-11 rounded-full shrink-0"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={startRecording}
                disabled={sending}
                className="h-11 w-11 rounded-full shrink-0"
                title={t('conversations.record_voice')}
              >
                <Mic className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
