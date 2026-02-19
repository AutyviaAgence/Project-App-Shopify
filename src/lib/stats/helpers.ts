/**
 * Retourne les bornes de la période courante et de la période précédente.
 * Ex : period=30 → from = il y a 30 jours, prevFrom = il y a 60 jours
 */
export function getDateRange(period: number) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - period)

  const prevTo = new Date(from)
  const prevFrom = new Date(from)
  prevFrom.setDate(prevFrom.getDate() - period)

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    prevFrom: prevFrom.toISOString(),
    prevTo: prevTo.toISOString(),
  }
}

/**
 * Calcule le pourcentage de variation entre deux valeurs.
 * Retourne null si la valeur précédente est 0.
 */
export function computeTrend(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 100)
}

/**
 * Génère une série de dates (YYYY-MM-DD) entre from et to inclus.
 */
export function generateDateSeries(from: string, to: string): string[] {
  const dates: string[] = []
  const start = new Date(from)
  const end = new Date(to)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  const current = new Date(start)
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

/**
 * Agrège un tableau d'items par date (champ dateField) en remplissant les jours manquants à 0.
 */
export function groupByDate<T>(
  items: T[],
  dateField: keyof T,
  from: string,
  to: string
): { date: string; count: number }[] {
  const dateSeries = generateDateSeries(from, to)
  const counts = new Map<string, number>()

  for (const d of dateSeries) {
    counts.set(d, 0)
  }

  for (const item of items) {
    const raw = item[dateField]
    if (typeof raw !== 'string') continue
    const day = raw.slice(0, 10)
    counts.set(day, (counts.get(day) || 0) + 1)
  }

  return dateSeries.map((date) => ({ date, count: counts.get(date) || 0 }))
}

/**
 * Agrège les messages par date avec séparation inbound / outbound.
 */
export function groupMessagesByDate(
  messages: { created_at: string; direction: string }[],
  from: string,
  to: string
): { date: string; inbound: number; outbound: number }[] {
  const dateSeries = generateDateSeries(from, to)
  const inMap = new Map<string, number>()
  const outMap = new Map<string, number>()

  for (const d of dateSeries) {
    inMap.set(d, 0)
    outMap.set(d, 0)
  }

  for (const msg of messages) {
    const day = msg.created_at.slice(0, 10)
    if (msg.direction === 'inbound') {
      inMap.set(day, (inMap.get(day) || 0) + 1)
    } else {
      outMap.set(day, (outMap.get(day) || 0) + 1)
    }
  }

  return dateSeries.map((date) => ({
    date,
    inbound: inMap.get(date) || 0,
    outbound: outMap.get(date) || 0,
  }))
}

/**
 * Agrège les transitions lifecycle par date avec un compteur par stade.
 */
export function groupTransitionsByDate(
  history: { to_stage_id: string | null; created_at: string }[],
  stages: { id: string }[],
  from: string,
  to: string
): Record<string, number | string>[] {
  const dateSeries = generateDateSeries(from, to)
  const stageIds = stages.map((s) => s.id)

  const dateCounts = new Map<string, Map<string, number>>()
  for (const d of dateSeries) {
    const stageMap = new Map<string, number>()
    for (const sid of stageIds) stageMap.set(sid, 0)
    dateCounts.set(d, stageMap)
  }

  for (const h of history) {
    if (!h.to_stage_id) continue
    const day = h.created_at.slice(0, 10)
    const dayMap = dateCounts.get(day)
    if (dayMap) {
      dayMap.set(h.to_stage_id, (dayMap.get(h.to_stage_id) || 0) + 1)
    }
  }

  return dateSeries.map((date) => {
    const dayMap = dateCounts.get(date)!
    const point: Record<string, number | string> = { date }
    for (const sid of stageIds) {
      point[sid] = dayMap.get(sid) || 0
    }
    return point
  })
}
