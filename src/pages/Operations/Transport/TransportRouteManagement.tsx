import {
    Truck,
    Users,
    Plus,
    DollarSign
} from 'lucide-react'
import React, { useState, useEffect, useCallback } from 'react'

import { PageHeader } from '../../../components/patterns/PageHeader'
import { StatCard } from '../../../components/patterns/StatCard'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { DataTable } from '../../../components/ui/Table/DataTable'
import { useToast } from '../../../contexts/ToastContext'
import { useAppStore, useAuthStore } from '../../../stores'
import { type TransportRoute } from '../../../types/electron-api/OperationsAPI'
import { formatCurrencyFromCents, shillingsToCents } from '../../../utils/format'
import { unwrapArrayResult, unwrapIPCResult } from '../../../utils/ipc'

interface TransportSummary {
    totalRoutes: number
    totalStudents: number
}

interface GLAccountOption {
    code: string
    label: string
}

const resolveTermNumber = (termName?: string, termNumber?: number): number | null => {
    if (typeof termNumber === 'number' && Number.isInteger(termNumber) && termNumber > 0) {
        return termNumber
    }
    if (!termName) {
        return null
    }
    const parsed = Number.parseInt(termName.replace(/\D/g, ''), 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function TransportRouteManagement() {
    const { showToast } = useToast()
    const { currentAcademicYear, currentTerm } = useAppStore()
    const { user } = useAuthStore()
    const [loading, setLoading] = useState(false)
    const [routes, setRoutes] = useState<TransportRoute[]>([])
    const [summary, setSummary] = useState<TransportSummary | null>(null)
    const [expenseAccounts, setExpenseAccounts] = useState<GLAccountOption[]>([])

    // Create Route State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [createForm, setCreateForm] = useState<{
        route_name: string;
        distance_km: string;
        estimated_students: string;
        budget_per_term: string;
    }>({
        route_name: '',
        distance_km: '',
        estimated_students: '',
        budget_per_term: ''
    })

    // Expense Recording State
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
    const [expenseForm, setExpenseForm] = useState<{
        route_id: string;
        expense_type: string;
        amount: string;
        description: string;
        gl_account_code: string;
    }>({
        route_id: '',
        expense_type: 'FUEL',
        amount: '',
        description: '',
        gl_account_code: ''
    })

    const createEmptyCreateForm = () => ({
        route_name: '',
        distance_km: '',
        estimated_students: '',
        budget_per_term: ''
    })

    const createEmptyExpenseForm = (glAccountCode = '') => ({
        route_id: '',
        expense_type: 'FUEL',
        amount: '',
        description: '',
        gl_account_code: glAccountCode
    })

    const closeCreateModal = () => {
        setIsCreateModalOpen(false)
        setCreateForm(createEmptyCreateForm())
    }

    const closeExpenseModal = () => {
        setIsExpenseModalOpen(false)
        setExpenseForm(createEmptyExpenseForm(expenseAccounts[0]?.code || ''))
    }

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [routesRaw, glAccountsRaw] = await Promise.all([
                globalThis.electronAPI.getTransportRoutes(),
                globalThis.electronAPI.getGLAccounts({ type: 'EXPENSE', isActive: true })
            ])
            const routesData = unwrapArrayResult(routesRaw, 'Failed to load transport routes')
            setRoutes(routesData)

            const totalRoutes = routesData.length
            const totalStudents = routesData.reduce((acc: number, curr: TransportRoute) => acc + (curr.estimated_students || 0), 0)

            setSummary({
                totalRoutes,
                totalStudents
            })

            const glResponse = unwrapIPCResult<{
                success: boolean
                data?: Array<{ account_code?: string; account_name?: string }>
                message?: string
            }>(glAccountsRaw, 'Failed to load expense GL accounts')
            const accountOptions = Array.isArray(glResponse.data)
                ? glResponse.data
                    .filter((row) => Boolean(row.account_code))
                    .map((row) => ({
                        code: row.account_code || '',
                        label: `${row.account_code || ''} - ${row.account_name || 'Unnamed account'}`
                    }))
                : []
            setExpenseAccounts(accountOptions)
            if (accountOptions.length > 0) {
                setExpenseForm((prev) => prev.gl_account_code ? prev : { ...prev, gl_account_code: accountOptions[0]?.code || '' })
            }
        } catch (error) {
            console.error(error)
            setRoutes([])
            setSummary(null)
            setExpenseAccounts([])
            showToast(error instanceof Error ? error.message : 'Failed to load transport data', 'error')
        } finally {
            setLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        loadData().catch((err: unknown) => console.error('Failed to load transport data', err))
    }, [loadData])

    const handleCreateRoute = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.createTransportRoute({
                route_name: createForm.route_name,
                distance_km: Number.parseFloat(createForm.distance_km),
                estimated_students: Number.parseInt(createForm.estimated_students, 10),
                budget_per_term_cents: shillingsToCents(createForm.budget_per_term)
                }),
                'Failed to create route'
            )
            showToast('Route created successfully', 'success')
            closeCreateModal()
            await loadData()
        } catch (error) {
            console.error(error)
            showToast(error instanceof Error ? error.message : 'Failed to create route', 'error')
        }
    }

    const handleRecordExpense = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        try {
            if (!user) {
                showToast('User not authenticated', 'error')
                return
            }
            const fiscalYear = Number.parseInt(currentAcademicYear?.year_name || '', 10)
            const activeTerm = resolveTermNumber(currentTerm?.term_name, currentTerm?.term_number)
            if (!Number.isInteger(fiscalYear)) {
                showToast('Active academic year is not configured correctly', 'error')
                return
            }
            if (activeTerm === null) {
                showToast('Active term is not configured correctly', 'error')
                return
            }
            if (!expenseForm.gl_account_code.trim()) {
                showToast('Select an expense GL account', 'warning')
                return
            }
            unwrapIPCResult(
                await globalThis.electronAPI.recordTransportExpense({
                ...expenseForm,
                route_id: Number.parseInt(expenseForm.route_id, 10),
                amount_cents: shillingsToCents(expenseForm.amount),
                fiscal_year: fiscalYear,
                term: activeTerm,
                recorded_by: user.id
                }),
                'Failed to record transport expense'
            )
            showToast('Expense recorded successfully', 'success')
            closeExpenseModal()
            await loadData()
        } catch (error) {
            console.error(error)
            showToast(error instanceof Error ? error.message : 'Failed to record expense', 'error')
        }
    }

    const columns = [
        { key: 'route_name', header: 'Route Name', accessorKey: 'route_name' },
        { key: 'distance_km', header: 'Distance (KM)', accessorKey: 'distance_km' },
        { key: 'estimated_students', header: 'Est. Students', accessorKey: 'estimated_students' },
        {
            key: 'budget_per_term_cents',
            header: 'Budget (KES)',
            accessorKey: 'budget_per_term_cents',
            cell: (row: TransportRoute) => formatCurrencyFromCents(row.budget_per_term_cents)
        },
        {
            key: 'is_active',
            header: 'Status',
            accessorKey: 'is_active',
            cell: (row: TransportRoute) => (
                <span className={`px-2 py-1 rounded-full text-xs ${row.is_active ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-gray-100 text-foreground'}`}>
                    {row.is_active ? 'Active' : 'Inactive'}
                </span>
            )
        }
    ]

    return (
        <div className="space-y-6">
            <PageHeader
                title="Transport Route Management"
                subtitle="Manage routes, vehicle assignments, and costs"
                breadcrumbs={[{ label: 'Operations' }, { label: 'Transport' }]}
                actions={
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setExpenseForm(createEmptyExpenseForm(expenseAccounts[0]?.code || ''))
                                setIsExpenseModalOpen(true)
                            }}
                            className="btn btn-secondary flex items-center gap-2"
                        >
                            <DollarSign className="w-4 h-4" /> Record Expense
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setCreateForm(createEmptyCreateForm())
                                setIsCreateModalOpen(true)
                            }}
                            className="btn btn-primary flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Add Route
                        </button>
                    </div>
                }
            />

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatCard
                    label="Total Routes"
                    value={summary?.totalRoutes || 0}
                    icon={Truck}
                    color="text-blue-500"
                />
                <StatCard
                    label="Students Transported"
                    value={summary?.totalStudents || 0}
                    icon={Users}
                    color="text-green-500"
                />
            </div>

            {/* Routes Table */}
            <div className="premium-card">
                <h3 className="text-lg font-bold mb-4">Route Overview</h3>
                <DataTable
                    data={routes}
                    columns={columns}
                    loading={loading}
                />
            </div>

            {/* Create Route Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={closeCreateModal}
                title="Create New Transport Route"
            >
                <form onSubmit={handleCreateRoute} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="transport-route-name" className="text-xs font-bold text-foreground/60 px-1">Route Name</label>
                        <Input
                            id="transport-route-name"
                            value={createForm.route_name}
                            onChange={(e) => setCreateForm({ ...createForm, route_name: e.target.value })}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="transport-distance-km" className="text-xs font-bold text-foreground/60 px-1">Distance (KM)</label>
                        <Input
                            id="transport-distance-km"
                            type="number"
                            value={createForm.distance_km}
                            onChange={(e) => setCreateForm({ ...createForm, distance_km: e.target.value })}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="transport-estimated-students" className="text-xs font-bold text-foreground/60 px-1">Estimated Students</label>
                        <Input
                            id="transport-estimated-students"
                            type="number"
                            value={createForm.estimated_students}
                            onChange={(e) => setCreateForm({ ...createForm, estimated_students: e.target.value })}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="transport-budget-per-term" className="text-xs font-bold text-foreground/60 px-1">Budget Per Term (KES)</label>
                        <Input
                            id="transport-budget-per-term"
                            type="number"
                            value={createForm.budget_per_term}
                            onChange={(e) => setCreateForm({ ...createForm, budget_per_term: e.target.value })}
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={closeCreateModal} className="btn btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Create Route
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Record Expense Modal */}
            <Modal
                isOpen={isExpenseModalOpen}
                onClose={closeExpenseModal}
                title="Record Transport Expense"
            >
                <form onSubmit={handleRecordExpense} className="space-y-4">
                    <Select
                        label="Route"
                        value={expenseForm.route_id}
                        onChange={(value) => setExpenseForm({ ...expenseForm, route_id: String(value) })}
                        options={routes.map(r => ({ value: r.id, label: r.route_name }))}
                    />
                    <Select
                        label="Expense Type"
                        value={expenseForm.expense_type}
                        onChange={(value) => setExpenseForm({ ...expenseForm, expense_type: String(value) })}
                        options={[
                            { value: 'FUEL', label: 'Fuel' },
                            { value: 'MAINTENANCE', label: 'Maintenance' },
                            { value: 'INSURANCE', label: 'Insurance' },
                            { value: 'PERMITS', label: 'Permits' },
                            { value: 'DRIVER_SALARY', label: 'Driver Salary' },
                            { value: 'OTHER', label: 'Other' }
                        ]}
                    />
                    <div className="space-y-1.5">
                        <label htmlFor="transport-expense-amount" className="text-xs font-bold text-foreground/60 px-1">Amount (KES)</label>
                        <Input
                            id="transport-expense-amount"
                            type="number"
                            value={expenseForm.amount}
                            onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="transport-expense-description" className="text-xs font-bold text-foreground/60 px-1">Description</label>
                        <Input
                            id="transport-expense-description"
                            value={expenseForm.description}
                            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                            required
                        />
                    </div>
                    <Select
                        label="Expense GL Account"
                        value={expenseForm.gl_account_code}
                        onChange={(value) => setExpenseForm({ ...expenseForm, gl_account_code: String(value) })}
                        options={expenseAccounts.map((account) => ({ value: account.code, label: account.label }))}
                    />
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={closeExpenseModal} className="btn btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Save Expense
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}
