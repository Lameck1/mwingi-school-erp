import {
    AlertCircle, ChevronLeft, Printer, MessageSquare, Loader2,
    CheckCircle2, CreditCard, RotateCcw, Trash2, RefreshCw,
    Users, TrendingDown, Wallet, FileSpreadsheet, ShieldCheck,
    Lock, Download,
} from 'lucide-react'

import { type PayrollConfirmAction } from './payrollHelpers'
import { normalizePayrollStatus, type PayrollUiStatus } from './payrollStatus'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { type PayrollPeriod, type PayrollEntry } from '../../types/electron-api/PayrollAPI'
import { formatCurrencyFromCents } from '../../utils/format'

interface PayrollDetailViewProps {
    selectedPeriod: Partial<PayrollPeriod> | null
    payrollData: PayrollEntry[]
    error: string
    summary: { headcount: number; totalGross: number; totalDeductions: number; totalNet: number } | null

    // Action state
    actionLoading: PayrollConfirmAction | ''
    notifying: boolean
    isExportingP10: boolean
    confirmDialogCopy: { title: string; message: string; confirmLabel: string } | null
    isDialogProcessing: boolean

    // Handlers
    handleBack: () => void
    handleConfirm: () => void
    handleMarkPaid: () => void
    handleRevertToDraft: () => void
    handleDelete: () => void
    handleRecalculate: () => void
    handleExportCSV: () => void
    handleExportP10: () => Promise<void>
    requestActionConfirmation: (action: PayrollConfirmAction) => void
    handleNotifyStaff: (staff: PayrollEntry) => Promise<void>
    handlePrintPayslip: (staff: PayrollEntry) => Promise<void>
    executeConfirmedAction: () => Promise<void>
    setConfirmAction: (action: PayrollConfirmAction | null) => void
}

const STATUS_CONFIG: Record<PayrollUiStatus, { color: string; icon: typeof AlertCircle; label: string }> = {
    DRAFT: { color: 'bg-amber-500/10 border-amber-500/20 text-amber-400', icon: AlertCircle, label: 'Draft' },
    CONFIRMED: { color: 'bg-blue-500/10 border-blue-500/20 text-blue-400', icon: ShieldCheck, label: 'Confirmed' },
    PAID: { color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', icon: CheckCircle2, label: 'Paid' },
}

function StatusActions({
    status, periodId, actionLoading, notifying, isExportingP10, payrollDataLength,
    handleRecalculate, handleDelete, handleConfirm, handleRevertToDraft, handleMarkPaid,
    handleExportCSV, handleExportP10, requestActionConfirmation,
}: Readonly<{
    status: PayrollUiStatus
    periodId: number | undefined
    actionLoading: PayrollConfirmAction | ''
    notifying: boolean
    isExportingP10: boolean
    payrollDataLength: number
    handleRecalculate: () => void
    handleDelete: () => void
    handleConfirm: () => void
    handleRevertToDraft: () => void
    handleMarkPaid: () => void
    handleExportCSV: () => void
    handleExportP10: () => Promise<void>
    requestActionConfirmation: (action: PayrollConfirmAction) => void
}>) {
    return (
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
            <button onClick={handleExportCSV} disabled={payrollDataLength === 0}
                className="btn btn-secondary flex items-center gap-2 py-2 px-4 text-xs">
                <FileSpreadsheet className="w-4 h-4" />
                Export CSV
            </button>
            {(status === 'CONFIRMED' || status === 'PAID') && periodId && (
                <button
                    onClick={() => void handleExportP10()}
                    disabled={isExportingP10 || payrollDataLength === 0}
                    className="btn btn-secondary flex items-center gap-2 py-2 px-4 text-xs font-bold text-amber-500 border-amber-500/20 hover:bg-amber-500/10"
                    title="Export KRA iTax P10 Format"
                >
                    {isExportingP10 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Export P10 (iTax)
                </button>
            )}
            {(status === 'CONFIRMED' || status === 'PAID') && (
                <button
                    onClick={() => requestActionConfirmation('bulkNotify')}
                    disabled={notifying || payrollDataLength === 0}
                    className="btn btn-primary flex items-center gap-2 py-2 px-4 text-xs shadow-lg shadow-primary/20"
                >
                    {notifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    Notify All Staff
                </button>
            )}
        </div>
    )
}

export function PayrollDetailView(props: Readonly<PayrollDetailViewProps>) {
    const {
        selectedPeriod, payrollData, error, summary,
        actionLoading, notifying, isExportingP10, confirmDialogCopy, isDialogProcessing,
        handleBack, handleConfirm, handleMarkPaid, handleRevertToDraft,
        handleDelete, handleRecalculate, handleExportCSV, handleExportP10,
        requestActionConfirmation, handleNotifyStaff, handlePrintPayslip,
        executeConfirmedAction, setConfirmAction,
    } = props

    const status = normalizePayrollStatus(selectedPeriod?.status)
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT
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

                    <StatusActions
                        status={status} periodId={periodId}
                        actionLoading={actionLoading} notifying={notifying}
                        isExportingP10={isExportingP10} payrollDataLength={payrollData.length}
                        handleRecalculate={handleRecalculate} handleDelete={handleDelete}
                        handleConfirm={handleConfirm} handleRevertToDraft={handleRevertToDraft}
                        handleMarkPaid={handleMarkPaid} handleExportCSV={handleExportCSV}
                        handleExportP10={handleExportP10} requestActionConfirmation={requestActionConfirmation}
                    />
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
