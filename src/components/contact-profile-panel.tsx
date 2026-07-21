'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Contact } from '@/types/database'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  User,
  Phone,
  Mail,
  Sparkles,
  Loader2,
  Save,
  MessageSquare,
  Calendar,
  Trash2,
  Languages,
  ShoppingBag,
} from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { formatDistanceToNow, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useTranslation } from '@/i18n/context'

type ContactProfilePanelProps = {
  contactId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onContactDeleted?: () => void
}

export function ContactProfilePanel({
  contactId,
  open,
  onOpenChange,
  onContactDeleted,
}: ContactProfilePanelProps) {
  const { t } = useTranslation()
  const [contact, setContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [extractingInfo, setExtractingInfo] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Champs éditables
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [language, setLanguage] = useState('')

  const fetchContact = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/contacts/${id}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setContact(json.data)
        setFirstName(json.data.first_name || '')
        setLastName(json.data.last_name || '')
        setEmail(json.data.email || '')
        setNotes(json.data.notes || '')
        setLanguage(json.data.preferred_language || '')
      } else {
        toast.error(json.error || t('components.contact_toast_load_err'))
      }
    } catch {
      toast.error(t('components.contact_toast_network_err'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && contactId) {
      fetchContact(contactId)
    }
  }, [open, contactId, fetchContact])

  async function handleSave() {
    if (!contactId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          notes,
          // Langue choisie à la main → source 'manual' (ne sera plus écrasée
          // par Shopify ni la détection conversationnelle).
          preferred_language: language || null,
          language_source: language ? 'manual' : null,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setContact(json.data)
        toast.success(t('components.contact_toast_updated'))
      } else {
        toast.error(json.error || t('components.contact_toast_update_err'))
      }
    } catch {
      toast.error(t('components.contact_toast_network_err'))
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateSummary() {
    if (!contactId) return
    setGeneratingSummary(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}/summary`, {
        method: 'POST',
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setContact(json.data)
        toast.success(t('components.contact_toast_summary_generated'))
      } else {
        toast.error(json.error || t('components.contact_toast_summary_err'))
      }
    } catch {
      toast.error(t('components.contact_toast_network_err'))
    } finally {
      setGeneratingSummary(false)
    }
  }

  async function handleExtractInfo() {
    if (!contactId) return
    setExtractingInfo(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}/extract-info`, {
        method: 'POST',
      })
      const json = await res.json()
      console.log('[extract-info] API response:', json)

      if (res.ok && json.data?.extracted) {
        const extracted = json.data.extracted
        console.log('[extract-info] Extracted data:', extracted)
        const updates: string[] = []

        // Remplir uniquement les champs vides (ne pas écraser les valeurs existantes)
        if (extracted.first_name && extracted.first_name !== 'null' && !firstName.trim()) {
          setFirstName(extracted.first_name)
          updates.push(t('components.contact_field_first_name'))
        }
        if (extracted.last_name && extracted.last_name !== 'null' && !lastName.trim()) {
          setLastName(extracted.last_name)
          updates.push(t('components.contact_field_last_name'))
        }
        if (extracted.email && extracted.email !== 'null' && !email.trim()) {
          setEmail(extracted.email)
          updates.push(t('components.contact_field_email'))
        }
        if (extracted.notes && extracted.notes !== 'null' && !notes.trim()) {
          setNotes(extracted.notes)
          updates.push(t('components.contact_field_notes'))
        }

        if (updates.length > 0) {
          toast.success(t('components.contact_toast_extracted', { fields: updates.join(', ') }))
        } else {
          toast.info(t('components.contact_toast_nothing_to_complete'))
        }
      } else {
        toast.error(json.error || t('components.contact_toast_extract_err'))
      }
    } catch (err) {
      console.error('[extract-info] Error:', err)
      toast.error(t('components.contact_toast_network_err'))
    } finally {
      setExtractingInfo(false)
    }
  }

  const hasChanges =
    contact &&
    (firstName !== (contact.first_name || '') ||
      lastName !== (contact.last_name || '') ||
      email !== (contact.email || '') ||
      notes !== (contact.notes || '') ||
      language !== (contact.preferred_language || ''))

  async function handleDelete() {
    if (!contactId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(t('components.contact_toast_deleted'))
        onOpenChange(false)
        onContactDeleted?.()
      } else {
        toast.error(json.error || t('components.contact_toast_delete_err'))
      }
    } catch {
      toast.error(t('components.contact_toast_network_err'))
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  function getDisplayName() {
    if (!contact) return ''
    if (contact.first_name || contact.last_name) {
      return `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
    }
    return contact.name || t('components.contact_unknown')
  }

  function getInitials() {
    if (!contact) return ''
    const name = getDisplayName()
    if (name && name !== t('components.contact_unknown')) {
      return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    }
    return contact.phone_number?.slice(-2) || '??'
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-auto sm:max-w-sm p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{t('components.contact_profile_title')}</SheetTitle>
          <SheetDescription>
            {t('components.contact_profile_desc')}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : contact ? (
          <div className="flex flex-col h-full">
            {/* Header compact */}
            <div className="px-3 py-3" style={{ background: 'linear-gradient(to bottom right, var(--primary, #3B82F6), var(--accent, #3B82F6))' }}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-semibold border border-white/30 shrink-0">
                  {getInitials()}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-white truncate">
                    {getDisplayName()}
                  </h2>
                  <p className="text-xs text-white/80 truncate">+{contact.phone_number}</p>
                </div>
              </div>
            </div>

            {/* Stats inline */}
            <div className="mx-3 mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>
                  {contact.created_at
                    ? format(new Date(contact.created_at), 'd MMM yyyy', { locale: fr })
                    : '-'}
                </span>
              </div>
              {contact.name && (contact.first_name || contact.last_name) && (
                <div className="flex items-center gap-1 truncate">
                  <MessageSquare className="h-3 w-3" />
                  <span className="truncate">{contact.name}</span>
                </div>
              )}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-auto px-3 py-3 space-y-4">
              {/* Editable fields - EN PREMIER */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold flex items-center gap-1.5">
                    <User className="h-3 w-3 text-muted-foreground" />
                    {t('components.contact_info')}
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExtractInfo}
                    disabled={extractingInfo}
                    className="h-7 text-xs px-2"
                  >
                    {extractingInfo ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    <span className="ml-1">{t('components.contact_complete_ai')}</span>
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="first_name" className="text-[10px] text-muted-foreground">
                      {t('components.contact_first_name')}
                    </Label>
                    <Input
                      id="first_name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t('components.contact_first_name')}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="last_name" className="text-[10px] text-muted-foreground">
                      {t('components.contact_last_name')}
                    </Label>
                    <Input
                      id="last_name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={t('components.contact_last_name')}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="email" className="text-[10px] text-muted-foreground">
                    {t('components.contact_email')}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('components.contact_email_placeholder')}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  {/* Statut de liaison au client Shopify. */}
                  {contact?.shopify_customer_id ? (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      <ShoppingBag className="h-3 w-3" /> {t('components.contact_shopify_linked')}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-muted-foreground">{t('components.contact_shopify_not_linked')}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="contact-language" className="text-[10px] text-muted-foreground">
                    {t('components.contact_preferred_language')}
                  </Label>
                  <div className="relative">
                    <Languages className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <select
                      id="contact-language"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs"
                    >
                      <option value="">{t('components.contact_lang_auto')}</option>
                      <option value="fr">{t('components.contact_lang_fr')}</option>
                      <option value="en">{t('components.contact_lang_en')}</option>
                      <option value="es">{t('components.contact_lang_es')}</option>
                      <option value="de">{t('components.contact_lang_de')}</option>
                      <option value="it">{t('components.contact_lang_it')}</option>
                      <option value="pt">{t('components.contact_lang_pt')}</option>
                      <option value="nl">{t('components.contact_lang_nl')}</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {t('components.contact_language_hint')}
                    {contact?.language_source && contact.language_source !== 'manual' && !language && (
                      <> {t('components.contact_language_detected_via', { source: contact.language_source === 'shopify' ? t('components.contact_source_shopify') : contact.language_source === 'country' ? t('components.contact_source_country') : t('components.contact_source_conversation') })}</>
                    )}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="notes" className="text-[10px] text-muted-foreground">
                    {t('components.contact_notes')}
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('components.contact_notes_placeholder')}
                    rows={3}
                    className="text-xs resize-none"
                  />
                </div>
              </div>

              {/* AI Summary section - APRÈS les informations */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#3B82F6]" />
                    <span className="text-xs font-semibold">{t('components.contact_ai_summary')}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateSummary}
                    disabled={generatingSummary}
                    className="h-7 text-xs px-2"
                  >
                    {generatingSummary ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    <span className="ml-1">{contact.ai_summary ? t('components.contact_regenerate') : t('components.contact_generate')}</span>
                  </Button>
                </div>

                {contact.ai_summary ? (
                  <div className="space-y-2">
                    <div className="bg-background rounded-md p-2 border">
                      <p className="whitespace-pre-wrap text-xs text-foreground leading-relaxed select-text cursor-text">
                        {contact.ai_summary}
                      </p>
                    </div>
                    {contact.ai_summary_updated_at && (
                      <p className="text-[10px] text-muted-foreground">
                        {t('components.contact_generated_ago', {
                          ago: formatDistanceToNow(
                            new Date(contact.ai_summary_updated_at),
                            { addSuffix: true, locale: fr }
                          ),
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('components.contact_summary_empty')}
                  </p>
                )}
              </div>
            </div>

            {/* Fixed footer with save button */}
            <div className="border-t p-3 space-y-2">
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="w-full h-9 text-xs"
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3 w-3" />
                )}
                {t('components.contact_save_changes')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
                className="w-full h-9 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1.5 h-3 w-3" />
                {t('components.contact_delete')}
              </Button>
            </div>
          </div>
        ) : null}

        <ConfirmDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDelete}
          title={t('components.contact_delete_title')}
          description={t('components.contact_delete_desc')}
          loading={deleting}
        />
      </SheetContent>
    </Sheet>
  )
}
