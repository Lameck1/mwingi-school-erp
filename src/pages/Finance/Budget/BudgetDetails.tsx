import {
    ArrowLeft, TrendingUp, TrendingDown, CheckCircle,
    XCircle, Clock, Edit, Send, FileText, AlertTriangle
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import { PageHeader } from '../../../components/patterns/PageHeader'
import { StatCard } from '../../../components/patterns/StatCard'
import { Badge } from '../../../components/ui/Badge'
import { useAuthStore } from '../../../stores'
import { type Budget } from '../../../types/electron-api'
import { formatCurrencyFromCents } from '../../../utils/format'

const statusConfig = {
    DRAFT: { label: 'Draft', variant: 'default' as const, icon: Edit },
    SUBMITTED: { label: 'Pending Approval', variant: 'warning' as const, icon: Clock },
    APPROVED: { label: 'Approved', variant: 'success' as const, icon: CheckCircle },
    REJECTED: { label: 'Rejected', variant: 'error' as const, icon: XCircle },
    ACTIVE: { label: 'Active', variant: 'info' as const, icon: TrendingUp },
    CLOSED: { label: 'Closed', variant: 'default' as const, icon: FileText },
}

export default function BudgetDetails() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { user } = useAuthStore()

    const [budget, setBudget] = useState<Budget | null>(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)

    const loadBudget = useCallback(async () => {
        const budgetId = Number(id)
        if (!id || Number.isNaN(budgetId)) {
            console.warn('Invalid budget ID in URL:', id)
            navigate('/budget')
            return
        }

        setLoading(true)
        try {
            const data = await globalThis.electronAPI.getBudgetById(budgetId)
            if (!data) {
                console.warn('Budget not found for ID:', budgetId)
                return
            }
            setBudget(data)
        } catch (error) {
            console.error('Failed to load budget:', error)
        } finally {
            setLoading(false)
        }
    }, [id, navigate])

    useEffect(() => {
        loadBudget().catch((err: unknown) => console.error('Failed to load budget:', err))
    }, [loadBudget])

    const handleSubmitForApproval = async () => {
        if (!budget || !user) {return}
        setActionLoading(true)
        try {
            const result = await globalThis.electronAPI.submitBudgetForApproval(budget.id, user.id)
            if (result.success) {
                loadBudget().catch((err: unknown) => console.error('Failed to reload budget:', err))
            }
        } catch (error) {
            console.error('Failed to submit budget:', error)
        } finally {
            setActionLoading(false)
        }
    }

    const handleApprove = async () => {
        if (!budget || !user) {return}
        setActionLoading(true)
        try {
            const result = await globalThis.electronAPI.approveBudget(budget.id, user.id)
            if (result.success) {
                loadBudget().catch((err: unknown) => console.error('Failed to reload budget:', err))
            }
        } catch (error) {
            console.error('Failed to approve budget:', error)
        } finally {
            setActionLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-8 pb-10">
                <div className="h-20 bg-white/5 animate-pulse rounded-xl" />
                <div className="grid grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map((value) => (
                        <div key={value} className="h-32 bg-white/5 animate-pulse rounded-xl" />
                    ))}
                </div>
            </div>
        )
    }

    if (!budget) {
        return (
            <div className="text-center py-20 text-foreground/40">
                Budget not found
            </div>
        )
    }

    const config = statusConfig[budget.status]
    if (!config) {
        console.warn(`Unexpected budget status: ${budget.status}`)
        return (
            <div className="flex flex-col items-center justify-center py-20 text-foreground/40 gap-4">
                <AlertTriangle className="w-10 h-10 text-amber-500" />
                <p>Invalid budget state: {budget.status}</p>
                <button onClick={() => navigate('/budget')} className="btn btn-secondary">
                    Back to Budgets
                </button>
            </div>
        )
    }

    const Icon = config.icon
    const variance = budget.total_variance || 0
    const variancePercent = budget.total_budgeted
        ? ((variance / budget.total_budgeted) * 100).toFixed(1)
        : '0'

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title={budget.budget_name}
                subtitle={`Created by ${budget.created_by_name}`}
                breadcrumbs={[
                    { label: 'Finance' },
                    { label: 'Budgets', href: '/budget' },
                    { label: budget.budget_name }
                ]}
                actions={
                    <div className="flex items-center gap-3">
                        <Badge variant={config.variant} icon={Icon}>
                            {config.label}
                        </Badge>

                        {budget.status === 'DRAFT' && (
                            <button
                                onClick={handleSubmitForApproval}
                                disabled={actionLoading}
                                className="btn btn-primary flex items-center gap-2"
                            >
                                <Send className="w-4 h-4" />
                                Submit for Approval
                            </button>
                        )}

                        {budget.status === 'SUBMITTED' && user?.role === 'ADMIN' && (
                            <button
                                onClick={handleApprove}
                                disabled={actionLoading}
                                className="btn btn-primary flex items-center gap-2"
                            >
                                <CheckCircle className="w-4 h-4" />
                                Approve
                            </button>
                        )}

                        <button
                            onClick={() => navigate('/budget')}
                            className="btn btn-secondary flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </button>
                    </div>
                }
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    label="Total Budgeted"
                    value={formatCurrencyFromCents(budget.total_budgeted || 0)}
                    icon={FileText}
                    color="from-blue-500/20 to-indigo-500/20 text-blue-400"
                />
                <StatCard
                    label="Actual Spent"
                    value={formatCurrencyFromCents(budget.total_actual || 0)}
                    icon={TrendingDown}
                    color="from-amber-500/20 to-orange-500/20 text-amber-400"
                />
                <StatCard
                    label="Variance"
                    value={formatCurrencyFromCents(Math.abs(variance))}
                    icon={variance >= 0 ? TrendingUp : TrendingDown}
                    color={variance >= 0
                        ? "from-green-500/20 to-emerald-500/20 text-green-400"
                        : "from-red-500/20 to-rose-500/20 text-red-400"
                    }
                    trend={variance >= 0 ? 'up' : 'down'}
                    trendLabel={`${variancePercent}% ${variance >= 0 ? 'under' : 'over'} budget`}
                />
                <StatCard
                    label="Utilization"
                    value={budget.total_budgeted ? `${Math.round((budget.total_actual || 0) / budget.total_budgeted * 100)}%` : '0%'}
                    icon={TrendingUp}
                    color="from-purple-500/20 to-pink-500/20 text-purple-400"
                />
            </div>

            {/* Notes */}
            {budget.notes && (
                <div className="premium-card">
                    <h3 className="text-sm font-bold text-foreground/60 uppercase tracking-wider mb-3">Notes</h3>
                    <p className="text-foreground/70 whitespace-pre-wrap">{budget.notes}</p>
                </div>
            )}

            {/* Approval Info */}
            {budget.approved_by_name && (
                <div className="premium-card bg-green-500/5 border-green-500/20">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <div>
                            <p className="text-sm font-bold text-white">Approved by {budget.approved_by_name}</p>
                            <p className="text-xs text-foreground/40">
                                {budget.approved_at ? new Date(budget.approved_at).toLocaleDateString() : ''}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
