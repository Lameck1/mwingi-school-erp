import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
    Plus, TrendingUp, TrendingDown, DollarSign,
    CheckCircle, XCircle, Clock, AlertTriangle,
    Edit, FileText
} from 'lucide-react'
import { DataTable, Column } from '../../../components/ui/Table/DataTable'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { StatCard } from '../../../components/patterns/StatCard'
import { useAppStore } from '../../../stores'
import { formatCurrency } from '../../../utils/format'
import { Budget } from '../../../types/electron-api'

const statusConfig = {
    DRAFT: { label: 'Draft', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: Edit },
    SUBMITTED: { label: 'Pending Approval', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
    APPROVED: { label: 'Approved', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle },
    REJECTED: { label: 'Rejected', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
    ACTIVE: { label: 'Active', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: TrendingUp },
    CLOSED: { label: 'Closed', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: FileText },
}

export default function BudgetList() {
    const navigate = useNavigate()
    const { currentAcademicYear } = useAppStore()

    const [budgets, setBudgets] = useState<Budget[]>([])
    const [loading, setLoading] = useState(true)
    const [summary, setSummary] = useState({
        totalBudgets: 0,
        activeBudget: 0,
        totalBudgeted: 0,
        totalActual: 0,
        variance: 0,
    })

    const loadBudgets = useCallback(async () => {
        setLoading(true)
        try {
            const data = await window.electronAPI.getBudgets({
                academic_year_id: currentAcademicYear?.id
            })
            setBudgets(data)

            // Calculate summary
            const active = data.find((b: Budget) => b.status === 'ACTIVE')
            setSummary({
                totalBudgets: data.length,
                activeBudget: active?.total_amount || 0,
                totalBudgeted: data.reduce((sum: number, b: Budget) => sum + (b.total_budgeted || 0), 0),
                totalActual: data.reduce((sum: number, b: Budget) => sum + (b.total_actual || 0), 0),
                variance: data.reduce((sum: number, b: Budget) => sum + (b.total_variance || 0), 0),
            })
        } catch (error) {
            console.error('Failed to load budgets:', error)
        } finally {
            setLoading(false)
        }
    }, [currentAcademicYear])

    useEffect(() => {
        loadBudgets()
    }, [loadBudgets])

    const columns: Column<Budget>[] = [
        {
            key: 'budget_name',
            header: 'Budget Name',
            sortable: true,
            render: (_, row) => (
                <div>
                    <p className="font-bold text-white">{row.budget_name}</p>
                    <p className="text-xs text-foreground/40">
                        Created by {row.created_by_name}
                    </p>
                </div>
            )
        },
        {
            key: 'status',
            header: 'Status',
            render: (value) => {
                const status = (value || 'DRAFT') as keyof typeof statusConfig
                const config = statusConfig[status]

                if (!config) {
                    console.warn(`Unexpected budget status: ${value}`)
                    return <span className="text-foreground/40 italic">{String(value)}</span>
                }

                const Icon = config.icon
                return (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${config.color}`}>
                        <Icon className="w-3 h-3" />
                        {config.label}
                    </span>
                )
            }
        },
        {
            key: 'total_budgeted',
            header: 'Budgeted',
            align: 'right',
            sortable: true,
            render: (value) => (
                <span className="font-mono font-bold text-white">{formatCurrency(value as number)}</span>
            )
        },
        {
            key: 'total_actual',
            header: 'Actual',
            align: 'right',
            render: (value) => (
                <span className="font-mono font-medium text-foreground/70">{formatCurrency(value as number)}</span>
            )
        },
        {
            key: 'total_variance',
            header: 'Variance',
            align: 'right',
            render: (value) => {
                const variance = value as number
                const isPositive = variance >= 0
                return (
                    <span className={`font-mono font-bold flex items-center justify-end gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {formatCurrency(Math.abs(variance))}
                    </span>
                )
            }
        },
    ]

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Budget Management"
                subtitle="Create, track, and analyze financial budgets"
                breadcrumbs={[{ label: 'Finance' }, { label: 'Budgets' }]}
                actions={
                    <Link
                        to="/budget/new"
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Create Budget
                    </Link>
                }
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    label="Active Budget"
                    value={formatCurrency(summary.activeBudget)}
                    icon={DollarSign}
                    color="from-blue-500/20 to-indigo-500/20 text-blue-400"
                />
                <StatCard
                    label="Total Budgeted"
                    value={formatCurrency(summary.totalBudgeted)}
                    icon={FileText}
                    color="from-emerald-500/20 to-teal-500/20 text-emerald-400"
                />
                <StatCard
                    label="Total Spent"
                    value={formatCurrency(summary.totalActual)}
                    icon={TrendingDown}
                    color="from-amber-500/20 to-orange-500/20 text-amber-400"
                />
                <StatCard
                    label="Overall Variance"
                    value={formatCurrency(Math.abs(summary.variance))}
                    icon={summary.variance >= 0 ? TrendingUp : AlertTriangle}
                    color={summary.variance >= 0
                        ? "from-green-500/20 to-emerald-500/20 text-green-400"
                        : "from-red-500/20 to-rose-500/20 text-red-400"
                    }
                    trend={summary.variance >= 0 ? 'up' : 'down'}
                    trendLabel={summary.variance >= 0 ? 'Under budget' : 'Over budget'}
                />
            </div>

            {/* Budget List */}
            <div className="premium-card">
                <DataTable
                    data={budgets}
                    columns={columns}
                    loading={loading}
                    emptyMessage="No budgets created yet"
                    onRowClick={(row) => {
                        if (row.id) {
                            navigate(`/budget/${row.id}`)
                        } else {
                            console.warn('Click attempt on budget with missing ID:', row)
                        }
                    }}
                    sortable
                    paginated
                    pageSize={10}
                />
            </div>
        </div>
    )
}
