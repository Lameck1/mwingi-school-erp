/**
 * Shared formatting utilities for the Mwingi School ERP application
 */

/**
 * Format a number as Kenyan Shillings (KES) currency
 * @param amount - The amount to format (in whole currency units)
 * @returns Formatted currency string (e.g., "Ksh 34,000.00")
 */
// Cached formatter — avoids re-constructing Intl.NumberFormat on every call (~10μs savings per call)
const kesFormatter = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

export function formatCurrency(amount?: number | null): string {
    if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
        return 'Ksh 0.00'
    }

    const displayAmount = Number(amount)
    const formatted = kesFormatter.format(displayAmount)

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

/**
 * Escape a value for safe inclusion in a CSV cell.
 * Wraps the value in quotes if it contains commas, quotes, or newlines.
 */
export function escapeCsvField(v: string | number): string {
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replaceAll('"', '""')}"` : s
}

/**
 * Convert a non-negative integer to English words.
 * Supports values from 0 up to 999,999,999 (millions).
 * @example numberToWords(1234) → "One Thousand Two Hundred and Thirty Four"
 */
export function numberToWords(num: number): string {
    const ones = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen',
    ]
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

    if (num === 0) { return 'Zero' }
    if (num < 20) { return ones[num] ?? '' }
    if (num < 100) { return (tens[Math.floor(num / 10)] ?? '') + (num % 10 ? ' ' + (ones[num % 10] ?? '') : '') }
    if (num < 1000) { return (ones[Math.floor(num / 100)] ?? '') + ' Hundred' + (num % 100 ? ' and ' + numberToWords(num % 100) : '') }
    if (num < 1_000_000) { return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '') }
    return numberToWords(Math.floor(num / 1_000_000)) + ' Million' + (num % 1_000_000 ? ' ' + numberToWords(num % 1_000_000) : '')
}
