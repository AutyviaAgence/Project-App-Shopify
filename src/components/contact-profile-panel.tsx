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
      <SheetContent className="w-full overflow-auto sm:max-w-md p-0">
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
            {/* Header with gradient background */}
            <div className="relative bg-gradient-to-br from-[#7DC2A5] to-[#40E9BE] px-6 pt-8 pb-12">
              <div className="flex flex-col items-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white text-xl font-semibold border-2 border-white/30">
                  {getInitials()}
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white text-center">
                  {getDisplayName()}
                </h2>
                {contact.name && (contact.first_name || contact.last_name) && (
                  <p className="text-sm text-white/80">
                    WhatsApp : {contact.name}
                  </p>
                )}
              </div>
            </div>

            {/* Stats cards */}
            <div className="-mt-6 mx-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-card p-4 shadow-sm border">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Phone className="h-4 w-4" />
                  <span className="text-xs font-medium">Téléphone</span>
                </div>
                <p className="text-sm font-semibold">+{contact.phone_number}</p>
              </div>
              <div className="rounded-xl bg-card p-4 shadow-sm border">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs font-medium">Ajouté</span>
                </div>
                <p className="text-sm font-semibold">
                  {contact.created_at
                    ? format(new Date(contact.created_at), 'd MMM yyyy', { locale: fr })
                    : '-'}
                </p>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
              {/* AI Summary section */}
              <div className="rounded-xl bg-gradient-to-br from-[#7DC2A5]/5 to-[#40E9BE]/5 border border-[#7DC2A5]/20 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7DC2A5]/10">
                      <Sparkles className="h-4 w-4 text-[#7DC2A5]" />
                    </div>
                    <span className="text-sm font-semibold">Résumé IA</span>
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
                    <p className="whitespace-pre-wrap text-sm text-foreground/80 leading-relaxed">
                      {contact.ai_summary}
                    </p>
                    {contact.ai_summary_updated_at && (
                      <p className="mt-3 text-[10px] text-muted-foreground">
                        Généré{' '}
                        {formatDistanceToNow(
                          new Date(contact.ai_summary_updated_at),
                          { addSuffix: true, locale: fr }
                        )}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Générez un résumé IA basé sur l&apos;historique des conversations.
                  </p>
                )}
              </div>

              {/* Editable fields */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Informations
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="first_name" className="text-xs text-muted-foreground">
                      Prénom
                    </Label>
                    <Input
                      id="first_name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Prénom"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="last_name" className="text-xs text-muted-foreground">
                      Nom
                    </Label>
                    <Input
                      id="last_name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Nom"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs text-muted-foreground">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@exemple.com"
                      className="pl-9 h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs text-muted-foreground">
                    Notes
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes sur ce contact..."
                    rows={3}
                    className="text-sm resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Fixed footer with save button */}
            <div className="border-t p-4">
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="w-full h-10"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
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
