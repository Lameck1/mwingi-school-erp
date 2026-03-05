import {
    Truck,
    Users,
    Plus,
    DollarSign
} from 'lucide-react'
import React from 'react'

import { useTransportRouteManagement } from './useTransportRouteManagement'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { StatCard } from '../../../components/patterns/StatCard'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { DataTable } from '../../../components/ui/Table/DataTable'
import { type TransportRoute } from '../../../types/electron-api/OperationsAPI'
import { formatCurrencyFromCents } from '../../../utils/format'

interface GLAccountOption {
    code: string
    label: string
}

const renderRouteStatus = (row: TransportRoute) => (
    <span className={`px-2 py-1 rounded-full text-xs ${row.is_active ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-gray-100 text-foreground'}`}>
        {row.is_active ? 'Active' : 'Inactive'}
    </span>
)

const ROUTE_COLUMNS = [
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
        cell: renderRouteStatus
    }
]

interface CreateRouteFormProps {
    form: { route_name: string; distance_km: string; estimated_students: string; budget_per_term: string }
    onFormChange: (form: CreateRouteFormProps['form']) => void
    onSubmit: (e: React.SyntheticEvent) => void
    onCancel: () => void
}

function CreateRouteForm({ form, onFormChange, onSubmit, onCancel }: Readonly<CreateRouteFormProps>) {
    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
                <label htmlFor="transport-route-name" className="text-xs font-bold text-foreground/60 px-1">Route Name</label>
                <Input
                    id="transport-route-name"
                    value={form.route_name}
                    onChange={(e) => onFormChange({ ...form, route_name: e.target.value })}
                    required
                />
            </div>
            <div className="space-y-1.5">
                <label htmlFor="transport-distance-km" className="text-xs font-bold text-foreground/60 px-1">Distance (KM)</label>
                <Input
                    id="transport-distance-km"
                    type="number"
                    value={form.distance_km}
                    onChange={(e) => onFormChange({ ...form, distance_km: e.target.value })}
                    required
                />
            </div>
            <div className="space-y-1.5">
                <label htmlFor="transport-estimated-students" className="text-xs font-bold text-foreground/60 px-1">Estimated Students</label>
                <Input
                    id="transport-estimated-students"
                    type="number"
                    value={form.estimated_students}
                    onChange={(e) => onFormChange({ ...form, estimated_students: e.target.value })}
                    required
                />
            </div>
            <div className="space-y-1.5">
                <label htmlFor="transport-budget-per-term" className="text-xs font-bold text-foreground/60 px-1">Budget Per Term (KES)</label>
                <Input
                    id="transport-budget-per-term"
                    type="number"
                    value={form.budget_per_term}
                    onChange={(e) => onFormChange({ ...form, budget_per_term: e.target.value })}
                    required
                />
            </div>
            <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={onCancel} className="btn btn-secondary">
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                    Create Route
                </button>
            </div>
        </form>
    )
}

interface RecordExpenseFormProps {
    form: { route_id: string; expense_type: string; amount: string; description: string; gl_account_code: string }
    onFormChange: (form: RecordExpenseFormProps['form']) => void
    routes: TransportRoute[]
    expenseAccounts: GLAccountOption[]
    onSubmit: (e: React.SyntheticEvent) => void
    onCancel: () => void
}

function RecordExpenseForm({ form, onFormChange, routes, expenseAccounts, onSubmit, onCancel }: Readonly<RecordExpenseFormProps>) {
    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <Select
                label="Route"
                value={form.route_id}
                onChange={(value) => onFormChange({ ...form, route_id: String(value) })}
                options={routes.map(r => ({ value: r.id, label: r.route_name }))}
            />
            <Select
                label="Expense Type"
                value={form.expense_type}
                onChange={(value) => onFormChange({ ...form, expense_type: String(value) })}
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
                    value={form.amount}
                    onChange={(e) => onFormChange({ ...form, amount: e.target.value })}
                    required
                />
            </div>
            <div className="space-y-1.5">
                <label htmlFor="transport-expense-description" className="text-xs font-bold text-foreground/60 px-1">Description</label>
                <Input
                    id="transport-expense-description"
                    value={form.description}
                    onChange={(e) => onFormChange({ ...form, description: e.target.value })}
                    required
                />
            </div>
            <Select
                label="Expense GL Account"
                value={form.gl_account_code}
                onChange={(value) => onFormChange({ ...form, gl_account_code: String(value) })}
                options={expenseAccounts.map((account) => ({ value: account.code, label: account.label }))}
            />
            <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={onCancel} className="btn btn-secondary">
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                    Save Expense
                </button>
            </div>
        </form>
    )
}

export default function TransportRouteManagement() {
    const {
        loading, routes, summary, expenseAccounts,
        isCreateModalOpen, createForm, isExpenseModalOpen, expenseForm,
        setCreateForm, setExpenseForm,
        closeCreateModal, closeExpenseModal,
        handleCreateRoute, handleRecordExpense,
        openCreateModal, openExpenseModal,
    } = useTransportRouteManagement()

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
                            onClick={openExpenseModal}
                            className="btn btn-secondary flex items-center gap-2"
                        >
                            <DollarSign className="w-4 h-4" /> Record Expense
                        </button>
                        <button
                            type="button"
                            onClick={openCreateModal}
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
                    columns={ROUTE_COLUMNS}
                    loading={loading}
                />
            </div>

            {/* Create Route Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={closeCreateModal}
                title="Create New Transport Route"
            >
                <CreateRouteForm
                    form={createForm}
                    onFormChange={setCreateForm}
                    onSubmit={handleCreateRoute}
                    onCancel={closeCreateModal}
                />
            </Modal>

            {/* Record Expense Modal */}
            <Modal
                isOpen={isExpenseModalOpen}
                onClose={closeExpenseModal}
                title="Record Transport Expense"
            >
                <RecordExpenseForm
                    form={expenseForm}
                    onFormChange={setExpenseForm}
                    routes={routes}
                    expenseAccounts={expenseAccounts}
                    onSubmit={handleRecordExpense}
                    onCancel={closeExpenseModal}
                />
            </Modal>
        </div>
    )
}
