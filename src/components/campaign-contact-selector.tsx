'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Loader2,
  Search,
  Users,
  Phone,
  User,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

type EligibleContact = {
  contact_id: string
  contact_name: string | null
  phone_number: string
  session_id: string
  conversation_id: string | null
  last_message_at: string | null
  isSelected: boolean
}

type CampaignContactSelectorProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  onContactsUpdated: () => void
}

export function CampaignContactSelector({
  open,
  onOpenChange,
  campaignId,
  onContactsUpdated,
}: CampaignContactSelectorProps) {
  const [contacts, setContacts] = useState<EligibleContact[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [initialSelectedIds, setInitialSelectedIds] = useState<Set<string>>(new Set())

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      })
      if (debouncedSearch) {
        params.set('search', debouncedSearch)
      }

      const res = await fetch(`/api/campaigns/${campaignId}/eligible-contacts?${params}`)
      const json = await res.json()

      if (res.ok && json.data) {
        setContacts(json.data.contacts)
        setTotalPages(json.data.totalPages)
        setTotalCount(json.data.total)

        // Initialiser les sélections avec les contacts déjà dans la campagne
        const selected = new Set<string>()
        json.data.contacts.forEach((c: EligibleContact) => {
          if (c.isSelected) {
            selected.add(c.contact_id)
          }
        })

        // Première fois qu'on charge, on initialise aussi les initials
        if (page === 1 && !debouncedSearch) {
          setInitialSelectedIds(new Set(selected))
        }

        // Fusionner avec les sélections actuelles (pour préserver les choix entre pages)
        setSelectedIds(prev => {
          const newSet = new Set(prev)
          selected.forEach(id => newSet.add(id))
          return newSet
        })
      }
    } catch {
      toast.error('Erreur lors du chargement des contacts')
    } finally {
      setLoading(false)
    }
  }, [campaignId, page, debouncedSearch])

  useEffect(() => {
    if (open) {
      fetchContacts()
    }
  }, [open, fetchContacts])

  // Reset quand on ferme
  useEffect(() => {
    if (!open) {
      setSearch('')
      setDebouncedSearch('')
      setPage(1)
      setSelectedIds(new Set())
      setInitialSelectedIds(new Set())
    }
  }, [open])

  function toggleContact(contactId: string) {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(contactId)) {
        newSet.delete(contactId)
      } else {
        newSet.add(contactId)
      }
      return newSet
    })
  }

  function toggleAll() {
    const allCurrentPageIds = contacts.map(c => c.contact_id)
    const allSelected = allCurrentPageIds.every(id => selectedIds.has(id))

    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (allSelected) {
        // Désélectionner tous les contacts de cette page
        allCurrentPageIds.forEach(id => newSet.delete(id))
      } else {
        // Sélectionner tous les contacts de cette page
        allCurrentPageIds.forEach(id => newSet.add(id))
      }
      return newSet
    })
  }

  function selectAll() {
    // Sélectionner tous les contacts (pas juste la page courante)
    // Pour ça on doit récupérer tous les IDs
    const allIds = contacts.map(c => c.contact_id)
    setSelectedIds(new Set(allIds))
    toast.info(`${allIds.length} contacts sélectionnés sur cette page. Naviguez sur les autres pages pour en sélectionner plus.`)
  }

  function deselectAll() {
    setSelectedIds(new Set())
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Déterminer les contacts à ajouter et à supprimer
      const toAdd = Array.from(selectedIds).filter(id => !initialSelectedIds.has(id))
      const toRemove = Array.from(initialSelectedIds).filter(id => !selectedIds.has(id))

      // Supprimer les contacts désélectionnés
      if (toRemove.length > 0) {
        const removeRes = await fetch(`/api/campaigns/${campaignId}/eligible-contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_ids: toRemove,
            action: 'remove',
          }),
        })

        if (!removeRes.ok) {
          const json = await removeRes.json()
          throw new Error(json.error || 'Erreur lors de la suppression')
        }
      }

      // Ajouter les nouveaux contacts
      if (toAdd.length > 0) {
        const addRes = await fetch(`/api/campaigns/${campaignId}/eligible-contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_ids: toAdd,
            action: 'add',
          }),
        })

        if (!addRes.ok) {
          const json = await addRes.json()
          throw new Error(json.error || 'Erreur lors de l\'ajout')
        }
      }

      const changes = []
      if (toAdd.length > 0) changes.push(`${toAdd.length} ajouté(s)`)
      if (toRemove.length > 0) changes.push(`${toRemove.length} retiré(s)`)

      if (changes.length > 0) {
        toast.success(`Contacts mis à jour : ${changes.join(', ')}`)
      } else {
        toast.info('Aucune modification')
      }

      onContactsUpdated()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const allCurrentPageSelected = contacts.length > 0 && contacts.every(c => selectedIds.has(c.contact_id))
  const someCurrentPageSelected = contacts.some(c => selectedIds.has(c.contact_id))
  const hasChanges =
    Array.from(selectedIds).some(id => !initialSelectedIds.has(id)) ||
    Array.from(initialSelectedIds).some(id => !selectedIds.has(id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Sélectionner les prospects
          </DialogTitle>
          <DialogDescription>
            {totalCount} contacts éligibles selon vos critères de ciblage.
            Cochez les contacts à inclure dans la campagne.
          </DialogDescription>
        </DialogHeader>

        {/* Barre de recherche et actions */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou numéro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Tout sélectionner
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              <XCircle className="mr-2 h-4 w-4" />
              Tout désélectionner
            </Button>
          </div>
        </div>

        {/* Compteur de sélection */}
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">
            {selectedIds.size} contact{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
          </Badge>
          {hasChanges && (
            <Badge variant="outline" className="text-primary">
              Modifications non sauvegardées
            </Badge>
          )}
        </div>

        {/* Liste des contacts */}
        <div className="flex-1 overflow-y-auto border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-sm">
                {debouncedSearch
                  ? 'Aucun contact ne correspond à votre recherche'
                  : 'Aucun contact éligible'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allCurrentPageSelected}
                      ref={(el) => {
                        if (el) {
                          (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate =
                            someCurrentPageSelected && !allCurrentPageSelected
                        }
                      }}
                      onCheckedChange={toggleAll}
                      aria-label="Sélectionner tous"
                    />
                  </TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Dernière activité</TableHead>
                  <TableHead className="text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => {
                  const isSelected = selectedIds.has(contact.contact_id)

                  return (
                    <TableRow
                      key={contact.contact_id}
                      className={isSelected ? 'bg-primary/5' : ''}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleContact(contact.contact_id)}
                          aria-label={`Sélectionner ${contact.contact_name || contact.phone_number}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium">
                              {contact.contact_name || 'Sans nom'}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              +{contact.phone_number}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {contact.last_message_at
                          ? formatDistanceToNow(new Date(contact.last_message_at), {
                              addSuffix: true,
                              locale: fr,
                            })
                          : 'Jamais'}
                      </TableCell>
                      <TableCell className="text-right">
                        {contact.isSelected && !isSelected ? (
                          <Badge variant="outline" className="text-destructive">
                            À retirer
                          </Badge>
                        ) : isSelected && !contact.isSelected ? (
                          <Badge variant="outline" className="text-primary">
                            À ajouter
                          </Badge>
                        ) : isSelected ? (
                          <Badge variant="secondary">
                            Dans la campagne
                          </Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page} sur {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Enregistrer ({selectedIds.size} contacts)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
