import {
    Download, FileText, Users, TrendingUp, TrendingDown,
    Calendar, AlertCircle, MessageSquare, Loader2, Search, Printer
} from 'lucide-react'
import { useState, useEffect, type ElementType } from 'react'
import { useLocation } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts'

import { InstitutionalHeader } from '../../components/patterns/InstitutionalHeader'
import { StatCard } from '../../components/patterns/StatCard'
import { useAuthStore } from '../../stores'
import { exportToPDF, downloadCSV } from '../../utils/exporters'
import { formatCurrencyFromCents } from '../../utils/format'
import { printCurrentView } from '../../utils/print'

const COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed']
const COLOR_CLASSES = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-red-600', 'bg-violet-600']

interface StudentStats {
    totalStudents: number
    dayScholars: number
    boarders: number
}

interface FinancialSummary {
    totalIncome: number
    totalExpense: number
    netBalance: number
}

interface Defaulter {
    id: number | string
    admission_number: string
    first_name: string
    last_name: string
    stream_name?: string
    total_amount: number
    amount_paid: number
    balance: number
    guardian_phone?: string
}

interface DailyCollectionItem {
    admission_number: string
    student_name: string;
    stream_name?: string;
    amount: number;
    payment_method: string;
    payment_reference?: string
    date?: string
}

