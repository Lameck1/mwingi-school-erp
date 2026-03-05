import { normalizePayrollStatus } from './payrollStatus'

export type PayrollConfirmAction = 'confirm' | 'markPaid' | 'revert' | 'delete' | 'recalculate' | 'bulkNotify'

export const getHistoryStatusColor = (s: unknown) => {
    const normalizedStatus = normalizePayrollStatus(s)
    if (normalizedStatus === 'PAID') { return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' }
    if (normalizedStatus === 'CONFIRMED') { return 'bg-blue-500/10 border-blue-500/20 text-blue-400' }
    return 'bg-amber-500/10 border-amber-500/20 text-amber-400'
}

export function getConfirmDialogCopy(
    action: PayrollConfirmAction | null,
    staffCount: number,
    periodName?: string
): { title: string; message: string; confirmLabel: string } | null {
    switch (action) {
        case 'confirm':
            return {
                title: 'Confirm Payroll',
                message: 'Confirm this payroll? Once confirmed, calculations are locked and the payroll is ready for payment processing.',
                confirmLabel: 'Confirm Payroll',
            }
        case 'markPaid':
            return {
                title: 'Mark Payroll as Paid',
                message: `Mark all ${staffCount} staff member(s) as paid for ${periodName || 'this period'}? This records today as the payment date.`,
                confirmLabel: 'Mark as Paid',
            }
        case 'revert':
            return {
                title: 'Revert Payroll to Draft',
                message: 'Revert this payroll to draft? This unlocks the payroll for recalculation and editing.',
                confirmLabel: 'Revert to Draft',
            }
        case 'delete':
            return {
                title: 'Delete Draft Payroll',
                message: `Permanently delete ${periodName || 'this payroll'}? This action cannot be undone.`,
                confirmLabel: 'Delete Draft',
            }
        case 'recalculate':
            return {
                title: 'Recalculate Payroll',
                message: 'Recalculate this payroll with current staff data and statutory rates? Existing calculations will be replaced.',
                confirmLabel: 'Recalculate',
            }
        case 'bulkNotify':
            return {
                title: 'Notify All Staff',
                message: `Send salary notifications to ${staffCount} staff member(s) for ${periodName || 'this period'}?`,
                confirmLabel: 'Send Notifications',
            }
        case null:
            return null
    }
}
