import {
    CheckCircle, XCircle, Clock, AlertTriangle,
    FileText, ChevronRight
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { useAuthStore } from '../../stores'
import { formatDate } from '../../utils/format'

interface ApprovalRequest {
    id: number
    workflow_name: string
    entity_type: string
    entity_id: number
    entity_description: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
    requester_name: string
    approver_name: string | null
    created_at: string
    completed_at: string | null
}

interface ApprovalCounts {
    pending: number
    approved: number
    rejected: number
}

const statusConfig = {
    PENDING: { label: 'Pending', variant: 'warning' as const, icon: Clock },
    APPROVED: { label: 'Approved', variant: 'success' as const, icon: CheckCircle },
    REJECTED: { label: 'Rejected', variant: 'error' as const, icon: XCircle },
    CANCELLED: { label: 'Cancelled', variant: 'default' as const, icon: AlertTriangle },
}

export default function Approvals() {
    const { user } = useAuthStore()
    const [requests, setRequests] = useState<ApprovalRequest[]>([])
    const [counts, setCounts] = useState<ApprovalCounts>({ pending: 0, approved: 0, rejected: 0 })
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'pending'>('pending')

    const [showRejectModal, setShowRejectModal] = useState(false)
    const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null)
    const [rejectReason, setRejectReason] = useState('')
    const [processing, setProcessing] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [requestsData, countsData] = await Promise.all([
                filter === 'pending'
                    ? window.electronAPI.getPendingApprovals()
                    : window.electronAPI.getAllApprovals(),
                window.electronAPI.getApprovalCounts()
            ])
            setRequests(requestsData as ApprovalRequest[])
            setCounts(countsData as ApprovalCounts)
        } catch (error) {
            console.error('Failed to load approvals:', error)
        } finally {
            setLoading(false)
        }
    }, [filter])

    useEffect(() => {
        void loadData()
    }, [loadData])

    const handleApprove = async (request: ApprovalRequest) => {
        if (!user) {return}
        setProcessing(true)
        try {
            const result = await window.electronAPI.approveRequest(request.id, user.id)
            if (result.success) {
                void loadData()
            } else {
                alert(result.errors?.join(', ') || 'Failed to approve')
            }
        } catch (error) {
            console.error('Failed to approve:', error)
        } finally {
            setProcessing(false)
        }
    }

    const handleReject = async () => {
        if (!user || !selectedRequest) {return}
        if (!rejectReason.trim()) {
            alert('Please provide a reason for rejection')
            return
        }

        setProcessing(true)
        try {
            const result = await window.electronAPI.rejectRequest(selectedRequest.id, user.id, rejectReason)
            if (result.success) {
                setShowRejectModal(false)
                setRejectReason('')
                setSelectedRequest(null)
                void loadData()
            } else {
                alert(result.errors?.join(', ') || 'Failed to reject')
            }
        } catch (error) {
            console.error('Failed to reject:', error)
        } finally {
            setProcessing(false)
        }
    }

    const openRejectModal = (request: ApprovalRequest) => {
        setSelectedRequest(request)
        setShowRejectModal(true)
    }

    const renderRequests = (): JSX.Element => {
        if (loading) {
            return (
                <>
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 bg-secondary/30 animate-pulse rounded-xl" />
                    ))}
                </>
            )
        }

        if (requests.length === 0) {
            return (
                <div className="text-center py-16 text-foreground/40">
                    No approval requests found
                </div>
            )
        }

        return (
            <>
                {requests.map(request => {
                    const config = statusConfig[request.status]
                    const Icon = config.icon

                    return (
                        <div
                            key={request.id}
                            className="premium-card flex items-center justify-between"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 text-blue-400">
                                    <FileText className="w-5 h-5" />
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-bold text-foreground">{request.entity_description || `${request.entity_type} #${request.entity_id}`}</h3>
                                        <Badge variant={config.variant} icon={Icon}>
                                            {config.label}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-foreground/50">
                                        {request.workflow_name} • Requested by {request.requester_name} • {formatDate(request.created_at)}
                                    </p>
                                    {request.approver_name && (
                                        <p className="text-xs text-foreground/40 mt-1">
                                            {request.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {request.approver_name}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {request.status === 'PENDING' && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => openRejectModal(request)}
                                        disabled={processing}
                                        className="btn btn-secondary text-red-400 hover:bg-red-500/10 flex items-center gap-1"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        Reject
                                    </button>
                                    <button
                                        onClick={() => handleApprove(request)}
                                        disabled={processing}
                                        className="btn btn-primary flex items-center gap-1"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        Approve
                                    </button>
                                </div>
                            )}

                            {request.status !== 'PENDING' && (
                                <ChevronRight className="w-5 h-5 text-foreground/30" />
                            )}
                        </div>
                    )
                })}
            </>
        )
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Approval Requests"
                subtitle="Review and manage pending approvals"
                breadcrumbs={[{ label: 'Finance' }, { label: 'Approvals' }]}
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    label="Pending"
                    value={counts.pending.toString()}
                    icon={Clock}
                    color="from-amber-500/20 to-orange-500/20 text-amber-400"
                />
                <StatCard
                    label="Approved"
                    value={counts.approved.toString()}
                    icon={CheckCircle}
                    color="from-green-500/20 to-emerald-500/20 text-green-400"
                />
                <StatCard
                    label="Rejected"
                    value={counts.rejected.toString()}
                    icon={XCircle}
                    color="from-red-500/20 to-rose-500/20 text-red-400"
                />
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => setFilter('pending')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${filter === 'pending'
                        ? 'bg-primary text-primary-foreground shadow-lg'
                        : 'bg-secondary/30 text-foreground/60 hover:bg-secondary/50 hover:text-foreground'
                        }`}
                >
                    Pending Only
                </button>
                <button
                    onClick={() => setFilter('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${filter === 'all'
                        ? 'bg-primary text-primary-foreground shadow-lg'
                        : 'bg-secondary/30 text-foreground/60 hover:bg-secondary/50 hover:text-foreground'
                        }`}
                >
                    All Requests
                </button>
            </div>

            {/* Requests List */}
            <div className="space-y-4">
                {renderRequests()}
            </div>

            {/* Reject Modal */}
            <Modal
                isOpen={showRejectModal}
                onClose={() => setShowRejectModal(false)}
                title="Reject Request"
            >
                <div className="space-y-4">
                    <p className="text-foreground/70">
                        Please provide a reason for rejecting this request:
                    </p>
                    <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason for rejection..."
                        rows={4}
                        className="w-full bg-secondary/30 border border-border/20 rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none transition-all"
                    />
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setShowRejectModal(false)}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleReject}
                            disabled={processing || !rejectReason.trim()}
                            className="btn bg-red-600 text-white hover:bg-red-700"
                        >
                            {processing ? 'Rejecting...' : 'Reject'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
