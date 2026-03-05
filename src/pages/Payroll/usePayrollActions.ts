import { useState, useCallback, useMemo } from 'react'

import { type PayrollConfirmAction, getConfirmDialogCopy } from './payrollHelpers'
import { type PayrollEntry, type PayrollPeriod } from '../../types/electron-api/PayrollAPI'
import { type SchoolSettings } from '../../types/electron-api/SettingsAPI'
import { type User } from '../../types/electron-api/UserAPI'
import { formatCurrencyFromCents } from '../../utils/format'
import { unwrapArrayResult } from '../../utils/ipc'
import { printDocument } from '../../utils/print'
import { reportRuntimeError } from '../../utils/runtimeError'

function validateActionGuard(
    action: PayrollConfirmAction,
    user: unknown,
    periodId: number | undefined,
    payrollCount: number,
): { message: string; level: 'error' | 'warning' } | null {
    if (!user) { return { message: 'User not authenticated', level: 'error' } }
    if (action !== 'bulkNotify' && !periodId) { return { message: 'Select a payroll period first', level: 'warning' } }
    if (action === 'bulkNotify' && payrollCount === 0) { return { message: 'No staff records available to notify', level: 'warning' } }
    return null
}

type ShowToast = (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void

async function notifyStaffMember(
    staff: PayrollEntry, user: User, periodName: string | undefined, showToast: ShowToast,
) {
    try {
        const message = `Salary Notification: Your salary for ${periodName} has been processed. Net Pay: ${formatCurrencyFromCents(staff.net_salary)}. Thank you.`
        const result = await globalThis.electronAPI.communications.sendSMS({
            to: staff.phone!, message,
            recipientId: staff.staff_id, recipientType: 'STAFF', userId: user.id
        })
        if (result.success) {
            showToast(`Notification sent to ${staff.staff_name}`, 'success')
        } else {
            showToast(result.error || `Failed to notify ${staff.staff_name}`, 'error')
        }
    } catch (err) {
        showToast(
            reportRuntimeError(err, { area: 'Payroll.Run', action: 'notifyStaff' }, `Error sending notification to ${staff.staff_name}`),
            'error'
        )
    }
}

async function sendBulkNotifications(
    payrollData: PayrollEntry[], user: User, periodName: string | undefined, showToast: ShowToast,
): Promise<void> {
    let sent = 0
    let failed = 0

    for (const staff of payrollData) {
        if (!staff.phone) {
            failed++
            continue
        }
        try {
            const message = `Salary Notification: Your salary for ${periodName} has been processed. Net Pay: ${formatCurrencyFromCents(staff.net_salary)}. Thank you.`
            const result = await globalThis.electronAPI.communications.sendSMS({
                to: staff.phone, message,
                recipientId: staff.staff_id, recipientType: 'STAFF', userId: user.id
            })
            if (result.success) { sent++ }
            else { failed++ }
        } catch {
            failed++
        }
    }

    if (failed === 0) {
        showToast(`Salary notifications sent to ${sent} staff member(s)`, 'success')
        return
    }
    showToast(`Notifications complete: ${sent} sent, ${failed} failed`, 'warning')
}

interface PayrollActionDeps {
    user: User | null
    selectedPeriod: Partial<PayrollPeriod> | null
    payrollData: PayrollEntry[]
    schoolSettings: SchoolSettings | null
    loadHistory: () => Promise<void>
    handleBack: () => void
    showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
    setSelectedPeriod: React.Dispatch<React.SetStateAction<Partial<PayrollPeriod> | null>>
    setPayrollData: React.Dispatch<React.SetStateAction<PayrollEntry[]>>
    setError: React.Dispatch<React.SetStateAction<string>>
    exportP10Csv: (periodId: number) => Promise<string | null>
    isExportingP10: boolean
    generatePayslip: (payrollId: number) => Promise<{
        period_name: string
        earnings: { basic_salary: number; gross_pay: number; allowances: Array<{ name: string; amount: number }> }
        deductions: { total_deductions: number; items: Array<{ name: string; amount: number }> }
        net_pay: number
        school_name: string
    } | null>
}

export function usePayrollActions(deps: PayrollActionDeps) {
    const {
        user, selectedPeriod, payrollData, schoolSettings,
        loadHistory, handleBack, showToast,
        setSelectedPeriod, setPayrollData, setError,
        exportP10Csv, isExportingP10, generatePayslip,
    } = deps

    const [notifying, setNotifying] = useState(false)
    const [actionLoading, setActionLoading] = useState<PayrollConfirmAction | ''>('')
    const [confirmAction, setConfirmAction] = useState<PayrollConfirmAction | null>(null)

    // ── Action confirmation ──────────────────────────────────

    const requestActionConfirmation = useCallback((action: PayrollConfirmAction) => {
        const guard = validateActionGuard(action, user, selectedPeriod?.id, payrollData.length)
        if (guard) {
            showToast(guard.message, guard.level)
            return
        }
        setConfirmAction(action)
    }, [payrollData.length, selectedPeriod?.id, showToast, user])

    const handleConfirm = useCallback(() => { requestActionConfirmation('confirm') }, [requestActionConfirmation])
    const handleMarkPaid = useCallback(() => { requestActionConfirmation('markPaid') }, [requestActionConfirmation])
    const handleRevertToDraft = useCallback(() => { requestActionConfirmation('revert') }, [requestActionConfirmation])
    const handleDelete = useCallback(() => { requestActionConfirmation('delete') }, [requestActionConfirmation])
    const handleRecalculate = useCallback(() => { requestActionConfirmation('recalculate') }, [requestActionConfirmation])

    // ── Execute callbacks ────────────────────────────────────

    const executeConfirm = useCallback(async () => {
        if (!selectedPeriod?.id || !user) { return }
        setActionLoading('confirm')
        try {
            const result = await globalThis.electronAPI.staff.confirmPayroll(selectedPeriod.id, user.id)
            if (result.success) {
                setSelectedPeriod(prev => prev ? { ...prev, status: 'CONFIRMED' } : null)
                await loadHistory()
                showToast('Payroll confirmed successfully', 'success')
                return
            }
            setError(result.error || 'Failed to confirm payroll')
        } catch (err) {
            setError(reportRuntimeError(err, { area: 'Payroll.Run', action: 'confirmPayroll' }, 'Failed to confirm payroll'))
        } finally {
            setActionLoading('')
        }
    }, [loadHistory, selectedPeriod?.id, setError, setSelectedPeriod, showToast, user])

    const executeMarkPaid = useCallback(async () => {
        if (!selectedPeriod?.id || !user) { return }
        setActionLoading('markPaid')
        try {
            const result = await globalThis.electronAPI.staff.markPayrollPaid(selectedPeriod.id, user.id)
            if (result.success) {
                setSelectedPeriod(prev => prev ? { ...prev, status: 'PAID' } : null)
                await loadHistory()
                showToast('Payroll marked as paid', 'success')
                return
            }
            setError(result.error || 'Failed to mark payroll as paid')
        } catch (err) {
            setError(reportRuntimeError(err, { area: 'Payroll.Run', action: 'markPayrollPaid' }, 'Failed to mark payroll as paid'))
        } finally {
            setActionLoading('')
        }
    }, [loadHistory, selectedPeriod?.id, setError, setSelectedPeriod, showToast, user])

    const executeRevertToDraft = useCallback(async () => {
        if (!selectedPeriod?.id || !user) { return }
        setActionLoading('revert')
        try {
            const result = await globalThis.electronAPI.staff.revertPayrollToDraft(selectedPeriod.id, user.id)
            if (result.success) {
                setSelectedPeriod(prev => prev ? { ...prev, status: 'DRAFT' } : null)
                await loadHistory()
                showToast('Payroll reverted to draft', 'success')
                return
            }
            setError(result.error || 'Failed to revert payroll')
        } catch (err) {
            setError(reportRuntimeError(err, { area: 'Payroll.Run', action: 'revertPayrollToDraft' }, 'Failed to revert payroll'))
        } finally {
            setActionLoading('')
        }
    }, [loadHistory, selectedPeriod?.id, setError, setSelectedPeriod, showToast, user])

    const executeDelete = useCallback(async () => {
        if (!selectedPeriod?.id || !user) { return }
        setActionLoading('delete')
        try {
            const result = await globalThis.electronAPI.staff.deletePayroll(selectedPeriod.id, user.id)
            if (result.success) {
                handleBack()
                showToast('Payroll draft deleted', 'success')
                return
            }
            setError(result.error || 'Failed to delete payroll')
        } catch (err) {
            setError(reportRuntimeError(err, { area: 'Payroll.Run', action: 'deletePayroll' }, 'Failed to delete payroll'))
        } finally {
            setActionLoading('')
        }
    }, [handleBack, selectedPeriod?.id, setError, showToast, user])

    const executeRecalculate = useCallback(async () => {
        if (!selectedPeriod?.id || !user) { return }
        setActionLoading('recalculate')
        try {
            const result = await globalThis.electronAPI.staff.recalculatePayroll(selectedPeriod.id, user.id)
            if (result.success) {
                setPayrollData(unwrapArrayResult(result.results ?? [], 'Payroll recalculation returned invalid staff rows'))
                showToast('Payroll recalculated', 'success')
                return
            }
            setError(result.error || 'Failed to recalculate payroll')
        } catch (err) {
            setError(reportRuntimeError(err, { area: 'Payroll.Run', action: 'recalculatePayroll' }, 'Failed to recalculate payroll'))
        } finally {
            setActionLoading('')
        }
    }, [selectedPeriod?.id, setError, setPayrollData, showToast, user])

    // ── Export handlers ──────────────────────────────────────

    const handleExportCSV = useCallback(() => {
        if (payrollData.length === 0) { return }
        const headers = ['Staff Name', 'Staff No', 'Department', 'Basic (KSh)', 'Allowances (KSh)', 'Gross (KSh)', 'PAYE (KSh)', 'NSSF (KSh)', 'SHIF (KSh)', 'Housing Levy (KSh)', 'Total Deductions (KSh)', 'Net Pay (KSh)']
        const toCurrency = (v: number) => (v / 100).toFixed(2)
        const rows = payrollData.map(p => [
            p.staff_name, p.staff_number || '', p.department || '',
            toCurrency(p.basic_salary), toCurrency(p.allowances), toCurrency(p.gross_salary),
            toCurrency(p.paye), toCurrency(p.nssf), toCurrency(p.shif), toCurrency(p.housing_levy),
            toCurrency(p.total_deductions), toCurrency(p.net_salary)
        ])
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `payroll-${selectedPeriod?.period_name?.replaceAll(/\s+/g, '-') || 'export'}.csv`
        URL.revokeObjectURL(url)
    }, [payrollData, selectedPeriod?.period_name])

    const handleExportP10 = useCallback(async () => {
        if (!selectedPeriod?.id) { return }
        const csvContent = await exportP10Csv(selectedPeriod.id)
        if (csvContent) {
            const blob = new Blob([csvContent], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `P10-${selectedPeriod?.period_name?.replaceAll(/\s+/g, '-') || 'export'}.csv`
            a.click()
            URL.revokeObjectURL(url)
            showToast('P10 successfully exported', 'success')
        }
    }, [exportP10Csv, selectedPeriod?.id, selectedPeriod?.period_name, showToast])

    // ── Notification handlers ────────────────────────────────

    const handleNotifyStaff = async (staff: PayrollEntry) => {
        if (!staff.phone) {
            showToast('Staff phone number is missing', 'warning')
            return
        }
        if (!user) {
            showToast('User not authenticated', 'error')
            return
        }
        await notifyStaffMember(staff, user, selectedPeriod?.period_name, showToast)
    }

    const handleBulkNotify = async () => {
        if (!user) {
            showToast('User not authenticated', 'error')
            return
        }
        if (payrollData.length === 0) {
            showToast('No payroll staff entries found for notifications', 'warning')
            return
        }

        setNotifying(true)
        await sendBulkNotifications(payrollData, user, selectedPeriod?.period_name, showToast)
        setNotifying(false)
    }

    const handlePrintPayslip = async (staffEntry: PayrollEntry) => {
        try {
            const { printPayslipForStaff } = await import('./utils/printPayslip')
            await printPayslipForStaff(
                staffEntry,
                selectedPeriod?.period_name,
                generatePayslip,
                printDocument,
                schoolSettings ?? {}
            )
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Failed to print payslip', 'error')
        }
    }

    // ── Confirmed-action dispatch ────────────────────────────

    const executeConfirmedAction = async () => {
        if (!confirmAction) { return }
        const action: PayrollConfirmAction = confirmAction
        setConfirmAction(null)

        switch (action) {
            case 'confirm':
                await executeConfirm()
                break
            case 'markPaid':
                await executeMarkPaid()
                break
            case 'revert':
                await executeRevertToDraft()
                break
            case 'delete':
                await executeDelete()
                break
            case 'recalculate':
                await executeRecalculate()
                break
            case 'bulkNotify':
                await handleBulkNotify()
                break
            default:
                break
        }
    }

    // ── Derived state ────────────────────────────────────────

    const confirmDialogCopy = useMemo(
        () => getConfirmDialogCopy(confirmAction, payrollData.length, selectedPeriod?.period_name),
        [confirmAction, payrollData.length, selectedPeriod?.period_name]
    )

    const isDialogProcessing = confirmAction === 'bulkNotify'
        ? notifying
        : confirmAction !== null && actionLoading === confirmAction

    return {
        // State
        actionLoading,
        confirmAction,
        notifying,
        isExportingP10,
        confirmDialogCopy,
        isDialogProcessing,

        // Setters
        setConfirmAction,

        // Handlers
        requestActionConfirmation,
        handleConfirm,
        handleMarkPaid,
        handleRevertToDraft,
        handleDelete,
        handleRecalculate,
        handleExportCSV,
        handleExportP10,
        handleNotifyStaff,
        handleBulkNotify,
        handlePrintPayslip,
        executeConfirmedAction,
    }
}
