import { TrendingUp, TrendingDown, DollarSign, Download, Filter, Calendar, Activity, BarChart3, PieChart as PieIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

import { InstitutionalHeader } from '../../components/patterns/InstitutionalHeader'
import { useToast } from '../../contexts/ToastContext'
import { formatCurrencyFromCents } from '../../utils/format'



interface TransactionSummary {
    totalIncome: number
    totalExpense: number
    netBalance: number
}

interface ChartData {
    name: string
    value: number
}

export default function FinancialReports() {
    const { showToast } = useToast()

    const [summary, setSummary] = useState<TransactionSummary>({ totalIncome: 0, totalExpense: 0, netBalance: 0 })
    const [revenueData, setRevenueData] = useState<ChartData[]>([])
    const [expenseData, setExpenseData] = useState<ChartData[]>([])
    const [loading, setLoading] = useState(false)
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10)
    })

    const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444']

    const loadData = async () => {
        setLoading(true)
        try {
            const [summaryData, revenue, expenses] = await Promise.all([
                window.electronAPI.getTransactionSummary(dateRange.startDate, dateRange.endDate),
                window.electronAPI.getRevenueByCategory(dateRange.startDate, dateRange.endDate),
                window.electronAPI.getExpenseByCategory(dateRange.startDate, dateRange.endDate)
            ])
            setSummary(summaryData)
            setRevenueData(revenue as ChartData[])
            setExpenseData(expenses as ChartData[])
        } catch (error) {
            console.error('Failed to load report data:', error)
            showToast('Failed to correlate financial data', 'error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange, showToast])

    const { totalIncome, totalExpense, netBalance } = summary

    return (
        <div className="space-y-8 pb-10">
            <InstitutionalHeader />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading uppercase tracking-tight">Financial Intelligence</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">High-fidelity analysis of institutional liquidity and fiscal health</p>
                </div>
                <button className="btn btn-secondary flex items-center gap-2 py-3 px-8 text-sm font-bold border border-border/40 hover:bg-secondary/40 transition-all shadow-lg hover:-translate-y-1">
                    <Download className="w-5 h-5 opacity-60" />
                    <span>Export Strategic Report</span>
                </button>
            </div>

            {/* Chronological Filters */}
            <div className="premium-card animate-slide-up">
                <div className="flex flex-wrap items-end gap-6">
                    <div className="flex-1 min-w-[200px] space-y-2">
                        <label htmlFor="field-81" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1 flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            Session Start
                        </label>
                        <input id="field-81"
                            type="date"
                            value={dateRange.startDate}
                            onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                            className="input w-full bg-secondary/30 h-12 text-xs font-bold uppercase tracking-tight"
                            aria-label="Start Date"
                        />
                    </div>
                    <div className="flex-1 min-w-[200px] space-y-2">
                        <label htmlFor="field-94" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1 flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            Session Termination
                        </label>
                        <input id="field-94"
                            type="date"
                            value={dateRange.endDate}
                            onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                            className="input w-full bg-secondary/30 h-12 text-xs font-bold uppercase tracking-tight"
                            aria-label="End Date"
                        />
                    </div>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="btn btn-primary flex items-center gap-2 px-8 h-12 text-sm font-bold shadow-xl shadow-primary/20 disabled:opacity-50"
                    >
                        {loading ? <Activity className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
                        Update Intelligence
                    </button>
                </div>
            </div>

            {/* Strategic Summary Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="premium-card bg-emerald-500/5 border-emerald-500/10 group hover:border-emerald-500/30 transition-all border-l-4 border-l-emerald-500">
                    <div className="flex items-center justify-between mb-6">
                        <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 shadow-inner group-hover:scale-110 transition-transform">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em] bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">Revenue Stream</span>
                    </div>
                    <h3 className="text-3xl font-bold text-foreground font-heading tracking-tight">{formatCurrencyFromCents(totalIncome)}</h3>
                    <p className="text-foreground/40 text-[10px] font-bold uppercase tracking-widest mt-2">Aggregate Capital Influx</p>
                </div>

                <div className="premium-card bg-destructive/5 border-destructive/10 group hover:border-destructive/30 transition-all border-l-4 border-l-destructive">
                    <div className="flex items-center justify-between mb-6">
                        <div className="w-12 h-12 bg-destructive/10 rounded-2xl flex items-center justify-center text-destructive shadow-inner group-hover:scale-110 transition-transform">
                            <TrendingDown className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-bold text-destructive uppercase tracking-[0.2em] bg-destructive/10 px-3 py-1 rounded-full border border-destructive/20">Operational Cost</span>
                    </div>
                    <h3 className="text-3xl font-bold text-foreground font-heading tracking-tight">{formatCurrencyFromCents(totalExpense)}</h3>
                    <p className="text-foreground/40 text-[10px] font-bold uppercase tracking-widest mt-2">Aggregate Environment Drain</p>
                </div>

                <div className={`premium-card group transition-all border-l-4 ${netBalance >= 0 ? 'bg-primary/5 border-primary/10 border-l-primary hover:border-primary/30' : 'bg-orange-500/5 border-orange-500/10 border-l-orange-500 hover:border-orange-500/30'}`}>
                    <div className="flex items-center justify-between mb-6">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform ${netBalance >= 0 ? 'bg-primary/10 text-primary' : 'bg-orange-500/10 text-orange-500'}`}>
                            <DollarSign className="w-6 h-6" />
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full border ${netBalance >= 0 ? 'text-primary bg-primary/10 border-primary/20' : 'text-orange-500 bg-orange-500/10 border-orange-500/20'}`}>Net Liquidity</span>
                    </div>
                    <h3 className={`text-3xl font-bold font-heading tracking-tight ${netBalance >= 0 ? 'text-primary' : 'text-orange-500'}`}>{formatCurrencyFromCents(netBalance)}</h3>
                    <p className="text-foreground/40 text-[10px] font-bold uppercase tracking-widest mt-2">Operational Differential</p>
                </div>
            </div>

            {/* Differential Breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="card group overflow-hidden">
                    <div className="p-6 border-b border-border/40 flex items-center justify-between bg-secondary/5">
                        <div className="flex items-center gap-3">
                            <Activity className="w-5 h-5 text-emerald-500 opacity-60" />
                            <h3 className="text-lg font-bold text-foreground font-heading tracking-tight uppercase">Revenue Vectors</h3>
                        </div>
                        <PieIcon className="w-4 h-4 text-emerald-500/40" />
                    </div>
                    <div className="p-8">
                        {revenueData.length > 0 ? (
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={revenueData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                                            {revenueData.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                            formatter={(value: number) => formatCurrencyFromCents(value)}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="mt-4 flex flex-wrap gap-4 justify-center">
                                    {revenueData.map((item, index) => (
                                        <div key={item.name} className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                            <span className="text-[10px] font-bold uppercase text-foreground/60">{item.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="mt-8 text-center text-foreground/30 py-12 border-2 border-dashed border-border/20 rounded-2xl">
                                <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-10" />
                                <p className="text-[10px] font-bold uppercase tracking-widest leading-loose italic px-8">No revenue data for the selected period</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="card group overflow-hidden">
                    <div className="p-6 border-b border-border/40 flex items-center justify-between bg-secondary/5">
                        <div className="flex items-center gap-3">
                            <Activity className="w-5 h-5 text-destructive opacity-60" />
                            <h3 className="text-lg font-bold text-foreground font-heading tracking-tight uppercase">Expenditure Vectors</h3>
                        </div>
                        <BarChart3 className="w-4 h-4 text-destructive/40" />
                    </div>
                    <div className="p-8">
                        {expenseData.length > 0 ? (
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={expenseData} layout="vertical" margin={{ left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                            formatter={(value: number) => formatCurrencyFromCents(value)}
                                        />
                                        <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="mt-8 text-center text-foreground/30 py-12 border-2 border-dashed border-border/20 rounded-2xl">
                                <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-10" />
                                <p className="text-[10px] font-bold uppercase tracking-widest leading-loose italic px-8">No expenditure data for the selected period</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
