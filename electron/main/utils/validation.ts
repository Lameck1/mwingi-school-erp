/**
 * Validation utility for hardening IPC data integrity.
 * Ensures all financial data (amounts, dates, IDs) is valid BEFORE DB operations.
 */

export interface ValidationResult<T> {
    success: boolean
    data?: T
    error?: string
}

export const validateAmount = (amount: unknown): ValidationResult<number> => {
    const num = Number(amount)
    if (isNaN(num) || num < 0) {
        return { success: false, error: 'Invalid amount. Must be a positive number.' }
    }
    // Convert to cents (integer) for internal handling
    return { success: true, data: Math.round(num * 100) }
}

export const formatFromCents = (cents: number): number => {
    return cents / 100
}

export const validateId = (id: unknown, label: string = 'ID'): ValidationResult<number> => {
    const num = Number(id)
    if (isNaN(num) || num <= 0) {
        return { success: false, error: `Invalid ${label}.` }
    }
    return { success: true, data: num }
}

export const validateDate = (date: unknown): ValidationResult<string> => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date)) {
        return { success: false, error: 'Invalid date format. Expected YYYY-MM-DD.' }
    }
    return { success: true, data: date }
}

export const sanitizeString = (str: unknown, maxLength: number = 255): string => {
    if (typeof str !== 'string') return ''
    return str.trim().slice(0, maxLength)
}
