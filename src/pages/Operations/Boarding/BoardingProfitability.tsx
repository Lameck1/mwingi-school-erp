import {
    Users,
    Activity,
    Plus
} from 'lucide-react'
import React, { useState, useEffect, useCallback } from 'react'

import { PageHeader } from '../../../components/patterns/PageHeader'
import { StatCard } from '../../../components/patterns/StatCard'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { DataTable } from '../../../components/ui/Table/DataTable'
import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore } from '../../../stores'
import { type BoardingFacility } from '../../../types/electron-api/OperationsAPI'
import { shillingsToCents } from '../../../utils/format'

interface BoardingSummary {
    totalCapacity: number
    totalOccupancy: number
    occupancyRate: number
}

export default function BoardingProfitability() {
    const { showToast } = useToast()
    const { user } = useAuthStore()
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
            const data = await globalThis.electronAPI.getBoardingFacilities()
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
        loadData().catch((err: unknown) => console.error('Failed to load boarding data', err))
    }, [loadData])

    const handleRecordExpense = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            if (!user) {
                showToast('User not authenticated', 'error')
                return
            }
            await globalThis.electronAPI.recordBoardingExpense({
                ...expenseForm,
                facility_id: Number.parseInt(expenseForm.facility_id, 10),
                amount_cents: shillingsToCents(expenseForm.amount),
                fiscal_year: new Date().getFullYear(), // Default to current year
                term: 1, // Default to Term 1 or fetch current term
                recorded_by: user.id
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
            await loadData() // Refresh
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
                let badgeClass = 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                if (rate >= 90) {
                    badgeClass = 'bg-green-500/15 text-green-600 dark:text-green-400'
                } else if (rate >= 70) {
                    badgeClass = 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                }
                return (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
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
                <span className={`px-2 py-1 rounded-full text-xs ${row.is_active ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-gray-100 text-foreground'}`}>
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
                        onChange={(val) => setExpenseForm({ ...expenseForm, facility_id: String(val) })}
                        options={facilities.map(f => ({ value: f.id, label: f.name }))}
                    />
                    
                    <Select
                        label="Expense Type"
                        value={expenseForm.expense_type}
                        onChange={(val) => setExpenseForm({ ...expenseForm, expense_type: String(val) })}
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
                        <label htmlFor="boarding-expense-amount" className="text-xs font-bold text-foreground/60 px-1">Amount (KES)</label>
                        <Input
                            id="boarding-expense-amount"
                            type="number"
                            value={expenseForm.amount}
                            onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="boarding-expense-description" className="text-xs font-bold text-foreground/60 px-1">Description</label>
                        <Input
                            id="boarding-expense-description"
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
