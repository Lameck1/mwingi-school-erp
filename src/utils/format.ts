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
export function formatCurrency(amount: number | null | undefined): string {
    if (amount === null || amount === undefined || isNaN(Number(amount))) {
        return 'KES 0.00'
    }

    // Amount is already in whole currency units (not cents)
    const displayAmount = Number(amount)

    return new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: 'KES',
        minimumFractionDigits: 2,
    }).format(displayAmount)
}

/**
 * Format a date string to a localized date format
 * @param dateString - ISO date string or Date object
 * @returns Formatted date string (e.g., "Jan 23, 2026") or "N/A"
 */
export function formatDate(dateString: string | Date | null | undefined): string {
    if (!dateString) return 'N/A'

    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'N/A'

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
export function formatDateTime(dateString: string | Date | null | undefined): string {
    if (!dateString) return 'N/A'

    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'N/A'

    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

