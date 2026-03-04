'use client'

import { useState, useRef } from 'react'
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
} from 'lucide-react'
import { useTranslation } from '@/i18n/context'

interface MessageInputProps {
  onSendText: (content: string) => Promise<void>
  onSendMedia: (file: File, caption?: string) => Promise<void>
  sending: boolean
}

export function MessageInput({ onSendText, onSendMedia, sending }: MessageInputProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [newMessage, setNewMessage] = useState('')
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null)

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
