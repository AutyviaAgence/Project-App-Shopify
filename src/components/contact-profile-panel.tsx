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
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { fr } from 'date-fns/locale'

type ContactProfilePanelProps = {
  contactId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContactProfilePanel({
  contactId,
  open,
  onOpenChange,
}: ContactProfilePanelProps) {
  const [contact, setContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingSummary, setGeneratingSummary] = useState(false)

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

  const hasChanges =
    contact &&
    (firstName !== (contact.first_name || '') ||
      lastName !== (contact.last_name || '') ||
      email !== (contact.email || '') ||
      notes !== (contact.notes || ''))

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
              {/* AI Summary section */}
              <div className="rounded-lg bg-gradient-to-br from-[#7DC2A5]/5 to-[#40E9BE]/5 border border-[#7DC2A5]/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#7DC2A5]/10">
                      <Sparkles className="h-3 w-3 text-[#7DC2A5]" />
                    </div>
                    <span className="text-xs font-semibold">Résumé IA</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateSummary}
                    disabled={generatingSummary}
                    className="h-8 text-xs border-[#7DC2A5]/30 text-[#7DC2A5] hover:bg-[#7DC2A5]/10"
                  >
                    {generatingSummary ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-3 w-3" />
                    )}
                    {contact.ai_summary ? 'Regénérer' : 'Générer'}
                  </Button>
                </div>

                {contact.ai_summary ? (
                  <div>
                    <p className="whitespace-pre-wrap text-xs text-foreground/80 leading-relaxed max-h-24 overflow-auto">
                      {contact.ai_summary}
                    </p>
                    {contact.ai_summary_updated_at && (
                      <p className="mt-2 text-[10px] text-muted-foreground">
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

              {/* Editable fields */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  Informations
                </h3>

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
                    rows={2}
                    className="text-xs resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Fixed footer with save button */}
            <div className="border-t p-3">
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
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
