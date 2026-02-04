import React, { useState, useEffect, useCallback } from 'react'
import {
    Truck,
    Users,
    Plus,
    DollarSign
} from 'lucide-react'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { StatCard } from '../../../components/patterns/StatCard'
import { DataTable } from '../../../components/ui/Table/DataTable'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { useToast } from '../../../contexts/ToastContext'
import { TransportRoute } from '../../../types/electron-api/OperationsAPI'

interface TransportSummary {
    totalRoutes: number
    totalStudents: number
}

export default function TransportRouteManagement() {
    const { showToast } = useToast()
    const [loading, setLoading] = useState(false)
    const [routes, setRoutes] = useState<TransportRoute[]>([])
    const [summary, setSummary] = useState<TransportSummary | null>(null)
    
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
    }>({
        route_id: '',
        expense_type: 'FUEL',
        amount: '',
        description: ''
    })

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const data = await window.electronAPI.getTransportRoutes()
            setRoutes(data)
            
            const totalRoutes = data.length
            const totalStudents = data.reduce((acc: number, curr: TransportRoute) => acc + (curr.estimated_students || 0), 0)
            
            setSummary({
                totalRoutes,
                totalStudents
            })
        } catch (error) {
            console.error(error)
            showToast('Failed to load transport data', 'error')
        } finally {
            setLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleCreateRoute = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await window.electronAPI.createTransportRoute({
                route_name: createForm.route_name,
                distance_km: parseFloat(createForm.distance_km),
                estimated_students: parseInt(createForm.estimated_students),
                budget_per_term_cents: Math.round(parseFloat(createForm.budget_per_term) * 100)
            })
            showToast('Route created successfully', 'success')
            setIsCreateModalOpen(false)
            setCreateForm({ route_name: '', distance_km: '', estimated_students: '', budget_per_term: '' })
            loadData()
        } catch (error) {
            console.error(error)
            showToast('Failed to create route', 'error')
        }
    }

    const handleRecordExpense = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await window.electronAPI.recordTransportExpense({
                ...expenseForm,
                route_id: parseInt(expenseForm.route_id),
                amount_cents: Math.round(parseFloat(expenseForm.amount) * 100),
                fiscal_year: new Date().getFullYear(),
                term: 1, // Default to Term 1
                recorded_by: 1
            })
            showToast('Expense recorded successfully', 'success')
            setIsExpenseModalOpen(false)
            setExpenseForm({ route_id: '', expense_type: 'FUEL', amount: '', description: '' })
        } catch (error) {
            console.error(error)
            showToast('Failed to record expense', 'error')
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
            cell: (row: TransportRoute) => (row.budget_per_term_cents / 100).toLocaleString()
        },
        {
            key: 'is_active',
            header: 'Status',
            accessorKey: 'is_active',
            cell: (row: TransportRoute) => (
                <span className={`px-2 py-1 rounded-full text-xs ${row.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
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
                            onClick={() => setIsExpenseModalOpen(true)}
                            className="btn btn-secondary flex items-center gap-2"
                        >
                            <DollarSign className="w-4 h-4" /> Record Expense
                        </button>
                        <button 
                            type="button"
                            onClick={() => setIsCreateModalOpen(true)}
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
                onClose={() => setIsCreateModalOpen(false)}
                title="Create New Transport Route"
            >
                <form onSubmit={handleCreateRoute} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/60 px-1">Route Name</label>
                        <Input
                            value={createForm.route_name}
                            onChange={(e) => setCreateForm({...createForm, route_name: e.target.value})}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/60 px-1">Distance (KM)</label>
                        <Input
                            type="number"
                            value={createForm.distance_km}
                            onChange={(e) => setCreateForm({...createForm, distance_km: e.target.value})}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/60 px-1">Estimated Students</label>
                        <Input
                            type="number"
                            value={createForm.estimated_students}
                            onChange={(e) => setCreateForm({...createForm, estimated_students: e.target.value})}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/60 px-1">Budget Per Term (KES)</label>
                        <Input
                            type="number"
                            value={createForm.budget_per_term}
                            onChange={(e) => setCreateForm({...createForm, budget_per_term: e.target.value})}
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn btn-secondary">
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
                onClose={() => setIsExpenseModalOpen(false)}
                title="Record Transport Expense"
            >
                <form onSubmit={handleRecordExpense} className="space-y-4">
                    <Select
                        label="Route"
                        value={expenseForm.route_id}
                        onChange={(e) => setExpenseForm({...expenseForm, route_id: e.target.value})}
                        options={routes.map(r => ({ value: r.id, label: r.route_name }))}
                    />
                    <Select
                        label="Expense Type"
                        value={expenseForm.expense_type}
                        onChange={(e) => setExpenseForm({...expenseForm, expense_type: e.target.value})}
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
                        <label className="text-xs font-bold text-foreground/60 px-1">Amount (KES)</label>
                        <Input
                            type="number"
                            value={expenseForm.amount}
                            onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/60 px-1">Description</label>
                        <Input
                            value={expenseForm.description}
                            onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="btn btn-secondary">
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
