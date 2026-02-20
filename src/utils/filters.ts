/**
 * Normalizes filter objects before sending them to IPC handlers.
 * - Converts empty strings '' to undefined.
 * - Converts numeric strings to numbers if the key ends in 'Id' or 'Year'.
 * - Preserves booleans, numbers, and non-empty strings.
 */
export function normalizeFilters<T extends Record<string, unknown>>(filters: T): Partial<T> {
    const normalized: Record<string, unknown> = {}

    Object.entries(filters).forEach(([key, value]) => {
        // Convert empty string to undefined
        if (value === '') {
            normalized[key] = undefined
            return
        }

        // Convert numeric-like IDs/Years to numbers
        if (typeof value === 'string' && (key.toLowerCase().endsWith('id') || key.toLowerCase().endsWith('year'))) {
            const num = Number(value)
            if (!isNaN(num) && value.trim() !== '') {
                normalized[key] = num
                return
            }
        }

        normalized[key] = value
    })

    return normalized as Partial<T>
}
