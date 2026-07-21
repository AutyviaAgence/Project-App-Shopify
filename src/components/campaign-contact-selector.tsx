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
import { useTranslation } from '@/i18n/context'

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
  const { t } = useTranslation()
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
      toast.error(t('components.campaign_toast_load_err'))
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
    toast.info(t('components.campaign_toast_page_selected', { count: allIds.length }))
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
          throw new Error(json.error || t('components.campaign_toast_remove_err'))
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
          throw new Error(json.error || t('components.campaign_toast_add_err'))
        }
      }

      const changes = []
      if (toAdd.length > 0) changes.push(t('components.campaign_change_added', { count: toAdd.length }))
      if (toRemove.length > 0) changes.push(t('components.campaign_change_removed', { count: toRemove.length }))

      if (changes.length > 0) {
        toast.success(t('components.campaign_toast_updated', { changes: changes.join(', ') }))
      } else {
        toast.info(t('components.campaign_toast_no_change'))
      }

      onContactsUpdated()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('components.campaign_toast_save_err'))
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
            {t('components.campaign_select_prospects')}
          </DialogTitle>
          <DialogDescription>
            {t('components.campaign_eligible_desc', { count: totalCount })}
          </DialogDescription>
        </DialogHeader>

        {/* Barre de recherche et actions */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('components.campaign_search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {t('components.campaign_select_all')}
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              <XCircle className="mr-2 h-4 w-4" />
              {t('components.campaign_deselect_all')}
            </Button>
          </div>
        </div>

        {/* Compteur de sélection */}
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">
            {t('components.campaign_selected_count', { count: selectedIds.size, plural: selectedIds.size > 1 ? 's' : '' })}
          </Badge>
          {hasChanges && (
            <Badge variant="outline" className="text-primary">
              {t('components.campaign_unsaved_changes')}
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
                  ? t('components.campaign_no_match')
                  : t('components.campaign_no_eligible')}
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
                      aria-label={t('components.campaign_select_all_aria')}
                    />
                  </TableHead>
                  <TableHead>{t('components.campaign_col_contact')}</TableHead>
                  <TableHead>{t('components.campaign_col_last_activity')}</TableHead>
                  <TableHead className="text-right">{t('components.campaign_col_status')}</TableHead>
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
                          aria-label={t('components.campaign_select_contact_aria', { name: contact.contact_name || contact.phone_number })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium">
                              {contact.contact_name || t('components.campaign_no_name')}
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
                          : t('components.campaign_never')}
                      </TableCell>
                      <TableCell className="text-right">
                        {contact.isSelected && !isSelected ? (
                          <Badge variant="outline" className="text-destructive">
                            {t('components.campaign_to_remove')}
                          </Badge>
                        ) : isSelected && !contact.isSelected ? (
                          <Badge variant="outline" className="text-primary">
                            {t('components.campaign_to_add')}
                          </Badge>
                        ) : isSelected ? (
                          <Badge variant="secondary">
                            {t('components.campaign_in_campaign')}
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
              {t('components.campaign_page_x_of_y', { page, total: totalPages })}
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
            {t('components.campaign_cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('components.campaign_saving')}
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                {t('components.campaign_save_count', { count: selectedIds.size })}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
