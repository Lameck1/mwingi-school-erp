import { Trash2 } from 'lucide-react'

import { Select } from '../../../components/ui/Select'

import type { StudentAward, AwardCategory } from './AwardsManagement.types'
import { getStatusBadge } from './getStatusBadge'

interface AwardsListSectionProps {
    filteredAwards: StudentAward[]
    categoryMap: Map<number, AwardCategory>
    filterStatus: string
    setFilterStatus: (val: string) => void
    filterCategory: number
    setFilterCategory: (val: number) => void
    categories: AwardCategory[]
    canApprove: boolean
    loading: boolean
    handleApproveAward: (awardId: number) => Promise<void>
    openRejectModal: (awardId: number) => void
    handleDeleteAward: (awardId: number) => Promise<void>
}

export function AwardsListSection({ filteredAwards, categoryMap, filterStatus, setFilterStatus, filterCategory, setFilterCategory, categories, canApprove, loading, handleApproveAward, openRejectModal, handleDeleteAward }: Readonly<AwardsListSectionProps>) {
    return (
        <div className="premium-card">
            <div className="flex gap-4 mb-6">
                <Select
                    label="Status"
                    value={filterStatus}
                    onChange={(val) => setFilterStatus(val as string)}
                    options={[
                        { value: 'all', label: 'All Status' },
                        { value: 'pending', label: 'Pending Approval' },
                        { value: 'approved', label: 'Approved' },
                        { value: 'rejected', label: 'Rejected' }
                    ]}
                />
                <Select
                    label="Category"
                    value={filterCategory}
                    onChange={(val) => setFilterCategory(Number(val))}
                    options={[
                        { value: 0, label: 'All Categories' },
                        ...categories.map(c => ({ value: c.id, label: c.name }))
                    ]}
                />
            </div>

            <div className="space-y-4">
                {filteredAwards.length === 0 ? (
                    <div className="text-center py-12 text-foreground/40">
                        <p>No awards found</p>
                    </div>
                ) : (
                    filteredAwards.map(award => (
                        <div
                            key={award.id}
                            className={`flex items-center justify-between p-4 rounded-lg border transition ${award.approval_status === 'rejected'
                                ? 'bg-red-500/5 border-red-500/20'
                                : 'bg-secondary/50 border-border hover:bg-secondary'
                                }`}
                        >
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h4 className="font-semibold">
                                        {award.student_name || `${award.first_name} ${award.last_name}`}
                                    </h4>
                                    <span className="text-xs px-2 py-1 rounded bg-secondary text-foreground/60">
                                        {award.admission_number}
                                    </span>
                                </div>
                                <p className="text-sm text-foreground/60 mb-2">
                                    {categoryMap.get(award.award_category_id)?.name || award.category_name}
                                </p>
                                <div className="flex flex-wrap gap-4 text-xs text-foreground/50">
                                    <span>Awarded: {award.awarded_date ? new Date(award.awarded_date).toLocaleDateString() : 'N/A'}</span>
                                    {award.assigned_by_name && <span>Assigned by: {award.assigned_by_name}</span>}
                                    {award.approved_by_name && award.approval_status === 'approved' && (
                                        <span className="text-green-400">Approved by: {award.approved_by_name}</span>
                                    )}
                                    {award.approved_by_name && award.approval_status === 'rejected' && (
                                        <span className="text-red-400">Rejected by: {award.approved_by_name}</span>
                                    )}
                                </div>
                                {award.rejection_reason && (
                                    <p className="text-xs text-red-400 mt-2">Reason: {award.rejection_reason}</p>
                                )}
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    {getStatusBadge(award.approval_status)}
                                </div>

                                <div className="flex gap-2">
                                    {award.approval_status === 'pending' && canApprove && (
                                        <>
                                            <button
                                                onClick={() => handleApproveAward(award.id)}
                                                disabled={loading}
                                                className="btn btn-sm btn-primary"
                                            >
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => openRejectModal(award.id)}
                                                disabled={loading}
                                                className="btn btn-sm bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                            >
                                                Reject
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={() => handleDeleteAward(award.id)}
                                        disabled={loading}
                                        className="btn btn-sm btn-secondary"
                                        title="Delete award"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
