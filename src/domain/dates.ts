export function parseISODate(value: string): { year: number; month: number; day: number } {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return { year: y, month: m, day: d }
}

export function monthStart(value: string): string {
  const { year, month } = parseISODate(value)
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function monthKey(value: string): string {
  const { year, month } = parseISODate(value)
  return `${year}-${String(month).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function addMonths(value: string, months: number): string {
  const { year, month, day } = parseISODate(value)
  const total = month - 1 + months
  const nextYear = year + Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  const nextDay = Math.min(day, daysInMonth(nextYear, nextMonth))
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`
}

/** Inclusive month distance: Jan→Jan = 0, Jan→Feb = 1. */
export function monthsBetween(start: string, end: string): number {
  const a = parseISODate(start)
  const b = parseISODate(end)
  return (b.year - a.year) * 12 + (b.month - a.month)
}

export function* iterMonths(start: string, end: string): Generator<string> {
  let current = monthStart(start)
  const last = monthStart(end)
  while (current <= last) {
    yield current
    current = addMonths(current, 1)
  }
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10)
}
