/**
 * Normalize an invoice status to a canonical upper-case string.
 * Returns 'PENDING' for null / undefined / empty inputs.
 */
export const normalizeInvoiceStatus = (status: string | null | undefined): string =>
  (status ?? 'PENDING').toUpperCase()
