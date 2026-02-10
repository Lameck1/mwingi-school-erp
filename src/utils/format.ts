/**
 * Shared formatting utilities for the Mwingi School ERP application
 */

/**
 * Format a number as Kenyan Shillings (KES) currency
 * @param amount - The amount to format
 * @returns Formatted currency string (e.g., "KES 1,500")
 */
/**
 * Format a number as Kenyan Shillings (KES) currency
 * @param amount - The amount to format (in whole currency units)
 * @returns Formatted currency string (e.g., "KES 34,000.00")
 */
/**
 * Format a number as Kenyan Shillings (KES) currency
 * @param amount - The amount to format (in whole currency units)
 * @returns Formatted currency string (e.g., "KES 34,000.00")
 */
export function formatCurrency(amount?: number | null): string {
    if (amount === null || amount === undefined || isNaN(Number(amount))) {
        return 'Ksh 0.00'
    }

    const displayAmount = Number(amount)
    const formatted = new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: 'KES',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(displayAmount)

    // Normalize currency label to "Ksh" for UI consistency
    return formatted.replaceAll('KES', 'Ksh').replaceAll('KSh', 'Ksh').replaceAll('\u00A0', ' ')
}

/**
 * Format a cents-based amount as Kenyan Shillings (KES) currency
 * @param cents - The amount in cents
 * @returns Formatted currency string (e.g., "KES 34,000.00")
 */
export function formatCurrencyFromCents(cents?: number | null): string {
    return formatCurrency(centsToShillings(cents))
}

/**
 * Convert database cents to whole shillings
 * @param cents - Amount in cents
 * @returns Amount in shillings
 */
export function centsToShillings(cents: number | string | null | undefined): number {
    if (cents === null || cents === undefined) {return 0}
    return Number(cents) / 100
}

/**
 * Convert whole shillings to database cents
 * @param shillings - Amount in shillings
 * @returns Amount in cents (rounded to integer)
 */
export function shillingsToCents(shillings: number | string | null | undefined): number {
    if (shillings === null || shillings === undefined) {return 0}
    return Math.round(Number(shillings) * 100)
}

/**
 * Format a date string to a localized date format
 * @param dateString - ISO date string or Date object
 * @returns Formatted date string (e.g., "Jan 23, 2026") or "N/A"
 */
export function formatDate(dateString?: string | Date | null): string {
    if (!dateString) {return 'N/A'}

    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) {return 'N/A'}

    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
}

/**
 * Format a date string to a localized datetime format
 * @param dateString - ISO date string or Date object
 * @returns Formatted datetime string or "N/A"
 */
export function formatDateTime(dateString?: string | Date | null): string {
    if (!dateString) {return 'N/A'}

    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) {return 'N/A'}

    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

