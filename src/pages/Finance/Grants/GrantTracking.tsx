import {
    Plus,
    Download
} from 'lucide-react'
import React, { useState, useEffect, useCallback, useMemo } from 'react'

import { PageHeader } from '../../../components/patterns/PageHeader'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { Select } from '../../../components/ui/Select'
import { DataTable } from '../../../components/ui/Table/DataTable'
import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore } from '../../../stores'
import { type Grant } from '../../../types/electron-api'
import { formatCurrencyFromCents, shillingsToCents } from '../../../utils/format'

function renderUtilizationCell(row: Grant) {
    const percentage = row.utilization_percentage || 0;
    return (
        <div className="flex items-center gap-2">
            <ProgressBar value={Math.min(percentage, 100)} fillClass={percentage >= 90 ? 'bg-red-500' : 'bg-green-500'} className="w-24" />
            <span className="text-xs">{percentage.toFixed(1)}%</span>
        </div>
    )
}

function renderActionCell(row: Grant, onUtilize: (grant: Grant) => void) {
    return (
        <button 
            type="button"
            onClick={() => onUtilize(row)}
            className="text-primary hover:underline text-sm"
        >
            Record Usage
        </button>
    )
}

export default function GrantTracking() {
    const { showToast } = useToast()
    const { user } = useAuthStore()
    const [loading, setLoading] = useState(false)
    const [grants, setGrants] = useState<Grant[]>([])
    const [filterStatus, setFilterStatus] = useState<'ACTIVE' | 'EXPIRED' | 'FULLY_UTILIZED'>('ACTIVE')

    // Create Grant State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [createForm, setCreateForm] = useState<{
        grant_name: string;
        grant_type: string;
        fiscal_year: number;
        amount_allocated: string;
        amount_received: string;
        nemis_reference_number: string;
    }>({
        grant_name: '',
        grant_type: 'CAPITATION',
        fiscal_year: new Date().getFullYear(),
        amount_allocated: '',
        amount_received: '',
        nemis_reference_number: ''
    })

    // Utilization State
    const [isUtilizeModalOpen, setIsUtilizeModalOpen] = useState(false)
    const [selectedGrant, setSelectedGrant] = useState<Grant | null>(null)
    const [utilizationForm, setUtilizationForm] = useState<{
        amount: string;
        description: string;
        utilizationDate: string;
    }>({
        amount: '',
        description: '',
        utilizationDate: new Date().toISOString().slice(0, 10)
    })

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const data = await globalThis.electronAPI.getGrantsByStatus(filterStatus)
            setGrants(data)
        } catch (error) {
            console.error(error)
            showToast('Failed to load grants', 'error')
        } finally {
            setLoading(false)
        }
    }, [filterStatus, showToast])

    useEffect(() => {
        loadData().catch((err: unknown) => console.error('Failed to load grants data', err))
    }, [loadData])

    const handleCreateGrant = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user?.id) {
            showToast('You must be signed in to create a grant', 'error')
            return
        }
        try {
            await globalThis.electronAPI.createGrant({
                ...createForm,
                amount_allocated: shillingsToCents(createForm.amount_allocated),
                amount_received: shillingsToCents(createForm.amount_received)
            }, user.id)
            showToast('Grant created successfully', 'success')
            setIsCreateModalOpen(false)
            loadData().catch((err: unknown) => console.error('Failed to reload grants', err))
        } catch (error) {
            console.error(error)
            showToast('Failed to create grant', 'error')
        }
    }

    const handleRecordUtilization = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedGrant) {return}
        if (!user?.id) {
            showToast('You must be signed in to record utilization', 'error')
            return
        }
        try {
            const result = await globalThis.electronAPI.recordGrantUtilization({
                grantId: selectedGrant.id,
                amount: shillingsToCents(utilizationForm.amount),
                description: utilizationForm.description,
                glAccountCode: null,
                utilizationDate: utilizationForm.utilizationDate,
                userId: user.id
            })
            
            if (result.success) {
                showToast('Utilization recorded successfully', 'success')
                setIsUtilizeModalOpen(false)
                setUtilizationForm({ amount: '', description: '', utilizationDate: new Date().toISOString().slice(0, 10) })
                loadData().catch((err: unknown) => console.error('Failed to reload grants', err))
            } else {
                showToast(result.error || 'Failed to record utilization', 'error')
            }
        } catch (error) {
            console.error(error)
            showToast('Error recording utilization', 'error')
        }
    }

    const handleExportNEMIS = async () => {
        try {
            const csv = await globalThis.electronAPI.generateNEMISExport(new Date().getFullYear())
            const blob = new Blob([csv], { type: 'text/csv' })
            const url = globalThis.URL.createObjectURL(blob)
            const a = globalThis.document.createElement('a')
            a.href = url
            a.download = `nemis_export_${new Date().getFullYear()}.csv`
            a.click()
            showToast('Export generated successfully', 'success')
        } catch (error) {
            console.error(error)
            showToast('Failed to generate export', 'error')
        }
    }

    const openUtilizeModal = useCallback((grant: Grant) => {
        setSelectedGrant(grant)
        setIsUtilizeModalOpen(true)
    }, [])

    const columns = useMemo(() => [
        { key: 'grant_name', header: 'Grant Name', accessorKey: 'grant_name' },
        { key: 'grant_type', header: 'Type', accessorKey: 'grant_type' },
        { key: 'nemis_reference_number', header: 'NEMIS Ref', accessorKey: 'nemis_reference_number' },
        { 
            key: 'amount_allocated',
            header: 'Allocated', 
            accessorKey: 'amount_allocated',
            cell: (row: Grant) => formatCurrencyFromCents(row.amount_allocated)
        },
        { 
            key: 'utilization_percentage',
            header: 'Utilization %', 
            accessorKey: 'utilization_percentage',
            cell: renderUtilizationCell
        },
        {
            key: 'actions',
            header: 'Actions',
            accessorKey: 'id',
            cell: (row: Grant) => renderActionCell(row, openUtilizeModal)
        }
    ], [openUtilizeModal])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Grant Tracking & NEMIS"
                subtitle="Track government capitation and grant utilization"
                breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Grants' }]}
                actions={
                    <div className="flex gap-2">
                        <button 
                            type="button"
                            onClick={handleExportNEMIS}
                            className="btn btn-secondary flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" /> NEMIS Export
                        </button>
                        <button 
                            type="button"
                            onClick={() => setIsCreateModalOpen(true)}
                            className="btn btn-primary flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Add Grant
                        </button>
                    </div>
                }
            />

            {/* Filters */}
            <div className="flex gap-2 mb-4">
                {(['ACTIVE', 'FULLY_UTILIZED', 'EXPIRED'] as const).map(status => (
                    <button
                        key={status}
                        type="button"
                        onClick={() => setFilterStatus(status)}
                        className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                            filterStatus === status 
                                ? 'bg-primary text-primary-foreground' 
                                : 'bg-secondary text-foreground/70 hover:text-foreground'
                        }`}
                    >
                        {status.replace('_', ' ')}
                    </button>
                ))}
            </div>

            {/* Grants Table */}
            <div className="premium-card">
                <DataTable
                    data={grants}
                    columns={columns}
                    loading={loading}
                />
            </div>

            {/* Create Grant Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Register New Grant"
            >
                <form onSubmit={handleCreateGrant} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="field-249" className="text-xs font-bold text-foreground/60 px-1">Grant Name</label>
                        <Input id="field-249"
                            value={createForm.grant_name}
                            onChange={(e) => setCreateForm({...createForm, grant_name: e.target.value})}
                            required
                        />
                    </div>
                    <Select
                        label="Grant Type"
                        value={createForm.grant_type}
                        onChange={(val) => setCreateForm({ ...createForm, grant_type: String(val) })}
                        options={[
                            { value: 'CAPITATION', label: 'Capitation' },
                            { value: 'FREE_DAY_SECONDARY', label: 'Free Day Secondary' },
                            { value: 'SPECIAL_NEEDS', label: 'Special Needs' },
                            { value: 'INFRASTRUCTURE', label: 'Infrastructure' },
                            { value: 'FEEDING_PROGRAM', label: 'Feeding Program' },
                            { value: 'OTHER', label: 'Other' }
                        ]}
                    />
                    <div className="space-y-1.5">
                        <label htmlFor="field-270" className="text-xs font-bold text-foreground/60 px-1">NEMIS Reference Number</label>
                        <Input id="field-270"
                            value={createForm.nemis_reference_number}
                            onChange={(e) => setCreateForm({...createForm, nemis_reference_number: e.target.value})}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="field-277" className="text-xs font-bold text-foreground/60 px-1">Amount Allocated (KES)</label>
                        <Input id="field-277"
                            type="number"
                            value={createForm.amount_allocated}
                            onChange={(e) => setCreateForm({...createForm, amount_allocated: e.target.value})}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="field-286" className="text-xs font-bold text-foreground/60 px-1">Amount Received (KES)</label>
                        <Input id="field-286"
                            type="number"
                            value={createForm.amount_received}
                            onChange={(e) => setCreateForm({...createForm, amount_received: e.target.value})}
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Register Grant
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Record Utilization Modal */}
            <Modal
                isOpen={isUtilizeModalOpen}
                onClose={() => setIsUtilizeModalOpen(false)}
                title={`Record Utilization: ${selectedGrant?.grant_name}`}
            >
                <form onSubmit={handleRecordUtilization} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="field-313" className="text-xs font-bold text-foreground/60 px-1">Amount Used (KES)</label>
                        <Input id="field-313"
                            type="number"
                            value={utilizationForm.amount}
                            onChange={(e) => setUtilizationForm({...utilizationForm, amount: e.target.value})}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="field-322" className="text-xs font-bold text-foreground/60 px-1">Description</label>
                        <Input id="field-322"
                            value={utilizationForm.description}
                            onChange={(e) => setUtilizationForm({...utilizationForm, description: e.target.value})}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="field-330" className="text-xs font-bold text-foreground/60 px-1">Date</label>
                        <Input id="field-330"
                            type="date"
                            value={utilizationForm.utilizationDate}
                            onChange={(e) => setUtilizationForm({...utilizationForm, utilizationDate: e.target.value})}
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => setIsUtilizeModalOpen(false)} className="btn btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Record Usage
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}
