import React, { useState, useEffect, useCallback } from 'react'
import {
    Users,
    Activity,
    Plus
} from 'lucide-react'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { StatCard } from '../../../components/patterns/StatCard'
import { DataTable } from '../../../components/ui/Table/DataTable'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { useToast } from '../../../contexts/ToastContext'
import { BoardingFacility } from '../../../types/electron-api/OperationsAPI'

interface BoardingSummary {
    totalCapacity: number
    totalOccupancy: number
    occupancyRate: number
}

export default function BoardingProfitability() {
    const { showToast } = useToast()
    const [loading, setLoading] = useState(false)
    const [facilities, setFacilities] = useState<BoardingFacility[]>([])
    const [summary, setSummary] = useState<BoardingSummary | null>(null)
    
    // Expense Recording State
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
    const [expenseForm, setExpenseForm] = useState<{
        facility_id: string;
        expense_type: string;
        amount: string;
        description: string;
        gl_account_code: string;
    }>({
        facility_id: '',
        expense_type: 'FOOD',
        amount: '',
        description: '',
        gl_account_code: '' // Optional
    })

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            // Fetch facilities with their profitability data
            const data = await window.electronAPI.getBoardingFacilities()
            setFacilities(data)
            
            // Calculate aggregate summary
            const totalCapacity = data.reduce((acc: number, curr: BoardingFacility) => acc + curr.capacity, 0)
            const totalOccupancy = data.reduce((acc: number, curr: BoardingFacility) => acc + curr.current_occupancy, 0)
            const occupancyRate = totalCapacity > 0 ? (totalOccupancy / totalCapacity) * 100 : 0
            
            setSummary({
                totalCapacity,
                totalOccupancy,
                occupancyRate
            })
        } catch (error) {
            console.error(error)
            showToast('Failed to load boarding data', 'error')
        } finally {
            setLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleRecordExpense = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await window.electronAPI.recordBoardingExpense({
                ...expenseForm,
                facility_id: parseInt(expenseForm.facility_id),
                amount_cents: Math.round(parseFloat(expenseForm.amount) * 100),
                fiscal_year: new Date().getFullYear(), // Default to current year
                term: 1, // Default to Term 1 or fetch current term
                recorded_by: 1 // Default user
            })
            showToast('Expense recorded successfully', 'success')
            setIsExpenseModalOpen(false)
            setExpenseForm({
                facility_id: '',
                expense_type: 'FOOD',
                amount: '',
                description: '',
                gl_account_code: ''
            })
            loadData() // Refresh
        } catch (error) {
            console.error(error)
            showToast('Failed to record expense', 'error')
        }
    }

    const columns = [
        { key: 'name', header: 'Facility Name', accessorKey: 'name' },
        { key: 'capacity', header: 'Capacity', accessorKey: 'capacity' },
        { key: 'current_occupancy', header: 'Occupancy', accessorKey: 'current_occupancy' },
        { 
            key: 'occupancy_rate',
            header: 'Occupancy Rate', 
            accessorKey: 'occupancy_rate',
            cell: (row: BoardingFacility) => {
                const rate = row.capacity > 0 ? (row.current_occupancy / row.capacity) * 100 : 0
                return (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        rate >= 90 ? 'bg-green-100 text-green-800' :
                        rate >= 70 ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                    }`}>
                        {rate.toFixed(1)}%
                    </span>
                )
            }
        },
        {
            key: 'is_active',
            header: 'Status',
            accessorKey: 'is_active',
            cell: (row: BoardingFacility) => (
                <span className={`px-2 py-1 rounded-full text-xs ${row.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {row.is_active ? 'Active' : 'Inactive'}
                </span>
            )
        }
    ]

    return (
        <div className="space-y-6">
            <PageHeader
                title="Boarding Profitability"
                subtitle="Manage boarding facility costs and occupancy"
                breadcrumbs={[{ label: 'Operations' }, { label: 'Boarding' }]}
                actions={
                    <div className="flex gap-2">
                        <button 
                            type="button"
                            onClick={() => setIsExpenseModalOpen(true)}
                            className="btn btn-primary flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Record Expense
                        </button>
                    </div>
                }
            />

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard 
                    label="Total Capacity" 
                    value={summary?.totalCapacity || 0} 
                    icon={Users} 
                    color="text-blue-500" 
                />
                <StatCard 
                    label="Current Occupancy" 
                    value={summary?.totalOccupancy || 0} 
                    icon={Users} 
                    color="text-green-500" 
                />
                <StatCard 
                    label="Occupancy Rate" 
                    value={`${(summary?.occupancyRate || 0).toFixed(1)}%`} 
                    icon={Activity} 
                    color="text-purple-500" 
                />
            </div>

            {/* Facilities Table */}
            <div className="premium-card">
                <h3 className="text-lg font-bold mb-4">Facility Overview</h3>
                <DataTable
                    data={facilities}
                    columns={columns}
                    loading={loading}
                />
            </div>

            {/* Record Expense Modal */}
            <Modal
                isOpen={isExpenseModalOpen}
                onClose={() => setIsExpenseModalOpen(false)}
                title="Record Boarding Expense"
            >
                <form onSubmit={handleRecordExpense} className="space-y-4">
                    <Select
                        label="Facility"
                        value={expenseForm.facility_id}
                        onChange={(e) => setExpenseForm({...expenseForm, facility_id: e.target.value})}
                        options={facilities.map(f => ({ value: f.id, label: f.name }))}
                    />
                    
                    <Select
                        label="Expense Type"
                        value={expenseForm.expense_type}
                        onChange={(e) => setExpenseForm({...expenseForm, expense_type: e.target.value})}
                        options={[
                            { value: 'FOOD', label: 'Food' },
                            { value: 'UTILITIES', label: 'Utilities' },
                            { value: 'BEDDING', label: 'Bedding' },
                            { value: 'STAFF', label: 'Staff' },
                            { value: 'MAINTENANCE', label: 'Maintenance' },
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
                            Record Expense
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}
