'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Loader2, Camera, Info } from 'lucide-react'
import { useTranslation } from '@/i18n/context'

/**
 * Édition du profil business WhatsApp (photo, à-propos, description, coordonnées).
 * Modifie directement le profil affiché aux clients dans WhatsApp, via l'API
 * Cloud. Le NOM d'affichage n'est PAS ici (revue Meta obligatoire).
 */
export function WhatsAppProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [about, setAbout] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)   // photo actuelle (Meta)
  const [newPhoto, setNewPhoto] = useState<string | null>(null)   // data URL à envoyer
  // Lien d'image mort (URL Meta expirée) → repli sur l'icône appareil photo.
  const [photoBroken, setPhotoBroken] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setNewPhoto(null)
    setPhotoBroken(false)
    setLoading(true)
    fetch('/api/whatsapp/profile')
      .then((r) => r.json())
      .then((json) => {
        const d = json.data
        if (!d?.connected) return
        setAbout(d.about || '')
        setDescription(d.description || '')
        setAddress(d.address || '')
        setEmail(d.email || '')
        setWebsite((d.websites && d.websites[0]) || '')
        setPhotoUrl(d.profile_picture_url || null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error(t('whatsapp_profile.photo_too_large')); return }
    if (!/^image\//.test(file.type)) { toast.error(t('whatsapp_profile.photo_not_image')); return }
    const reader = new FileReader()
    // ⚠️ Reset indispensable : `photoBroken` vaut true si l'URL Meta a expiré,
    // et il masquait alors la photo tout juste sélectionnée par le marchand.
    reader.onload = () => { setPhotoBroken(false); setNewPhoto(reader.result as string) }
    reader.readAsDataURL(file)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/whatsapp/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ about, description, address, email, website, photo_data_url: newPhoto || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('whatsapp_profile.generic_error'))
      toast.success(t('whatsapp_profile.save_success'))
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('whatsapp_profile.generic_error'))
    } finally {
      setSaving(false)
    }
  }

  const preview = newPhoto || photoUrl

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('whatsapp_profile.title')}</DialogTitle>
          <DialogDescription>{t('whatsapp_profile.description')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-4">
            {/* Photo */}
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border bg-muted">
                {preview && !photoBroken ? (
                  // ⚠️ Les URL de photo renvoyées par Meta EXPIRENT (quelques
                  // heures). Sans `onError`, le navigateur affichait le texte
                  // alternatif « Photo de profil » en travers de la pastille.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setPhotoBroken(true)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Camera className="h-5 w-5" /></div>
                )}
              </div>
              <div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Camera className="mr-1 h-4 w-4" /> {t('whatsapp_profile.change_photo')}
                </Button>
                <p className="mt-1 text-[11px] text-muted-foreground">{t('whatsapp_profile.photo_hint')}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('whatsapp_profile.about_label')} <span className="text-xs text-muted-foreground">{t('whatsapp_profile.about_hint')}</span></Label>
              <Input value={about} maxLength={139} onChange={(e) => setAbout(e.target.value)} placeholder={t('whatsapp_profile.about_placeholder')} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('whatsapp_profile.description_label')}</Label>
              <textarea value={description} maxLength={512} onChange={(e) => setDescription(e.target.value)} rows={3}
                placeholder={t('whatsapp_profile.description_placeholder')}
                className="w-full resize-y rounded-md border border-input bg-background p-2.5 text-sm" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('whatsapp_profile.email_label')}</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('whatsapp_profile.email_placeholder')} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('whatsapp_profile.website_label')}</Label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder={t('whatsapp_profile.website_placeholder')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('whatsapp_profile.address_label')}</Label>
              <Input value={address} maxLength={256} onChange={(e) => setAddress(e.target.value)} placeholder={t('whatsapp_profile.address_placeholder')} />
            </div>

            <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {t('whatsapp_profile.display_name_notice_before')}
                <span className="font-medium text-foreground">{t('whatsapp_profile.display_name_notice_highlight')}</span>
                {t('whatsapp_profile.display_name_notice_after')}
              </span>
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('whatsapp_profile.cancel')}</Button>
              <Button disabled={saving} onClick={save}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                {t('whatsapp_profile.save')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
