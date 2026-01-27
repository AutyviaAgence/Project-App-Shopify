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
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  User,
  Phone,
  Mail,
  Sparkles,
  Loader2,
  Save,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Profil du contact</SheetTitle>
          <SheetDescription className="sr-only">
            Informations et notes sur le contact
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : contact ? (
          <div className="space-y-6 px-4 pb-4">
            {/* Header : avatar + nom + téléphone */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-7 w-7" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium">{getDisplayName()}</p>
                {contact.name &&
                  (contact.first_name || contact.last_name) && (
                    <p className="text-xs text-muted-foreground">
                      WhatsApp : {contact.name}
                    </p>
                  )}
                <div className="mt-1 flex items-center justify-center gap-1 text-sm text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  +{contact.phone_number}
                </div>
              </div>
            </div>

            <Separator />

            {/* Champs éditables */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="first_name">Prénom</Label>
                  <Input
                    id="first_name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Prénom"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Nom</Label>
                  <Input
                    id="last_name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Nom"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@exemple.com"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes sur ce contact..."
                  rows={4}
                />
              </div>

              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="w-full"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Enregistrer
              </Button>
            </div>

            <Separator />

            {/* Résumé IA */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  Résumé IA
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                >
                  {generatingSummary ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3 w-3" />
                  )}
                  {contact.ai_summary ? 'Regénérer' : 'Générer'}
                </Button>
              </div>

              {contact.ai_summary ? (
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="whitespace-pre-wrap text-sm">
                    {contact.ai_summary}
                  </p>
                  {contact.ai_summary_updated_at && (
                    <p className="mt-2 text-xs text-muted-foreground">
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
                  Cliquez sur &quot;Générer&quot; pour créer un résumé IA de la
                  conversation.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
