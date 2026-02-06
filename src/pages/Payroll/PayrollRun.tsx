import { useState, useEffect } from 'react'
import { formatCurrency } from '../../utils/format'
import { Calculator, Play, Download, AlertCircle, ChevronLeft, Eye, Printer, MessageSquare, Loader2, Calendar } from 'lucide-react'
import { useAuthStore, useAppStore } from '../../stores'
import { PayrollPeriod, PayrollEntry } from '../../types/electron-api/PayrollAPI'
import { ElectronAPI } from '../../types/electron-api'
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

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    useEffect(() => {
        loadHistory()
    }, [])

    const loadHistory = async () => {
        setLoadingHistory(true)
        try {
            const api = window.electronAPI
            const data = await api.getPayrollHistory()
            setHistory(data)
        } catch (err) {
            console.error('Failed to load history', err)
        } finally {
            setLoadingHistory(false)
        }
    }

    const loadPeriodDetails = async (periodId: number) => {
        setRunning(true)
        setError('')
        try {
            const api = window.electronAPI
            const response = await api.getPayrollDetails(periodId)
            if (response.success) {
                setPayrollData(response.results || [])
                setSelectedPeriod(response.period || {
                    period_name: `Payroll Period ${periodId}`,
                    status: 'PROCESSED'
                })
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
            const api = window.electronAPI
            const result = await api.runPayroll(month, year, user.id)
            if (result.success) {
                setPayrollData(result.results || [])
                setSelectedPeriod({ period_name: `${months[month - 1]} ${year}`, status: 'DRAFT' }) // Temporary period obj
                loadHistory() // Refresh history
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

    const handleBack = () => {
        setSelectedPeriod(null)
        setPayrollData([])
        setError('')
        loadHistory()
    }

    if (selectedPeriod || payrollData.length > 0) {
        return (
            <div className="space-y-8 pb-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <button
                            onClick={handleBack}
                            aria-label="Go back"
                            className="p-3 bg-secondary hover:bg-primary/20 text-primary rounded-2xl transition-all hover:-translate-x-1"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground font-heading">
                                {selectedPeriod?.period_name || 'Calculation Result'}
                            </h1>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">Payroll Status:</span>
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-0.5 rounded-full border ${selectedPeriod?.status === 'PAID'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                    }`}>
                                    {selectedPeriod?.status || 'Draft'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button className="btn btn-secondary flex items-center gap-2 py-2.5 px-6 text-sm">
                            <Download className="w-4 h-4" />
                            Export Data
                        </button>
                        <button
                            onClick={handleBulkNotify}
                            disabled={notifying || payrollData.length === 0}
                            className="btn btn-primary flex items-center gap-2 py-2.5 px-6 text-sm shadow-lg shadow-primary/20"
                        >
                            {notifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                            Notify All Staff
                        </button>
                    </div>
                </div>

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
                                    <th className="px-4 py-4 text-right">Deductions</th>
                                    <th className="px-4 py-4 text-right">Net Compensation</th>
                                    <th className="px-4 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {payrollData.map((p, i) => (
                                    <tr key={i} className="group hover:bg-secondary/40 transition-colors">
                                        <td className="px-4 py-5">
                                            <p className="font-bold text-foreground group-hover:text-primary transition-colors">{p.staff_name}</p>
                                            <p className="text-[10px] text-foreground/40 italic">ID: {p.staff_id}</p>
                                        </td>
                                        <td className="px-4 py-5 text-right text-xs font-medium text-foreground/60">{formatCurrency(p.basic_salary)}</td>
                                        <td className="px-4 py-5 text-right text-xs font-medium text-emerald-500">+{formatCurrency(p.allowances)}</td>
                                        <td className="px-4 py-5 text-right text-xs font-bold text-foreground">{formatCurrency(p.gross_salary)}</td>
                                        <td className="px-4 py-5 text-right text-xs font-medium text-red-500">
                                            -{formatCurrency((p.paye || 0) + (p.nhif || 0) + (p.nssf || 0))}
                                        </td>
                                        <td className="px-4 py-5 text-right">
                                            <span className="text-sm font-bold text-foreground bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
                                                {formatCurrency(p.net_salary)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-5">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleNotifyStaff(p)}
                                                    className="p-2 bg-secondary hover:bg-primary/20 text-primary rounded-lg transition-all"
                                                    title="Notify via SMS"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handlePrintPayslip(p)}
                                                    className="p-2 bg-secondary hover:bg-white/10 text-foreground/40 hover:text-white rounded-lg transition-all"
                                                    title="Print Payslip"
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
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading">Payroll Management</h1>
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
                                <label className="label">Month</label>
                                <select
                                    value={month}
                                    onChange={(e) => setMonth(Number(e.target.value))}
                                    aria-label="Select Month"
                                    className="input bg-secondary/30 border-border/20 py-3"
                                >
                                    {months.map((m, i) => (<option key={i} value={i + 1}>{m}</option>))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="label">Year</label>
                                <input
                                    type="number"
                                    value={year}
                                    onChange={(e) => setYear(Number(e.target.value))}
                                    aria-label="Select Year"
                                    className="input bg-secondary/30 border-border/20 py-3"
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
                            <p className="text-sm font-bold text-white">{user?.full_name || 'System Operator'}</p>
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
                                        <span className={`text-[9px] font-bold tracking-widest uppercase px-3 py-1 rounded-full border ${h.status === 'PAID'
                                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                            }`}>
                                            {h.status}
                                        </span>
                                        <button
                                            onClick={() => loadPeriodDetails(h.id)}
                                            aria-label="View payroll details"
                                            className="p-3 bg-white/5 hover:bg-primary text-foreground/40 hover:text-white rounded-xl transition-all shadow-sm"
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
            const api = window.electronAPI
            const message = `Salary Notification: Your salary for ${selectedPeriod?.period_name} has been processed. Net Pay: KES ${staff.net_salary}. Thank you.`
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
        } catch (error) {
            alert('Error sending notification')
        }
    }

    async function handleBulkNotify() {
        if (!confirm(`Send salary notifications to ${payrollData.length} staff members?`)) return
        if (!user) {
            alert('User not authenticated')
            return
        }

        setNotifying(true)
        let sent = 0
        let failed = 0
        const api = window.electronAPI

        for (const staff of payrollData) {
            if (!staff.phone) {
                failed++
                continue
            }

            try {
                const message = `Salary Notification: Your salary for ${selectedPeriod?.period_name} has been processed. Net Pay: KES ${staff.net_salary}. Thank you.`
                const result = await api.sendSMS({
                    to: staff.phone,
                    message,
                    recipientId: staff.staff_id,
                    recipientType: 'STAFF',
                    userId: user.id
                })
                if (result.success) sent++
                else failed++
            } catch (error) {
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
                // Allowances/Deductions list would ideally be fetched or passed here
                allowancesList: [],
                deductionsList: []
            },
            schoolSettings: (schoolSettings as unknown as Record<string, unknown>) || {}
        })
    }
}
