// Calendar dates travel as 'YYYY-MM-DD' strings. All arithmetic goes through
// UTC so the viewer's time zone and DST transitions never shift a day.
// (new Date('2026-01-05') is UTC midnight, which is the previous day in
// the Americas if read back with local getters.)

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseISODate(iso: string): Date | null {
  if (!ISO_DATE.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  // Date.UTC rolls 2026-02-30 over to March; reject instead.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null
  }
  return date
}

function mustParse(iso: string): Date {
  const date = parseISODate(iso)
  if (!date) throw new Error(`invalid date: ${iso}`)
  return date
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const date = mustParse(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return toISO(date)
}

export function mondayOf(iso: string): string {
  const daysSinceMonday = (mustParse(iso).getUTCDay() + 6) % 7
  return addDays(iso, -daysSinceMonday)
}

export function sundayOf(iso: string): string {
  return addDays(mondayOf(iso), 6)
}

// Number of whole Monday–Sunday weeks once from/to are widened, matching the
// server's snapping in api/capacity.go.
export function weekSpan(from: string, to: string): number {
  const days = (mustParse(sundayOf(to)).getTime() - mustParse(mondayOf(from)).getTime()) / 86_400_000 + 1
  return days / 7
}

// Today's date where the viewer is — the one place local time is the point.
export function todayISO(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export function formatDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  return mustParse(iso).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' })
}
