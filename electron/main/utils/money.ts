// NOTE: Keep in sync with src/utils/format.ts (renderer counterpart)
export function shillingsToCents(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') {return 0}
  const num = Number(value)
  if (Number.isNaN(num)) {return 0}
  return Math.round(num * 100)
}

export function centsToShillings(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') {return 0}
  const num = Number(value)
  if (Number.isNaN(num)) {return 0}
  return num / 100
}
