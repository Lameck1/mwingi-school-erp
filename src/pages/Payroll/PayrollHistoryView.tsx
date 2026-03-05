import { Calculator, Play, AlertCircle, Eye, Loader2, Calendar } from 'lucide-react'

import { getHistoryStatusColor } from './payrollHelpers'
import { normalizePayrollStatus } from './payrollStatus'
import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { type PayrollPeriod } from '../../types/electron-api/PayrollAPI'

interface PayrollHistoryViewProps {
    month: number
    year: number
    running: boolean
    error: string
    loadingHistory: boolean
    history: PayrollPeriod[]
    months: string[]
    userName: string | undefined
    confirmDialogCopy: { title: string; message: string; confirmLabel: string } | null
    isDialogProcessing: boolean

    setMonth: (m: number) => void
    setYear: (y: number) => void
    runPayroll: () => Promise<void>
    loadPeriodDetails: (periodId: number) => Promise<void>
    executeConfirmedAction: () => Promise<void>
    setConfirmAction: (action: null) => void
}

export function PayrollHistoryView(props: Readonly<PayrollHistoryViewProps>) {
    const {
        month, year, running, error, loadingHistory, history, months, userName,
        confirmDialogCopy, isDialogProcessing,
        setMonth, setYear, runPayroll, loadPeriodDetails,
        executeConfirmedAction, setConfirmAction,
    } = props

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
                            <p className="text-sm font-bold text-foreground">{userName || 'System Operator'}</p>
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

            <ConfirmDialog
                isOpen={confirmDialogCopy !== null}
                title={confirmDialogCopy?.title || 'Confirm Payroll Action'}
                message={confirmDialogCopy?.message || 'Proceed with this payroll action?'}
                confirmLabel={confirmDialogCopy?.confirmLabel || 'Proceed'}
                onCancel={() => setConfirmAction(null)}
                onConfirm={() => { void executeConfirmedAction() }}
                isProcessing={isDialogProcessing}
            />
        </div>
    )
}
