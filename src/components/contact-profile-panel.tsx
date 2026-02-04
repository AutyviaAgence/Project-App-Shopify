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
} from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { formatDistanceToNow, format } from 'date-fns'
import { fr } from 'date-fns/locale'

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
      } else {
        toast.error(json.error || 'Erreur lors du chargement du contact')
      }
    } catch {
      toast.error('Erreur réseau')
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
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setContact(json.data)
        toast.success('Contact mis à jour')
      } else {
        toast.error(json.error || 'Erreur lors de la mise à jour')
      }
    } catch {
      toast.error('Erreur réseau')
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
        toast.success('Résumé généré')
      } else {
        toast.error(json.error || 'Erreur lors de la génération du résumé')
      }
    } catch {
      toast.error('Erreur réseau')
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
          updates.push('prénom')
        }
        if (extracted.last_name && extracted.last_name !== 'null' && !lastName.trim()) {
          setLastName(extracted.last_name)
          updates.push('nom')
        }
        if (extracted.email && extracted.email !== 'null' && !email.trim()) {
          setEmail(extracted.email)
          updates.push('email')
        }
        if (extracted.notes && extracted.notes !== 'null' && !notes.trim()) {
          setNotes(extracted.notes)
          updates.push('notes')
        }

        if (updates.length > 0) {
          toast.success(`Informations extraites : ${updates.join(', ')}`)
        } else {
          toast.info('Aucune nouvelle information à compléter')
        }
      } else {
        toast.error(json.error || 'Erreur lors de l\'extraction')
      }
    } catch (err) {
      console.error('[extract-info] Error:', err)
      toast.error('Erreur réseau')
    } finally {
      setExtractingInfo(false)
    }
  }

  const hasChanges =
    contact &&
    (firstName !== (contact.first_name || '') ||
      lastName !== (contact.last_name || '') ||
      email !== (contact.email || '') ||
      notes !== (contact.notes || ''))

  async function handleDelete() {
    if (!contactId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Contact supprimé')
        onOpenChange(false)
        onContactDeleted?.()
      } else {
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur réseau')
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
    return contact.name || 'Contact inconnu'
  }

  function getInitials() {
    if (!contact) return ''
    const name = getDisplayName()
    if (name && name !== 'Contact inconnu') {
      return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    }
    return contact.phone_number?.slice(-2) || '??'
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-auto sm:max-w-sm p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Profil du contact</SheetTitle>
          <SheetDescription>
            Informations et notes sur le contact
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : contact ? (
          <div className="flex flex-col h-full">
            {/* Header compact */}
            <div className="bg-gradient-to-br from-[#7DC2A5] to-[#40E9BE] px-3 py-3">
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
                    Informations
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
                    <span className="ml-1">Compléter via IA</span>
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="first_name" className="text-[10px] text-muted-foreground">
                      Prénom
                    </Label>
                    <Input
                      id="first_name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Prénom"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="last_name" className="text-[10px] text-muted-foreground">
                      Nom
                    </Label>
                    <Input
                      id="last_name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Nom"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="email" className="text-[10px] text-muted-foreground">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@exemple.com"
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="notes" className="text-[10px] text-muted-foreground">
                    Notes
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes sur ce contact..."
                    rows={3}
                    className="text-xs resize-none"
                  />
                </div>
              </div>

              {/* AI Summary section - APRÈS les informations */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#7DC2A5]" />
                    <span className="text-xs font-semibold">Résumé IA</span>
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
                    <span className="ml-1">{contact.ai_summary ? 'Regénérer' : 'Générer'}</span>
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
                        Généré{' '}
                        {formatDistanceToNow(
                          new Date(contact.ai_summary_updated_at),
                          { addSuffix: true, locale: fr }
                        )}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Générez un résumé IA basé sur l&apos;historique des conversations.
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
                Enregistrer les modifications
              </Button>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
                className="w-full h-9 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1.5 h-3 w-3" />
                Supprimer ce contact
              </Button>
            </div>
          </div>
        ) : null}

        <ConfirmDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDelete}
          title="Supprimer le contact"
          description={`Êtes-vous sûr de vouloir supprimer ce contact et toutes ses conversations ? Cette action est irréversible.`}
          loading={deleting}
        />
      </SheetContent>
    </Sheet>
  )
}
