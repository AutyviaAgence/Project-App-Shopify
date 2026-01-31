/**
 * Utilitaires de formatage pour numéros de téléphone et noms d'affichage
 */

/**
 * Formate un numéro de téléphone pour l'affichage
 * Exemples:
 * - "33612345678" -> "+33 6 12 34 56 78"
 * - "33612345678@s.whatsapp.net" -> "+33 6 12 34 56 78"
 * - "1234567890" -> "+1 234 567 890"
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return 'Numéro inconnu'

  // Nettoyer le numéro (enlever @s.whatsapp.net et autres suffixes)
  let cleaned = phone.replace(/@.*$/, '').replace(/\D/g, '')

  if (!cleaned) return phone

  // Format français (commence par 33)
  if (cleaned.startsWith('33') && cleaned.length === 11) {
    const rest = cleaned.slice(2)
    return `+33 ${rest[0]} ${rest.slice(1, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7, 9)}`
  }

  // Format américain/canadien (commence par 1)
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    const areaCode = cleaned.slice(1, 4)
    const exchange = cleaned.slice(4, 7)
    const number = cleaned.slice(7)
    return `+1 (${areaCode}) ${exchange}-${number}`
  }

  // Format générique avec espaces tous les 2-3 chiffres
  if (cleaned.length > 4) {
    const countryCode = cleaned.length > 10 ? cleaned.slice(0, cleaned.length - 9) : ''
    const rest = cleaned.length > 10 ? cleaned.slice(-9) : cleaned

    // Grouper par 2 ou 3 chiffres
    const groups: string[] = []
    let remaining = rest
    while (remaining.length > 0) {
      if (remaining.length <= 3) {
        groups.push(remaining)
        break
      }
      groups.push(remaining.slice(0, remaining.length <= 4 ? 2 : 2))
      remaining = remaining.slice(remaining.length <= 4 ? 2 : 2)
    }

    const formatted = groups.join(' ')
    return countryCode ? `+${countryCode} ${formatted}` : formatted
  }

  return `+${cleaned}`
}

/**
 * Obtient le nom d'affichage pour une session
 * Priorité: display_name > phone_number formaté > instance_name
 */
export function getSessionDisplayName(session: {
  display_name?: string | null
  phone_number?: string | null
  instance_name: string
}): string {
  if (session.display_name) {
    return session.display_name
  }

  if (session.phone_number) {
    return formatPhoneNumber(session.phone_number)
  }

  // Nettoyer instance_name (enlever préfixes techniques)
  const instanceName = session.instance_name
  if (instanceName.includes('_')) {
    const parts = instanceName.split('_')
    // Si c'est un UUID ou similaire, afficher juste la partie lisible
    if (parts.length > 1 && parts[0].length > 20) {
      return parts.slice(1).join('_')
    }
  }

  return instanceName
}

/**
 * Obtient le nom d'affichage pour un contact
 * Priorité: name > first_name + last_name > phone_number formaté
 */
export function getContactDisplayName(contact: {
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  phone_number: string
}): string {
  if (contact.name) {
    return contact.name
  }

  if (contact.first_name || contact.last_name) {
    return [contact.first_name, contact.last_name]
      .filter(Boolean)
      .join(' ')
  }

  return formatPhoneNumber(contact.phone_number)
}

/**
 * Obtient les initiales pour un avatar
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

/**
 * Masque partiellement un numéro de téléphone pour la confidentialité
 * Ex: "+33 6 12 34 56 78" -> "+33 6 ** ** ** 78"
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '***'

  const formatted = formatPhoneNumber(phone)
  const parts = formatted.split(' ')

  if (parts.length <= 2) return formatted

  // Garder les 2 premiers et le dernier groupe
  return [
    parts[0],
    parts[1],
    ...parts.slice(2, -1).map(() => '**'),
    parts[parts.length - 1]
  ].join(' ')
}
