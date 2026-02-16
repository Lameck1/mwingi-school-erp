import { Calculator, Play, AlertCircle, ChevronLeft, Eye, Printer, MessageSquare, Loader2, Calendar, CheckCircle2, CreditCard, RotateCcw, Trash2, RefreshCw, Users, TrendingDown, Wallet, FileSpreadsheet, ShieldCheck, Lock } from 'lucide-react'
import { useState, useEffect, useMemo, useCallback } from 'react'

import { normalizePayrollStatus, type PayrollUiStatus } from './payrollStatus'
import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'
import { useAuthStore, useAppStore } from '../../stores'
import { type PayrollPeriod, type PayrollEntry } from '../../types/electron-api/PayrollAPI'
import { formatCurrencyFromCents } from '../../utils/format'
import { printDocument } from '../../utils/print'

export default function PayrollRun() {
    const { user } = useAuthStore()
    const { schoolSettings } = useAppStore()
    const [month, setMonth] = useState(new Date().getMonth() + 1)
    const [year, setYear] = useState(new Date().getFullYear())
    const [payrollData, setPayrollData] = useState<PayrollEntry[]>([])
    const [history, setHistory] = useState<PayrollPeriod[]>([])
    const [running, setRunning] = useState(false)
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [error, setError] = useState('')
    const [selectedPeriod, setSelectedPeriod] = useState<Partial<PayrollPeriod> | null>(null)
    const [notifying, setNotifying] = useState(false)
    const [actionLoading, setActionLoading] = useState('')

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    const summary = useMemo(() => {
        if (payrollData.length === 0) { return null }
        return {
            headcount: payrollData.length,
            totalGross: payrollData.reduce((s, p) => s + p.gross_salary, 0),
            totalDeductions: payrollData.reduce((s, p) => s + p.total_deductions, 0),
            totalNet: payrollData.reduce((s, p) => s + p.net_salary, 0),
        }
    }, [payrollData])

    const loadHistory = useCallback(async () => {
        setLoadingHistory(true)
        try {
            const api = globalThis.electronAPI
            const data = await api.getPayrollHistory()
            setHistory(data)
        } catch (err) {
            console.error('Failed to load history', err)
        } finally {
            setLoadingHistory(false)
        }
    }, [])

    useEffect(() => {
        void loadHistory()
    }, [loadHistory])

    const loadPeriodDetails = async (periodId: number) => {
        setRunning(true)
        setError('')
        try {
            const api = globalThis.electronAPI
            const response = await api.getPayrollDetails(periodId)
            if (response.success) {
                setPayrollData(response.results || [])
                setSelectedPeriod(response.period || null)
            } else {
                setError(response.error || 'Failed to load payroll details')
            }
        } catch (err) {
            console.error(err)
            setError('Failed to load payroll details')
        } finally {
            setRunning(false)
        }
    }




    const runPayroll = async () => {
        setRunning(true)
        setError('')
        try {
            if (!user) {
                setError('User not authenticated')
                return
            }
            const api = globalThis.electronAPI
            const result = await api.runPayroll(month, year, user.id)
            if (result.success) {
                setPayrollData(result.results || [])
                setSelectedPeriod({ id: result.periodId, period_name: `${months[month - 1]} ${year}`, status: 'DRAFT' })
                await loadHistory() // Refresh history
            } else {
                setError(result.error || 'Failed to run payroll')
            }
        } catch (err) {
            console.error(err)
            setError('An error occurred while processing payroll')
        } finally {
            setRunning(false)
        }
    }

    const handleBack = useCallback(() => {
        setSelectedPeriod(null)
        setPayrollData([])
        setError('')
        void loadHistory()
    }, [loadHistory])

    const handleConfirm = useCallback(async () => {
        if (!selectedPeriod?.id || !user) { return }
        if (!confirm('Confirm this payroll? Once confirmed, calculations are locked and the payroll is ready for payment processing.')) { return }
        setActionLoading('confirm')
        try {
            const result = await globalThis.electronAPI.confirmPayroll(selectedPeriod.id, user.id)
            if (result.success) {
                setSelectedPeriod(prev => prev ? { ...prev, status: 'CONFIRMED' } : null)
                await loadHistory()
            } else {
                setError(result.error || 'Failed to confirm payroll')
            }
        } catch { setError('Failed to confirm payroll') }
        finally { setActionLoading('') }
    }, [loadHistory, selectedPeriod?.id, user])

    const handleMarkPaid = useCallback(async () => {
        if (!selectedPeriod?.id || !user) { return }
        if (!confirm(`Mark all ${payrollData.length} staff members as PAID for ${selectedPeriod.period_name}? This records todays date as the payment date.`)) { return }
        setActionLoading('markPaid')
        try {
            const result = await globalThis.electronAPI.markPayrollPaid(selectedPeriod.id, user.id)
            if (result.success) {
                setSelectedPeriod(prev => prev ? { ...prev, status: 'PAID' } : null)
                await loadHistory()
            } else {
                setError(result.error || 'Failed to mark payroll as paid')
            }
        } catch { setError('Failed to mark payroll as paid') }
        finally { setActionLoading('') }
    }, [loadHistory, selectedPeriod?.id, selectedPeriod?.period_name, user, payrollData.length])

    const handleRevertToDraft = useCallback(async () => {
        if (!selectedPeriod?.id || !user) { return }
        if (!confirm('Revert this payroll back to DRAFT? This unlocks the payroll for editing and recalculation.')) { return }
        setActionLoading('revert')
        try {
            const result = await globalThis.electronAPI.revertPayrollToDraft(selectedPeriod.id, user.id)
            if (result.success) {
                setSelectedPeriod(prev => prev ? { ...prev, status: 'DRAFT' } : null)
                await loadHistory()
            } else {
                setError(result.error || 'Failed to revert payroll')
            }
        } catch { setError('Failed to revert payroll') }
        finally { setActionLoading('') }
    }, [loadHistory, selectedPeriod?.id, user])

    const handleDelete = useCallback(async () => {
        if (!selectedPeriod?.id || !user) { return }
        if (!confirm(`Permanently delete the ${selectedPeriod.period_name} payroll? This action cannot be undone.`)) { return }
        setActionLoading('delete')
        try {
            const result = await globalThis.electronAPI.deletePayroll(selectedPeriod.id, user.id)
            if (result.success) {
                handleBack()
            } else {
                setError(result.error || 'Failed to delete payroll')
            }
        } catch { setError('Failed to delete payroll') }
        finally { setActionLoading('') }
    }, [handleBack, selectedPeriod?.id, selectedPeriod?.period_name, user])

    const handleRecalculate = useCallback(async () => {
        if (!selectedPeriod?.id || !user) { return }
        if (!confirm('Recalculate this payroll with current staff data and statutory rates? Existing calculations will be replaced.')) { return }
        setActionLoading('recalculate')
        try {
            const result = await globalThis.electronAPI.recalculatePayroll(selectedPeriod.id, user.id)
            if (result.success) {
                setPayrollData(result.results || [])
            } else {
                setError(result.error || 'Failed to recalculate payroll')
            }
        } catch { setError('Failed to recalculate payroll') }
        finally { setActionLoading('') }
    }, [selectedPeriod?.id, user])

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
        a.click()
        URL.revokeObjectURL(url)
    }, [payrollData, selectedPeriod?.period_name])

    const getHistoryStatusColor = (s: unknown) => {
        const normalizedStatus = normalizePayrollStatus(s)
        if (normalizedStatus === 'PAID') { return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' }
        if (normalizedStatus === 'CONFIRMED') { return 'bg-blue-500/10 border-blue-500/20 text-blue-400' }
        return 'bg-amber-500/10 border-amber-500/20 text-amber-400'
    }

    const statusConfig: Record<PayrollUiStatus, { color: string; icon: typeof AlertCircle; label: string }> = {
        DRAFT: { color: 'bg-amber-500/10 border-amber-500/20 text-amber-400', icon: AlertCircle, label: 'Draft' },
        CONFIRMED: { color: 'bg-blue-500/10 border-blue-500/20 text-blue-400', icon: ShieldCheck, label: 'Confirmed' },
        PAID: { color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', icon: CheckCircle2, label: 'Paid' },
    }

    const renderStatusActions = (status: PayrollUiStatus, periodId: number | undefined) => (
        <div className="flex flex-wrap gap-2">
            {status === 'DRAFT' && periodId && (
                <>
                    <button onClick={handleRecalculate} disabled={!!actionLoading}
                        className="btn btn-secondary flex items-center gap-2 py-2 px-4 text-xs"
                        title="Recalculate with current rates and staff">
                        {actionLoading === 'recalculate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Recalculate
                    </button>
                    <button onClick={handleDelete} disabled={!!actionLoading}
                        className="btn flex items-center gap-2 py-2 px-4 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                        title="Delete this draft payroll">
                        {actionLoading === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Delete Draft
                    </button>
                    <button onClick={handleConfirm} disabled={!!actionLoading}
                        className="btn btn-primary flex items-center gap-2 py-2 px-5 text-xs shadow-lg shadow-primary/20"
                        title="Lock and confirm this payroll for payment">
                        {actionLoading === 'confirm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Confirm Payroll
                    </button>
                </>
            )}
            {status === 'CONFIRMED' && periodId && (
                <>
                    <button onClick={handleRevertToDraft} disabled={!!actionLoading}
                        className="btn btn-secondary flex items-center gap-2 py-2 px-4 text-xs"
                        title="Revert back to draft for editing">
                        {actionLoading === 'revert' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        Revert to Draft
                    </button>
                    <button onClick={handleMarkPaid} disabled={!!actionLoading}
                        className="btn flex items-center gap-2 py-2 px-5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
                        title="Record payment for all staff">
                        {actionLoading === 'markPaid' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                        Mark as Paid
                    </button>
                </>
            )}
            {status === 'PAID' && (
                <span className="flex items-center gap-2 py-2 px-4 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <Lock className="w-3.5 h-3.5" />
                    Payment Finalized
                </span>
            )}
            <button onClick={handleExportCSV} disabled={payrollData.length === 0}
                className="btn btn-secondary flex items-center gap-2 py-2 px-4 text-xs">
                <FileSpreadsheet className="w-4 h-4" />
                Export CSV
            </button>
            {(status === 'CONFIRMED' || status === 'PAID') && (
                <button
                    onClick={handleBulkNotify}
                    disabled={notifying || payrollData.length === 0}
                    className="btn btn-primary flex items-center gap-2 py-2 px-4 text-xs shadow-lg shadow-primary/20"
                >
                    {notifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    Notify All Staff
                </button>
            )}
        </div>
    )

    if (selectedPeriod || payrollData.length > 0) {
        const status = normalizePayrollStatus(selectedPeriod?.status)
        const cfg = statusConfig[status]
        const StatusIcon = cfg.icon
        const periodId = selectedPeriod?.id

        return (
            <div className="space-y-6 pb-10">
                {/* Header */}
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-5">
                            <button
                                onClick={handleBack}
                                aria-label="Go back"
                                className="p-3 bg-secondary hover:bg-primary/20 text-primary rounded-2xl transition-all hover:-translate-x-1"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h1 className="text-xl md:text-3xl font-bold text-foreground font-heading">
                                    {selectedPeriod?.period_name || 'Calculation Result'}
                                </h1>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">Payroll Status:</span>
                                    <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-0.5 rounded-full border flex items-center gap-1.5 ${cfg.color}`}>
                                        <StatusIcon className="w-3 h-3" />
                                        {cfg.label}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {renderStatusActions(status, periodId)}
                    </div>

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <p className="text-xs font-bold leading-tight">{error}</p>
                        </div>
                    )}
                </div>

                {/* Summary Stats */}
                {summary && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-slide-up">
                        <div className="card !p-4 flex items-center gap-4">
                            <div className="p-2.5 bg-primary/10 text-primary rounded-xl"><Users className="w-5 h-5" /></div>
                            <div>
                                <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Staff Count</p>
                                <p className="text-xl font-bold text-foreground">{summary.headcount}</p>
                            </div>
                        </div>
                        <div className="card !p-4 flex items-center gap-4">
                            <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl"><Wallet className="w-5 h-5" /></div>
                            <div>
                                <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Total Gross</p>
                                <p className="text-xl font-bold text-foreground">{formatCurrencyFromCents(summary.totalGross)}</p>
                            </div>
                        </div>
                        <div className="card !p-4 flex items-center gap-4">
                            <div className="p-2.5 bg-red-500/10 text-red-400 rounded-xl"><TrendingDown className="w-5 h-5" /></div>
                            <div>
                                <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Total Deductions</p>
                                <p className="text-xl font-bold text-red-400">{formatCurrencyFromCents(summary.totalDeductions)}</p>
                            </div>
                        </div>
                        <div className="card !p-4 flex items-center gap-4">
                            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl"><CreditCard className="w-5 h-5" /></div>
                            <div>
                                <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Net Payable</p>
                                <p className="text-xl font-bold text-emerald-400">{formatCurrencyFromCents(summary.totalNet)}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Staff compensation table */}
                <div className="card animate-slide-up no-scrollbar">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-lg font-bold text-foreground">Staff Compensation Summary</h3>
                        <div className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Showing {payrollData.length} records</div>
                    </div>

                    <div className="overflow-x-auto -mx-2">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[11px] font-bold uppercase tracking-wider text-foreground/40 border-b border-border/20">
                                    <th className="px-4 py-4">Staff Member</th>
                                    <th className="px-4 py-4 text-right">Basic</th>
                                    <th className="px-4 py-4 text-right">Allowances</th>
                                    <th className="px-4 py-4 text-right">Gross</th>
                                    <th className="px-4 py-4 text-right">PAYE</th>
                                    <th className="px-4 py-4 text-right">NSSF</th>
                                    <th className="px-4 py-4 text-right">SHIF</th>
                                    <th className="px-4 py-4 text-right">Housing</th>
                                    <th className="px-4 py-4 text-right">Net Pay</th>
                                    <th className="px-4 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {payrollData.map((p) => (
                                    <tr key={p.staff_id} className="group hover:bg-secondary/40 transition-colors">
                                        <td className="px-4 py-5">
                                            <p className="font-bold text-foreground group-hover:text-primary transition-colors">{p.staff_name}</p>
                                            <p className="text-[10px] text-foreground/40 italic">{p.staff_number || `ID: ${p.staff_id}`}</p>
                                        </td>
                                        <td className="px-4 py-5 text-right text-xs font-medium text-foreground/60">{formatCurrencyFromCents(p.basic_salary)}</td>
                                        <td className="px-4 py-5 text-right text-xs font-medium text-emerald-500">+{formatCurrencyFromCents(p.allowances)}</td>
                                        <td className="px-4 py-5 text-right text-xs font-bold text-foreground">{formatCurrencyFromCents(p.gross_salary)}</td>
                                        <td className="px-4 py-5 text-right text-xs font-medium text-red-400">{formatCurrencyFromCents(p.paye)}</td>
                                        <td className="px-4 py-5 text-right text-xs font-medium text-red-400">{formatCurrencyFromCents(p.nssf)}</td>
                                        <td className="px-4 py-5 text-right text-xs font-medium text-red-400">{formatCurrencyFromCents(p.shif)}</td>
                                        <td className="px-4 py-5 text-right text-xs font-medium text-red-400">{formatCurrencyFromCents(p.housing_levy)}</td>
                                        <td className="px-4 py-5 text-right">
                                            <span className="text-sm font-bold text-foreground bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
                                                {formatCurrencyFromCents(p.net_salary)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-5">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleNotifyStaff(p)}
                                                    className="p-2 bg-secondary hover:bg-primary/20 text-primary rounded-lg transition-all"
                                                    title="Notify via SMS"
                                                    aria-label={`Notify ${p.staff_name} via SMS`}
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handlePrintPayslip(p)}
                                                    className="p-2 bg-secondary hover:bg-secondary text-foreground/40 hover:text-foreground rounded-lg transition-all"
                                                    title="Print Payslip"
                                                    aria-label={`Print payslip for ${p.staff_name}`}
                                                >
                                                    <Printer className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Status Workflow Guide */}
                <div className="card !p-4">
                    <div className="flex items-center gap-6 justify-center text-[10px] font-bold uppercase tracking-widest text-foreground/30">
                        <span className={status === 'DRAFT' ? 'text-amber-400' : 'text-foreground/20'}>① Draft</span>
                        <span className="text-foreground/10">→</span>
                        <span className={status === 'CONFIRMED' ? 'text-blue-400' : 'text-foreground/20'}>② Confirmed</span>
                        <span className="text-foreground/10">→</span>
                        <span className={status === 'PAID' ? 'text-emerald-400' : 'text-foreground/20'}>③ Paid</span>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-10">
            <div className="flex items-center justify-between">
                <div>
                    <HubBreadcrumb crumbs={[{ label: 'Staff & Payroll' }, { label: 'Run Payroll' }]} />
                    <h1 className="text-xl md:text-3xl font-bold text-foreground font-heading">Payroll Management</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Process monthly disbursements and statutory obligations</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Payroll Engine Controller */}
                <div className="card h-fit">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Calculator className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold text-foreground">Payroll Engine</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="label" htmlFor="payroll-month">Month</label>
                                <select
                                    id="payroll-month"
                                    value={month}
                                    onChange={(e) => setMonth(Number(e.target.value))}
                                    aria-label="Select Month"
                                    className="input border-border/20 py-3"
                                >
                                    {months.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="label" htmlFor="payroll-year">Year</label>
                                <input
                                    id="payroll-year"
                                    type="number"
                                    value={year}
                                    onChange={(e) => setYear(Number(e.target.value))}
                                    aria-label="Select Year"
                                    className="input border-border/20 py-3"
                                    min={2020}
                                    max={2030}
                                />
                            </div>
                        </div>

                        <button
                            onClick={runPayroll}
                            disabled={running}
                            className="w-full btn btn-primary py-5 rounded-2xl flex items-center justify-center gap-3 text-lg font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1 active:scale-95 disabled:hover:translate-y-0"
                        >
                            {running ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6" />}
                            <span>{running ? 'Processing...' : 'Initialize Run'}</span>
                        </button>

                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 animate-pulse">
                                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                <p className="text-xs font-bold leading-tight">{error}</p>
                            </div>
                        )}

                        <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl">
                            <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest mb-1">Current Agent</p>
                            <p className="text-sm font-bold text-foreground">{user?.full_name || 'System Operator'}</p>
                        </div>
                    </div>
                </div>

                {/* Payroll Repository (Span 2) */}
                <div className="lg:col-span-2 card h-fit">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-slate-500/10 text-slate-400">
                                <Eye className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold text-foreground">Payroll Repository</h2>
                        </div>
                        {loadingHistory && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                    </div>

                    {history.length === 0 && !loadingHistory ? (
                        <div className="py-20 text-center">
                            <Calculator className="w-16 h-16 mx-auto mb-4 text-foreground/10" />
                            <p className="text-foreground/30 font-bold">Repository Empty</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto no-scrollbar pr-1">
                            {history.map((h: PayrollPeriod) => (
                                <div key={h.id} className="p-4 bg-secondary/20 hover:bg-secondary/40 border border-border/20 rounded-2xl flex justify-between items-center transition-all group">
                                    <div className="flex items-center gap-5">
                                        <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-inner">
                                            <Calendar className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-foreground text-lg">{h.period_name}</p>
                                            <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-tighter">Created: {new Date(h.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <span className={`text-[9px] font-bold tracking-widest uppercase px-3 py-1 rounded-full border ${getHistoryStatusColor(h.status)}`}>
                                            {normalizePayrollStatus(h.status)}
                                        </span>
                                        <button
                                            onClick={() => loadPeriodDetails(h.id)}
                                            aria-label="View payroll details"
                                            className="p-3 bg-secondary/50 hover:bg-primary text-foreground/40 hover:text-white rounded-xl transition-all shadow-sm"
                                        >
                                            <Eye className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )


    async function handleNotifyStaff(staff: PayrollEntry) {
        if (!staff.phone) {
            alert('Staff phone number missing')
            return
        }
        if (!user) {
            alert('User not authenticated')
            return
        }

        try {
            const api = globalThis.electronAPI
            const message = `Salary Notification: Your salary for ${selectedPeriod?.period_name} has been processed. Net Pay: ${formatCurrencyFromCents(staff.net_salary)}. Thank you.`
            const result = await api.sendSMS({
                to: staff.phone,
                message,
                recipientId: staff.staff_id,
                recipientType: 'STAFF',
                userId: user.id
            })

            if (result.success) {
                alert(`Notification sent to ${staff.staff_name}`)
            } else {
                alert('Failed to send: ' + result.error)
            }
        } catch {
            alert('Error sending notification')
        }
    }

    async function handleBulkNotify() {
        if (!confirm(`Send salary notifications to ${payrollData.length} staff members?`)) {return}
        if (!user) {
            alert('User not authenticated')
            return
        }

        setNotifying(true)
        let sent = 0
        let failed = 0
        const api = globalThis.electronAPI

        for (const staff of payrollData) {
            if (!staff.phone) {
                failed++
                continue
            }

            try {
                const message = `Salary Notification: Your salary for ${selectedPeriod?.period_name} has been processed. Net Pay: ${formatCurrencyFromCents(staff.net_salary)}. Thank you.`
                const result = await api.sendSMS({
                    to: staff.phone,
                    message,
                    recipientId: staff.staff_id,
                    recipientType: 'STAFF',
                    userId: user.id
                })
                if (result.success) {sent++}
                else {failed++}
            } catch {
                failed++
            }
        }

        setNotifying(false)
        alert(`Finished: ${sent} sent, ${failed} failed.`)
    }

    async function handlePrintPayslip(staffEntry: PayrollEntry) {
        printDocument({
            title: `Payslip - ${staffEntry.staff_name} - ${selectedPeriod?.period_name}`,
            template: 'payslip',
            data: {
                ...staffEntry,
                periodName: selectedPeriod?.period_name,
                basicSalary: staffEntry.basic_salary,
                grossSalary: staffEntry.gross_salary,
                netSalary: staffEntry.net_salary,
                totalDeductions: staffEntry.total_deductions,
                allowancesList: [],
                deductionsList: [
                    { name: 'PAYE', amount: staffEntry.paye },
                    { name: 'NSSF', amount: staffEntry.nssf },
                    { name: 'SHIF', amount: staffEntry.shif },
                    { name: 'Housing Levy', amount: staffEntry.housing_levy },
                ]
            },
            schoolSettings: (schoolSettings as unknown as Record<string, unknown>) || {}
        })
    }
}
