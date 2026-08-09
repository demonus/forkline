/** Quantize like Python Decimal quantize(0.0001, ROUND_HALF_UP). */
export function q(value: number): number {
  if (!Number.isFinite(value)) return 0
  const sign = value < 0 ? -1 : 1
  const scaled = Math.abs(value) * 10000
  const whole = Math.floor(scaled)
  const frac = scaled - whole
  const rounded = frac >= 0.5 ? whole + 1 : whole
  return (sign * rounded) / 10000
}

export function num(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