export default function Reports() {
    const { user } = useAuthStore()
    const location = useLocation()
    const [loading, setLoading] = useState(false)
    const [dateRange, setDateRange] = useState({
        start: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10)
    })

    const [studentStats, setStudentStats] = useState<StudentStats | null>(null)
    const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null)
    const [feeCollectionData, setFeeCollectionData] = useState<{ month: string; amount: number }[]>([])
    const [paymentMethodData, setPaymentMethodData] = useState<{ name: string; value: number }[]>([])
    const [defaulters, setDefaulters] = useState<Defaulter[]>([])
    const [dailyCollections, setDailyCollections] = useState<DailyCollectionItem[]>([])
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
    const [sendingBulk, setSendingBulk] = useState(false)
    const [activeTab, setActiveTab] = useState<'fee-collection' | 'defaulters' | 'daily-collection' | 'students' | 'financial'>('fee-collection')

    const loadReportData = async () => {
        setLoading(true)
        try {
            // Load student statistics
            const students = await globalThis.electronAPI.getStudents({})
            const currentStudents = Array.isArray(students) ? students : []
            const dayScholars = currentStudents.filter((s) => s.student_type === 'DAY_SCHOLAR').length
            const boarders = currentStudents.filter((s) => s.student_type === 'BOARDER').length
            setStudentStats({
                totalStudents: currentStudents.length,
                dayScholars,
                boarders
            })

            // Load financial summary
            const summary = await globalThis.electronAPI.getTransactionSummary(dateRange.start, dateRange.end)
            setFinancialSummary(summary || { totalIncome: 0, totalExpense: 0, netBalance: 0 })

            // Load fee collection data
            const feeData = await globalThis.electronAPI.getFeeCollectionReport(dateRange.start, dateRange.end)
            const currentFeeData = Array.isArray(feeData) ? feeData : []

            // Group by month
            const monthlyData: Record<string, number> = {}
            currentFeeData.forEach((item) => {
                if (!item.payment_date) {return}
                const d = new Date(item.payment_date)
                if (Number.isNaN(d.getTime())) {return}
                const month = d.toLocaleDateString('en-US', { month: 'short' })
                monthlyData[month] = (monthlyData[month] || 0) + item.amount
            })

            setFeeCollectionData(
                Object.entries(monthlyData).length > 0
                    ? Object.entries(monthlyData).map(([month, amount]) => ({ month, amount }))
                    : []
            )

            // Group by payment method
            const methodData: Record<string, number> = {}
            currentFeeData.forEach((item) => {
                const method = item.payment_method || 'Other'
                methodData[method] = (methodData[method] || 0) + item.amount
            })
            const total = Object.values(methodData).reduce((sum, v) => sum + v, 0) || 0
            setPaymentMethodData(
                total > 0
                    ? Object.entries(methodData).map(([name, value]) => ({
                        name,
                        value: Math.round((value / total) * 100)
                    }))
                    : []
            )

            // Load defaulters
            const defaulterData = await globalThis.electronAPI.getDefaulters()
            setDefaulters(Array.isArray(defaulterData) ? (defaulterData) : [])

            // Load daily collections
            const dailyData = await globalThis.electronAPI.getDailyCollection(selectedDate)
            setDailyCollections(Array.isArray(dailyData) ? (dailyData as DailyCollectionItem[]) : [])
        } catch (error) {
            console.error('Failed to load report data:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadReportData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange, selectedDate])

    useEffect(() => {
        const params = new URLSearchParams(location.search)
        const tab = params.get('tab')
        if (tab === 'fee-collection' || tab === 'defaulters' || tab === 'daily-collection' || tab === 'students' || tab === 'financial') {
            setActiveTab(tab)
        }
    }, [location.search])

    const handleSendReminder = async (student: Defaulter) => {
        if (!student.guardian_phone) {
            alert('Guardian phone number missing')
            return
        }
        if (!user?.id) {
            alert('You must be signed in to send reminders')
            return
        }

        try {
            const message = `Fee Reminder: ${student.first_name} has an outstanding balance of ${formatCurrencyFromCents(student.balance)}. Please settle at your earliest convenience. Thank you.`
            const result = await globalThis.electronAPI.sendSMS({
                to: student.guardian_phone,
                message,
                recipientId: Number(student.id),
                recipientType: 'STUDENT',
                userId: user.id
            })

            if (result.success) {
                alert(`Reminder sent to ${student.first_name}'s guardian`)
            } else {
                alert('Failed to send: ' + result.error)
            }
        } catch {
            alert('Error sending reminder')
        }
    }

    const handleBulkReminders = async () => {
        if (!confirm(`Send reminders to ${defaulters.length} guardians?`)) {return}
        if (!user?.id) {
            alert('You must be signed in to send reminders')
            return
        }

        setSendingBulk(true)
        let sentCount = 0
        let failedCount = 0

        for (const student of defaulters) {
            if (!student.guardian_phone) {
                failedCount++
                continue
            }

            try {
                const message = `Fee Reminder: ${student.first_name} has an outstanding balance of ${formatCurrencyFromCents(student.balance)}. Please settle at your earliest convenience. Thank you.`
                const result = await globalThis.electronAPI.sendSMS({
                    to: student.guardian_phone,
                    message,
                    recipientId: Number(student.id),
                    recipientType: 'STUDENT',
                    userId: user.id
                })
                if (result.success) {sentCount++}
                else {failedCount++}
            } catch {
                failedCount++
            }
        }

        setSendingBulk(false)
        alert(`Finished: ${sentCount} sent, ${failedCount} failed.`)
    }

    const handleExportPDF = async () => {
        if (activeTab === 'defaulters' && defaulters.length > 0) {
            await exportToPDF({
                filename: `fee-defaulters-${new Date().toISOString().slice(0, 10)}`,
                title: 'Fee Defaulters Report',
                subtitle: `Period: ${dateRange.start} to ${dateRange.end}`,
                schoolInfo: {
                    name: 'Mwingi Adventist School',
                    address: 'P.O. Box 123, Mwingi, Kenya',
                    phone: '+254 700 000 000'
                },
                columns: [
                    { key: 'admission_number', header: 'Adm No', width: 25 },
                    { key: 'student_name', header: 'Student Name', width: 45 },
                    { key: 'stream_name', header: 'Grade', width: 25 },
                    { key: 'total_amount', header: 'Total Fees', width: 30, align: 'right', format: 'currency' },
                    { key: 'amount_paid', header: 'Paid', width: 30, align: 'right', format: 'currency' },
                    { key: 'balance', header: 'Balance', width: 30, align: 'right', format: 'currency' },
                ],
                data: defaulters.map(d => ({
                    ...d,
                    student_name: `${d.first_name} ${d.last_name}`
                }))
            })
        } else if (activeTab === 'financial' && financialSummary) {
            await exportToPDF({
                filename: `financial-summary-${new Date().toISOString().slice(0, 10)}`,
                title: 'Financial Summary Report',
                subtitle: `Period: ${dateRange.start} to ${dateRange.end}`,
                schoolInfo: {
                    name: 'Mwingi Adventist School',
                    address: 'P.O. Box 123, Mwingi, Kenya',
                    phone: '+254 700 000 000'
                },
                columns: [
                    { key: 'category', header: 'Category', width: 80 },
                    { key: 'amount', header: 'Amount', width: 60, align: 'right', format: 'currency' },
                ],
                data: [
                    { category: 'Total Income', amount: financialSummary.totalIncome },
                    { category: 'Total Expenses', amount: financialSummary.totalExpense },
                    { category: 'Net Balance', amount: financialSummary.netBalance },
                ]
            })
        } else if (activeTab === 'daily-collection' && dailyCollections.length > 0) {
            await exportToPDF({
                filename: `daily-collection-${selectedDate}`,
                title: 'Daily Collection Report',
                subtitle: `Date: ${selectedDate}`,
                schoolInfo: {
                    name: 'Mwingi Adventist School',
                    address: 'P.O. Box 123, Mwingi, Kenya',
                    phone: '+254 700 000 000'
                },
                columns: [
                    { key: 'admission_number', header: 'Adm No', width: 25 },
                    { key: 'student_name', header: 'Student Name', width: 45 },
                    { key: 'stream_name', header: 'Grade', width: 25 },
                    { key: 'amount', header: 'Amount', width: 30, align: 'right', format: 'currency' },
                    { key: 'payment_method', header: 'Method', width: 30 },
                ],
                data: dailyCollections.map(d => ({
                    ...d,
                    student_name: d.student_name || 'N/A'
                }))
            })
        } else {
            alert('Please select a report with data to export')
        }
    }

    const handleExportCSV = () => {
        if (activeTab === 'defaulters' && defaulters.length > 0) {
            downloadCSV({
                filename: `fee-defaulters-${new Date().toISOString().slice(0, 10)}`,
                title: 'Fee Defaulters Report',
                columns: [
                    { key: 'admission_number', header: 'Admission Number' },
                    { key: 'student_name', header: 'Student Name' },
                    { key: 'stream_name', header: 'Grade' },
                    { key: 'total_amount', header: 'Total Fees', format: 'currency' },
                    { key: 'amount_paid', header: 'Paid', format: 'currency' },
                    { key: 'balance', header: 'Balance', format: 'currency' },
                ],
                data: defaulters.map(d => ({
                    ...d,
                    student_name: `${d.first_name} ${d.last_name}`
                }))
            })
        } else if (activeTab === 'financial' && financialSummary) {
            downloadCSV({
                filename: `financial-summary-${new Date().toISOString().slice(0, 10)}`,
                title: 'Financial Summary Report',
                columns: [
                    { key: 'category', header: 'Category' },
                    { key: 'amount', header: 'Amount', format: 'currency' },
                ],
                data: [
                    { category: 'Total Income', amount: financialSummary.totalIncome },
                    { category: 'Total Expenses', amount: financialSummary.totalExpense },
                    { category: 'Net Balance', amount: financialSummary.netBalance },
                ]
            })
        } else if (activeTab === 'daily-collection' && dailyCollections.length > 0) {
            downloadCSV({
                filename: `daily-collection-${selectedDate}`,
                title: 'Daily Collection Report',
                columns: [
                    { key: 'date', header: 'Date' },
                    { key: 'student_name', header: 'Student Name' },
                    { key: 'payment_method', header: 'Method' },
                    { key: 'payment_reference', header: 'Reference' },
                    { key: 'amount', header: 'Amount', format: 'currency' },
                ],
                data: dailyCollections as unknown as Record<string, unknown>[]
            })
        } else {
            alert('Please select a report with data to export')
        }
    }

    const tabs: { id: typeof activeTab; label: string; icon: ElementType }[] = [
        { id: 'fee-collection', label: 'Fee Collection', icon: TrendingUp },
        { id: 'daily-collection', label: 'Daily Collection', icon: Calendar },
        { id: 'defaulters', label: 'Fee Defaulters', icon: AlertCircle },
        { id: 'students', label: 'Student Stats', icon: Users },
        { id: 'financial', label: 'Financial Summary', icon: FileText },
    ]

    return (
        <div className="space-y-8 pb-10">
            <InstitutionalHeader />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-1">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading uppercase tracking-tight">Institutional Reports</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Comprehensive academic and fiscal diagnostics</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExportCSV}
                        className="btn btn-secondary flex items-center gap-2 px-6"
                    >
                        <Download className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">CSV</span>
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="btn btn-primary flex items-center gap-2 px-6 shadow-xl shadow-primary/20"
                    >
                        <Download className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">PDF</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-border/20 overflow-x-auto whitespace-nowrap pb-1">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`pb-4 px-2 text-sm font-bold uppercase tracking-widest transition-all relative ${activeTab === tab.id ? 'text-primary' : 'text-foreground/40 hover:text-foreground/60'}`}
                    >
                        <div className="flex items-center gap-2">
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </div>
                        {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full shadow-[0_-4px_10px_rgba(var(--primary-rgb),0.5)]" />}
                    </button>
                ))}
            </div>

            {/* Date Range & Global Filter */}
            <div className="premium-card bg-secondary/5 border-secondary/20">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label htmlFor="period-start" className="text-[10px] font-bold uppercase text-foreground/40 tracking-widest ml-1">Period From</label>
                            <input
                                id="period-start"
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="input w-full bg-secondary/30 h-12 text-xs font-bold uppercase tracking-tight"
                            />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="period-end" className="text-[10px] font-bold uppercase text-foreground/40 tracking-widest ml-1">Period To</label>
                            <input
                                id="period-end"
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="input w-full bg-secondary/30 h-12 text-xs font-bold uppercase tracking-tight"
                            />
                        </div>
                    </div>
                    <button
                        onClick={loadReportData}
                        disabled={loading}
                        className="btn btn-primary h-12 px-8 flex items-center gap-2 text-xs font-bold uppercase tracking-widest shadow-xl shadow-primary/10 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Refresh Intelligence
                    </button>
                </div>
            </div>

            {/* Report Content */}
            {activeTab === 'fee-collection' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="premium-card group overflow-hidden">
                        <div className="p-6 border-b border-border/40 flex items-center justify-between bg-secondary/5">
                            <div className="flex items-center gap-3">
                                <TrendingUp className="w-5 h-5 text-emerald-500 opacity-60" />
                                <h3 className="text-lg font-bold text-foreground font-heading tracking-tight uppercase">Monthly Liquidity</h3>
                            </div>
                        </div>
                        <div className="p-8">
                            {feeCollectionData.length > 0 ? (
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={feeCollectionData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                                                formatter={(v: number) => formatCurrencyFromCents(v)}
                                            />
                                            <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-64 text-foreground/20 border-2 border-dashed border-border/20 rounded-2xl">
                                    <TrendingUp className="w-12 h-12 mb-4 opacity-10" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest">No collection metrics available</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="premium-card group overflow-hidden">
                        <div className="p-6 border-b border-border/40 flex items-center justify-between bg-secondary/5">
                            <div className="flex items-center gap-3">
                                <TrendingDown className="w-5 h-5 text-primary opacity-60" />
                                <h3 className="text-lg font-bold text-foreground font-heading tracking-tight uppercase">Payment Channels</h3>
                            </div>
                        </div>
                        <div className="p-8">
                            {paymentMethodData.length > 0 ? (
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={paymentMethodData}
                                                innerRadius={60}
                                                outerRadius={100}
                                                dataKey="value"
                                                stroke="none"
                                                paddingAngle={5}
                                            >
                                                {paymentMethodData.map((_, i) => (<Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="mt-4 flex flex-wrap gap-4 justify-center">
                                        {paymentMethodData.map((item, index) => (
                                            <div key={item.name} className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${COLOR_CLASSES[index % COLOR_CLASSES.length]}`} />
                                                <span className="text-[10px] font-bold uppercase text-foreground/60">{item.name} ({item.value}%)</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-64 text-foreground/20 border-2 border-dashed border-border/20 rounded-2xl">
                                    <Download className="w-12 h-12 mb-4 opacity-10" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest">No channel metrics available</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'daily-collection' && (
                <div id="daily-collection-print-area" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="premium-card flex flex-col md:flex-row md:items-center justify-between gap-4 border-primary/20 bg-primary/5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
                                <Calendar className="w-6 h-6" />
                            </div>
                            <div>
                            <label htmlFor="audit-date" className="text-[10px] font-bold uppercase text-foreground/40 tracking-widest block">Audit Date</label>
                            <input
                                id="audit-date"
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent border-none p-0 text-xl font-bold text-foreground focus:ring-0 cursor-pointer"
                            />
                        </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => printCurrentView({
                                    title: `Daily Collection Report - ${selectedDate}`,
                                    selector: '#daily-collection-print-area'
                                })}
                                className="btn btn-secondary flex items-center gap-2 px-6"
                            >
                                <Printer className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Print DCR</span>
                            </button>
                        </div>
                    </div>

                    <div className="premium-card overflow-hidden p-0 border-border/20">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-secondary/5 border-b border-border/20">
                                        <th className="text-left py-5 px-6 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Audit Time</th>
                                        <th className="text-left py-5 px-6 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Student Information</th>
                                        <th className="text-left py-5 px-6 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Channel</th>
                                        <th className="text-left py-5 px-6 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Audit Ref</th>
                                        <th className="text-right py-5 px-6 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dailyCollections.length > 0 ? (
                                        dailyCollections.map((col) => {
                                            const rowKey = col.payment_reference || `${col.admission_number}-${col.amount}-${col.date ?? selectedDate}-${col.payment_method}`
                                            return (
                                            <tr key={rowKey} className="border-b border-border/10 hover:bg-secondary/5 transition-colors">
                                                <td className="py-5 px-6 text-xs font-mono text-foreground/60">08:00 AM+</td>
                                                <td className="py-5 px-6">
                                                    <div className="text-sm font-bold text-foreground uppercase tracking-tight">{col.student_name}</div>
                                                    <div className="text-[10px] font-medium text-foreground/40">Audit Verified</div>
                                                </td>
                                                <td className="py-5 px-6">
                                                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 uppercase tracking-tighter">
                                                        {col.payment_method}
                                                    </span>
                                                </td>
                                                <td className="py-5 px-6 text-xs font-mono text-foreground/40">{col.payment_reference || 'INTERNAL_REF'}</td>
                                                <td className="py-5 px-6 text-right text-sm font-bold text-primary">{formatCurrencyFromCents(col.amount)}</td>
                                            </tr>
                                            )
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="py-20 text-center">
                                                <div className="text-foreground/20 italic text-sm font-medium">No institutional collections recorded for the selected audit date.</div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {dailyCollections.length > 0 && (
                                    <tfoot>
                                        <tr className="bg-primary/5 border-t border-primary/20">
                                            <td colSpan={4} className="py-5 px-6 text-sm font-bold text-foreground text-right uppercase tracking-[0.2em]">Daily Audit Aggregate:</td>
                                            <td className="py-5 px-6 text-right text-xl font-bold text-primary">
                                                {formatCurrencyFromCents(dailyCollections.reduce((sum, c) => sum + c.amount, 0))}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'defaulters' && (
                <div className="premium-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                        <div>
                            <h3 className="text-xl font-bold text-foreground font-heading tracking-tight uppercase">Defaulter Diagnostics</h3>
                            <p className="text-xs text-foreground/40 font-medium italic mt-1 leading-relaxed">System-identified accounts with outstanding balances exceeding threshold</p>
                        </div>
                        <button
                            onClick={handleBulkReminders}
                            disabled={sendingBulk || defaulters.length === 0}
                            className="btn btn-primary flex items-center gap-2 px-8 h-12 shadow-2xl shadow-primary/20 disabled:opacity-50"
                        >
                            {sendingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                            <span className="text-xs font-bold uppercase tracking-widest">{sendingBulk ? 'Relaying...' : 'Bulk SMS Relay'}</span>
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/20">
                                    <th className="text-left py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Adm No</th>
                                    <th className="text-left py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Student Identity</th>
                                    <th className="text-left py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Level</th>
                                    <th className="text-right py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Billed</th>
                                    <th className="text-right py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Remitted</th>
                                    <th className="text-right py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Outstanding</th>
                                    <th className="text-center py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {defaulters.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-20 text-foreground/20 italic font-medium">No institutional defaulters detected.</td></tr>
                                ) : (
                                    defaulters.map((d) => (
                                        <tr key={d.id} className="border-b border-border/10 hover:bg-secondary/5 transition-colors group">
                                            <td className="py-4 px-2 font-mono text-xs text-foreground/60">{d.admission_number}</td>
                                            <td className="py-4 px-2 text-sm font-bold text-foreground uppercase tracking-tight">{d.first_name} {d.last_name}</td>
                                            <td className="py-4 px-2 text-[10px] font-bold text-foreground/40 uppercase">{d.stream_name || 'UNASSIGNED'}</td>
                                            <td className="py-4 px-2 text-right text-xs font-medium text-foreground/60">{formatCurrencyFromCents(d.total_amount)}</td>
                                            <td className="py-4 px-2 text-right text-xs font-medium text-emerald-500/80">{formatCurrencyFromCents(d.amount_paid)}</td>
                                            <td className="py-4 px-2 text-right text-sm font-bold text-rose-500">{formatCurrencyFromCents(d.balance)}</td>
                                            <td className="py-4 px-2 text-center">
                                                <button
                                                    onClick={() => handleSendReminder(d)}
                                                    className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-all shadow-sm"
                                                    title="Relay SMS Reminder"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'students' && (
                <div className="premium-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h3 className="text-xl font-bold text-foreground font-heading tracking-tight uppercase mb-8">Demographic Intelligence</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <StatCard
                            label="Institutional Population"
                            value={studentStats?.totalStudents || 0}
                            icon={Users}
                            color="from-blue-500/10 to-indigo-500/10 text-blue-500"
                        />
                        <StatCard
                            label="Day Scholars"
                            value={studentStats?.dayScholars || 0}
                            icon={TrendingUp}
                            color="from-emerald-500/10 to-teal-500/10 text-emerald-500"
                        />
                        <StatCard
                            label="Boarding Residents"
                            value={studentStats?.boarders || 0}
                            icon={TrendingDown}
                            color="from-purple-500/10 to-pink-500/10 text-purple-500"
                        />
                    </div>
                </div>
            )}

            {activeTab === 'financial' && (
                <div className="premium-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h3 className="text-xl font-bold text-foreground font-heading tracking-tight uppercase mb-8">Fiscal Summary Diagnostic</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="p-8 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl shadow-inner group transition-all hover:bg-emerald-500/10">
                            <p className="text-[10px] font-bold uppercase text-emerald-500/60 tracking-widest mb-2">Aggregate Income</p>
                            <p className="text-3xl font-bold text-emerald-500 tracking-tight">{formatCurrencyFromCents(financialSummary?.totalIncome || 0)}</p>
                        </div>
                        <div className="p-8 bg-rose-500/5 border border-rose-500/10 rounded-2xl shadow-inner group transition-all hover:bg-rose-500/10">
                            <p className="text-[10px] font-bold uppercase text-rose-500/60 tracking-widest mb-2">Aggregate Expenditure</p>
                            <p className="text-3xl font-bold text-rose-500 tracking-tight">{formatCurrencyFromCents(financialSummary?.totalExpense || 0)}</p>
                        </div>
                        <div className="p-8 bg-primary/5 border border-primary/10 rounded-2xl shadow-inner group transition-all hover:bg-primary/10">
                            <p className="text-[10px] font-bold uppercase text-primary/60 tracking-widest mb-2">Net Institutional Liquidity</p>
                            <p className="text-3xl font-bold text-primary tracking-tight">{formatCurrencyFromCents(financialSummary?.netBalance || 0)}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

