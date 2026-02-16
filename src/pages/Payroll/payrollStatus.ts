export type PayrollUiStatus = 'DRAFT' | 'CONFIRMED' | 'PAID'

const PAYROLL_STATUS_ALIASES: Record<string, PayrollUiStatus> = {
    DRAFT: 'DRAFT',
    OPEN: 'DRAFT',
    SUBMITTED: 'DRAFT',
    CONFIRMED: 'CONFIRMED',
    APPROVED: 'CONFIRMED',
    POSTED: 'CONFIRMED',
    PENDING_APPROVAL: 'CONFIRMED',
    PAID: 'PAID',
}

export function normalizePayrollStatus(status: unknown): PayrollUiStatus {
    if (typeof status !== 'string') {
        return 'DRAFT'
    }

    const normalized = status.trim().toUpperCase()
    return PAYROLL_STATUS_ALIASES[normalized] ?? 'DRAFT'
}

