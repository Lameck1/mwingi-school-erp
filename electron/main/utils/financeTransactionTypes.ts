export const REPORT_INCOME_TRANSACTION_TYPES = ['INCOME', 'FEE_PAYMENT', 'DONATION', 'GRANT'] as const
export const REPORT_EXPENSE_TRANSACTION_TYPES = ['EXPENSE', 'SALARY_PAYMENT', 'REFUND'] as const
export const OUTSTANDING_INVOICE_STATUSES = ['PENDING', 'PARTIAL', 'OUTSTANDING'] as const

export function asSqlInList(values: readonly string[]): string {
    return values.map(value => `'${value}'`).join(', ')
}
