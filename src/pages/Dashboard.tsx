import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../stores'
import { Tooltip as UITooltip } from '../components/ui/Tooltip'
import { FeeCollectionItem } from '../types/electron-api/ReportsAPI'
import { AuditLogEntry } from '../types/electron-api/AuditAPI'
import {
    Users, Wallet, UserCog,
    CreditCard, UserPlus, FileText, AlertCircle,
    BarChart3, Shield
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts'
import { formatCurrency, formatDateTime } from '../utils/format'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#334155', '#ec4899']

export default function Dashboard() {
    const { currentTerm, currentAcademicYear } = useAppStore()
    const [dashboardData, setDashboardData] = useState<{
        totalStudents: number
        totalStaff: number
        feeCollected: number
        outstandingBalance: number
    } | null>(null)
    const [feeCollectionData, setFeeCollectionData] = useState<{ month: string; total: number }[]>([])
    const [feeCategories, setFeeCategories] = useState<{ name: string; value: number }[]>([])
    const [recentActivities, setRecentActivities] = useState<AuditLogEntry[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadDashboardData()
    }, [])

    const loadDashboardData = async () => {
        try {
            const [data, feeData, categoryData, logs] = await Promise.all([
                window.electronAPI.getDashboardData(),
                window.electronAPI.getFeeCollectionReport(
                    new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                    new Date().toISOString().slice(0, 10)
                ),
                window.electronAPI.getFeeCategoryBreakdown(),
                window.electronAPI.getAuditLog(6)
            ])

            setDashboardData(data)
            setFeeCategories(categoryData)
            setRecentActivities(logs)

            const monthlyData: Record<string, number> = {}
            if (Array.isArray(feeData)) {
                feeData.forEach((item: FeeCollectionItem) => {
                    const date = new Date(item.payment_date)
                    if (isNaN(date.getTime())) return // Skip invalid dates

                    const month = date.toLocaleDateString('en-US', { month: 'short' })
                    const amount = Number(item.amount) || 0
                    monthlyData[month] = (monthlyData[month] || 0) + amount
                })
            }

            setFeeCollectionData(
                Object.entries(monthlyData).map(([month, total]) => ({ month, total }))
            )
        } catch (error) {
            console.error('Failed to load dashboard data:', error)
        } finally {
            setLoading(false)
        }
    }



    const stats = [
        {
            label: 'Active Students',
            value: dashboardData?.totalStudents?.toLocaleString() || '0',
            icon: Users,
            color: 'from-blue-500/20 to-indigo-500/20 text-indigo-400',
        },
        {
            label: 'Fees Collected',
            value: formatCurrency(dashboardData?.feeCollected || 0),
            icon: Wallet,
            color: 'from-emerald-500/20 to-teal-500/20 text-emerald-400',
        },
        {
            label: 'Outstanding Total',
            value: formatCurrency(dashboardData?.outstandingBalance || 0),
            icon: AlertCircle,
            color: 'from-amber-500/20 to-orange-500/20 text-amber-400',
        },
        {
            label: 'Staff Registry',
            value: dashboardData?.totalStaff?.toLocaleString() || '0',
            icon: UserCog,
            color: 'from-slate-500/20 to-slate-700/20 text-slate-300',
        },
    ]

    const quickActions = [
        { label: 'Payment', icon: CreditCard, path: '/fee-payment', color: 'from-emerald-600 to-teal-700' },
        { label: 'Student', icon: UserPlus, path: '/students/new', color: 'from-indigo-600 to-blue-700' },
        { label: 'Reports', icon: FileText, path: '/reports', color: 'from-slate-700 to-slate-800' },
    ]

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-primary/20 animate-pulse"></div>
                    <div className="absolute top-0 w-16 h-16 rounded-full border-4 border-t-primary animate-spin"></div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-10 pb-10">
            {/* Executive Summary Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-foreground font-heading">Financial Overview</h1>
                    <p className="text-foreground/50 mt-2 font-medium">
                        Insights for <span className="text-primary">{currentAcademicYear?.year_name}</span> • {currentTerm?.term_name || 'Academic Period'}
                    </p>
                </div>
                <div className="flex gap-3">
                    {quickActions.map((action) => (
                        <UITooltip key={action.path} content={`Open ${action.label}`}>
                            <Link
                                to={action.path}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br ${action.color} text-white text-xs font-bold uppercase tracking-wider shadow-lg transition-all hover:-translate-y-1 hover:brightness-110 active:scale-95`}
                            >
                                <action.icon className="w-4 h-4" />
                                {action.label}
                            </Link>
                        </UITooltip>
                    ))}
                </div>
            </div>

            {/* High-Impact Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {stats.map((stat, index) => (
                    <div key={index} className="stat-card group">
                        <div className="flex items-start justify-between relative z-10">
                            <div>
                                <p className="stat-card-label">{stat.label}</p>
                                <p className="stat-card-value mt-3 group-hover:text-primary transition-colors">{stat.value}</p>
                            </div>
                            <div className={`p-4 rounded-2xl bg-gradient-to-br ${stat.color} border border-border/20`}>
                                <stat.icon className="w-6 h-6" />
                            </div>
                        </div>
                        {/* Subtle background decoration */}
                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all"></div>
                    </div>
                ))}
            </div>

            {/* Analytics Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Fee Collection Chart (Span 2) */}
                <div className="lg:col-span-2 card">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-foreground">Revenue Performance</h3>
                            <p className="text-xs text-foreground/40 font-medium">6-Month Fee Collection Trend</p>
                        </div>
                        <BarChart3 className="w-5 h-5 text-primary/60" />
                    </div>
                    <div className="h-[340px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={feeCollectionData}>
                                <defs>
                                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.8} />
                                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.1} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border/40" />
                                <XAxis
                                    dataKey="month"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'currentColor', fontSize: 11, fontWeight: 600 }}
                                    className="text-foreground/40"
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'currentColor', fontSize: 11 }}
                                    className="text-foreground/40"
                                    tickFormatter={(value) => `${(value / 100000).toFixed(0)}K`}
                                />
                                <Tooltip
                                    cursor={{ fill: 'currentColor', opacity: 0.05 }}
                                    contentStyle={{
                                        backgroundColor: 'var(--card)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '12px',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                                    }}
                                    itemStyle={{ color: 'var(--primary)', fontSize: '12px', fontWeight: 'bold' }}
                                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                                />
                                <Bar dataKey="total" fill="url(#barGradient)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Audit Trail / Activities */}
                <div className="card">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-foreground">Audit Trail</h3>
                            <p className="text-xs text-foreground/40 font-medium">Recent security & system logs</p>
                        </div>
                        <Link to="/audit-log" className="p-2 rounded-lg bg-background/50 hover:bg-primary/20 text-primary transition-all">
                            <BarChart3 className="w-4 h-4" />
                        </Link>
                    </div>
                    <div className="space-y-6">
                        {recentActivities.length === 0 ? (
                            <div className="text-center py-12">
                                <Shield className="w-12 h-12 mx-auto mb-4 text-border" />
                                <p className="text-sm text-foreground/40">Secure & Silent</p>
                            </div>
                        ) : (
                            recentActivities.map((log) => (
                                <div key={log.id} className="relative pl-6 pb-6 last:pb-0 group">
                                    {/* Timeline line */}
                                    <div className="absolute left-0 top-0 bottom-0 w-px bg-border group-last:h-2"></div>
                                    <div className="absolute left-[-4px] top-1.5 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>

                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-foreground">{log.action_type}</p>
                                            <span className="text-[9px] font-medium text-foreground/40">{formatDateTime(log.created_at)}</span>
                                        </div>
                                        <p className="text-xs text-foreground/60 leading-relaxed">
                                            Targeted <span className="text-primary font-medium">{log.table_name}</span> record <span className="text-foreground font-mono">#{log.record_id}</span>
                                        </p>
                                        <p className="text-[10px] text-foreground/40 italic">Agent ID: {log.user_id}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Distribution Analysis */}
            <div className="card">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="max-w-xs">
                        <h3 className="text-lg font-bold text-foreground">Revenue Distribution</h3>
                        <p className="text-xs text-foreground/40 font-medium leading-relaxed mt-2">
                            A breakdown of the current term's financial allocation across all established fee categories.
                        </p>
                        <div className="mt-8 space-y-3">
                            {feeCategories.slice(0, 4).map((cat, i) => (
                                <div key={i} className="flex items-center justify-between text-[11px]">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                        <span className="text-foreground/70">{cat.name}</span>
                                    </div>
                                    <span className="text-foreground font-bold">{((cat.value / (dashboardData?.feeCollected || 1)) * 100).toFixed(1)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={feeCategories}
                                    innerRadius={70}
                                    outerRadius={110}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {feeCategories.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '12px' }}
                                    itemStyle={{ color: 'var(--foreground)' }}
                                    formatter={(value: number) => [formatCurrency(value), 'Allocation']}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    )
}
