import { useState, useEffect, useMemo, useCallback } from 'react'

import { PayrollDetailView } from './PayrollDetailView'
import { PayrollHistoryView } from './PayrollHistoryView'
import { usePayrollActions } from './usePayrollActions'
import { useToast } from '../../contexts/ToastContext'
import { useAuthStore, useAppStore } from '../../stores'
import { type PayrollPeriod, type PayrollEntry } from '../../types/electron-api/PayrollAPI'
import { unwrapArrayResult } from '../../utils/ipc'
import { reportRuntimeError } from '../../utils/runtimeError'
import { usePayrollExports } from '../../hooks/usePayrollExports'

function computeSummary(payrollData: PayrollEntry[]) {
    if (payrollData.length === 0) { return null }
    return {
        headcount: payrollData.length,
        totalGross: payrollData.reduce((s, p) => s + p.gross_salary, 0),
        totalDeductions: payrollData.reduce((s, p) => s + p.total_deductions, 0),
        totalNet: payrollData.reduce((s, p) => s + p.net_salary, 0),
    }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function PayrollRun() {
    const user = useAuthStore((s) => s.user)
    const schoolSettings = useAppStore((s) => s.schoolSettings)
    const { showToast } = useToast()

    const [month, setMonth] = useState(new Date().getMonth() + 1)
    const [year, setYear] = useState(new Date().getFullYear())
    const [payrollData, setPayrollData] = useState<PayrollEntry[]>([])
    const [history, setHistory] = useState<PayrollPeriod[]>([])
    const [running, setRunning] = useState(false)
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [error, setError] = useState('')
    const [selectedPeriod, setSelectedPeriod] = useState<Partial<PayrollPeriod> | null>(null)

    const { exportP10Csv, isExportingP10, generatePayslip } = usePayrollExports()

    const summary = useMemo(() => computeSummary(payrollData), [payrollData])

    const loadHistory = useCallback(async () => {
        setLoadingHistory(true)
        try {
            const data = await globalThis.electronAPI.staff.getPayrollHistory()
            setHistory(unwrapArrayResult(data, 'Failed to load payroll history'))
        } catch (err) {
            showToast(reportRuntimeError(err, { area: 'Payroll.Run', action: 'loadHistory' }, 'Failed to load payroll history'), 'error')
        } finally {
            setLoadingHistory(false)
        }
    }, [showToast])

    useEffect(() => { void loadHistory() }, [loadHistory])

    const handleBack = useCallback(() => {
        setSelectedPeriod(null)
        setPayrollData([])
        setError('')
        void loadHistory()
    }, [loadHistory])

    const actions = usePayrollActions({
        user, selectedPeriod, payrollData, schoolSettings,
        loadHistory, handleBack, showToast,
        setSelectedPeriod, setPayrollData, setError,
        exportP10Csv, isExportingP10, generatePayslip,
    })

    const loadPeriodDetails = async (periodId: number) => {
        setRunning(true)
        setError('')
        try {
            const response = await globalThis.electronAPI.staff.getPayrollDetails(periodId)
            if (!response.success) {
                setError(response.error || 'Failed to load payroll details')
                return
            }
            setPayrollData(unwrapArrayResult(response.results ?? [], 'Payroll details returned invalid staff rows'))
            setSelectedPeriod(response.period || null)
        } catch (err) {
            setError(reportRuntimeError(err, { area: 'Payroll.Run', action: 'loadPeriodDetails' }, 'Failed to load payroll details'))
        } finally {
            setRunning(false)
        }
    }

    const runPayroll = async () => {
        if (!user) {
            setError('User not authenticated')
            return
        }
        setRunning(true)
        setError('')
        try {
            const result = await globalThis.electronAPI.staff.runPayroll(month, year, user.id)
            if (!result.success) {
                setError(result.error || 'Failed to run payroll')
                return
            }
            setPayrollData(unwrapArrayResult(result.results ?? [], 'Payroll run returned invalid staff rows'))
            setSelectedPeriod({
                id: result.periodId,
                period_name: `${MONTHS[month - 1]} ${year}`,
                status: 'DRAFT'
            } as Partial<PayrollPeriod>)
            await loadHistory()
        } catch (err) {
            setError(reportRuntimeError(err, { area: 'Payroll.Run', action: 'runPayroll' }, 'An error occurred while processing payroll'))
        } finally {
            setRunning(false)
        }
    }

    if (selectedPeriod || payrollData.length > 0) {
        return (
            <PayrollDetailView
                selectedPeriod={selectedPeriod}
                payrollData={payrollData}
                error={error}
                summary={summary}
                actionLoading={actions.actionLoading}
                notifying={actions.notifying}
                isExportingP10={actions.isExportingP10}
                confirmDialogCopy={actions.confirmDialogCopy}
                isDialogProcessing={actions.isDialogProcessing}
                handleBack={handleBack}
                handleConfirm={actions.handleConfirm}
                handleMarkPaid={actions.handleMarkPaid}
                handleRevertToDraft={actions.handleRevertToDraft}
                handleDelete={actions.handleDelete}
                handleRecalculate={actions.handleRecalculate}
                handleExportCSV={actions.handleExportCSV}
                handleExportP10={actions.handleExportP10}
                requestActionConfirmation={actions.requestActionConfirmation}
                handleNotifyStaff={actions.handleNotifyStaff}
                handlePrintPayslip={actions.handlePrintPayslip}
                executeConfirmedAction={actions.executeConfirmedAction}
                setConfirmAction={actions.setConfirmAction}
            />
        )
    }

    return (
        <PayrollHistoryView
            month={month}
            year={year}
            running={running}
            error={error}
            loadingHistory={loadingHistory}
            history={history}
            months={MONTHS}
            userName={user?.full_name}
            confirmDialogCopy={actions.confirmDialogCopy}
            isDialogProcessing={actions.isDialogProcessing}
            setMonth={setMonth}
            setYear={setYear}
            runPayroll={runPayroll}
            loadPeriodDetails={loadPeriodDetails}
            executeConfirmedAction={actions.executeConfirmedAction}
            setConfirmAction={actions.setConfirmAction}
        />
    )
}