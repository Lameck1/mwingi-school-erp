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
import { unwrapArrayResult, unwrapIPCResult } from '../../../utils/ipc'

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

type CreateGrantFormData = {
    grant_name: string
    grant_type: string
    fiscal_year: number
    amount_allocated: string
    amount_received: string
    nemis_reference_number: string
}

interface CreateGrantModalProps {
    isOpen: boolean
    onClose: () => void
    formData: CreateGrantFormData
    setFormData: React.Dispatch<React.SetStateAction<CreateGrantFormData>>
    onSubmit: (e: React.SyntheticEvent) => void
}

function CreateGrantModal({ isOpen, onClose, formData, setFormData, onSubmit }: Readonly<CreateGrantModalProps>) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Register New Grant">
            <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <label htmlFor="field-249" className="text-xs font-bold text-foreground/60 px-1">Grant Name</label>
                    <Input id="field-249"
                        value={formData.grant_name}
                        onChange={(e) => setFormData({...formData, grant_name: e.target.value})}
                        required
                    />
                </div>
                <Select
                    label="Grant Type"
                    value={formData.grant_type}
                    onChange={(val) => setFormData({ ...formData, grant_type: String(val) })}
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
                        value={formData.nemis_reference_number}
                        onChange={(e) => setFormData({...formData, nemis_reference_number: e.target.value})}
                    />
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="field-277" className="text-xs font-bold text-foreground/60 px-1">Amount Allocated (KES)</label>
                    <Input id="field-277"
                        type="number"
                        value={formData.amount_allocated}
                        onChange={(e) => setFormData({...formData, amount_allocated: e.target.value})}
                        required
                    />
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="field-286" className="text-xs font-bold text-foreground/60 px-1">Amount Received (KES)</label>
                    <Input id="field-286"
                        type="number"
                        value={formData.amount_received}
                        onChange={(e) => setFormData({...formData, amount_received: e.target.value})}
                        required
                    />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <button type="button" onClick={onClose} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                        Register Grant
                    </button>
                </div>
            </form>
        </Modal>
    )
}

type UtilizationFormData = {
    amount: string
    description: string
    utilizationDate: string
}

interface RecordUtilizationModalProps {
    isOpen: boolean
    onClose: () => void
    grantName: string
    formData: UtilizationFormData
    setFormData: React.Dispatch<React.SetStateAction<UtilizationFormData>>
    onSubmit: (e: React.SyntheticEvent) => void
}

function RecordUtilizationModal({ isOpen, onClose, grantName, formData, setFormData, onSubmit }: Readonly<RecordUtilizationModalProps>) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Record Utilization: ${grantName}`}>
            <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <label htmlFor="field-313" className="text-xs font-bold text-foreground/60 px-1">Amount Used (KES)</label>
                    <Input id="field-313"
                        type="number"
                        value={formData.amount}
                        onChange={(e) => setFormData({...formData, amount: e.target.value})}
                        required
                    />
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="field-322" className="text-xs font-bold text-foreground/60 px-1">Description</label>
                    <Input id="field-322"
                        value={formData.description}
                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                        required
                    />
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="field-330" className="text-xs font-bold text-foreground/60 px-1">Date</label>
                    <Input id="field-330"
                        type="date"
                        value={formData.utilizationDate}
                        onChange={(e) => setFormData({...formData, utilizationDate: e.target.value})}
                        required
                    />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <button type="button" onClick={onClose} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                        Record Usage
                    </button>
                </div>
            </form>
        </Modal>
    )
}

export default function GrantTracking() {
    const { showToast } = useToast()
    const user = useAuthStore((s) => s.user)
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
            const data = await globalThis.electronAPI.operations.getGrantsByStatus(filterStatus)
            setGrants(unwrapArrayResult(data, 'Failed to load grants'))
        } catch (error) {
            console.error(error)
            setGrants([])
            showToast(error instanceof Error ? error.message : 'Failed to load grants', 'error')
        } finally {
            setLoading(false)
        }
    }, [filterStatus, showToast])

    useEffect(() => {
        loadData().catch((err: unknown) => console.error('Failed to load grants data', err))
    }, [loadData])

    const handleCreateGrant = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        if (!user?.id) {
            showToast('You must be signed in to create a grant', 'error')
            return
        }
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.operations.createGrant({
                ...createForm,
                amount_allocated: shillingsToCents(createForm.amount_allocated),
                amount_received: shillingsToCents(createForm.amount_received)
                }, user.id),
                'Failed to create grant'
            )
            showToast('Grant created successfully', 'success')
            setIsCreateModalOpen(false)
            loadData().catch((err: unknown) => console.error('Failed to reload grants', err))
        } catch (error) {
            console.error(error)
            showToast(error instanceof Error ? error.message : 'Failed to create grant', 'error')
        }
    }

    const handleRecordUtilization = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        if (!selectedGrant) {return}
        if (!user?.id) {
            showToast('You must be signed in to record utilization', 'error')
            return
        }
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.operations.recordGrantUtilization({
                grantId: selectedGrant.id,
                amount: shillingsToCents(utilizationForm.amount),
                description: utilizationForm.description,
                glAccountCode: null,
                utilizationDate: utilizationForm.utilizationDate,
                userId: user.id
                }),
                'Failed to record utilization'
            )
            showToast('Utilization recorded successfully', 'success')
            setIsUtilizeModalOpen(false)
            setUtilizationForm({ amount: '', description: '', utilizationDate: new Date().toISOString().slice(0, 10) })
            loadData().catch((err: unknown) => console.error('Failed to reload grants', err))
        } catch (error) {
            console.error(error)
            showToast(error instanceof Error ? error.message : 'Error recording utilization', 'error')
        }
    }

    const handleExportNEMIS = async () => {
        try {
            const csv = await globalThis.electronAPI.operations.generateNEMISExport(new Date().getFullYear())
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

            <CreateGrantModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                formData={createForm}
                setFormData={setCreateForm}
                onSubmit={handleCreateGrant}
            />

            <RecordUtilizationModal
                isOpen={isUtilizeModalOpen}
                onClose={() => setIsUtilizeModalOpen(false)}
                grantName={selectedGrant?.grant_name ?? ''}
                formData={utilizationForm}
                setFormData={setUtilizationForm}
                onSubmit={handleRecordUtilization}
            />
        </div>
    )
}
