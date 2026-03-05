import {
    CheckCircle, XCircle, Clock, AlertTriangle,
    FileText, ChevronRight
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../stores'
import { formatDate } from '../../utils/format'
import { unwrapArrayResult, unwrapIPCResult } from '../../utils/ipc'

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

function isApprovalCounts(value: unknown): value is ApprovalCounts {
    if (typeof value !== 'object' || value === null) {
        return false
    }

    const candidate = value as Partial<ApprovalCounts>
    return (
        typeof candidate.pending === 'number' &&
        typeof candidate.approved === 'number' &&
        typeof candidate.rejected === 'number'
    )
}

const statusConfig = {
    PENDING: { label: 'Pending', variant: 'warning' as const, icon: Clock },
    APPROVED: { label: 'Approved', variant: 'success' as const, icon: CheckCircle },
    REJECTED: { label: 'Rejected', variant: 'error' as const, icon: XCircle },
    CANCELLED: { label: 'Cancelled', variant: 'default' as const, icon: AlertTriangle },
}

function getApprovalActionErrorMessage(
    result: { success: boolean; errors?: string[] } & Record<string, unknown>,
    fallback: string
): string {
    if (Array.isArray(result.errors) && result.errors.length > 0) {
        return result.errors.join(', ')
    }
    const possibleError = result['error']
    if (typeof possibleError === 'string' && possibleError.trim().length > 0) {
        return possibleError
    }
    return fallback
}

interface ApprovalRequestListProps {
    loading: boolean
    requests: ApprovalRequest[]
    processing: boolean
    onApprove: (request: ApprovalRequest) => void
    onOpenReject: (request: ApprovalRequest) => void
}

function ApprovalRequestList({ loading, requests, processing, onApprove, onOpenReject }: Readonly<ApprovalRequestListProps>) {
    if (loading) {
        return (
            <>
                {[1, 2, 3].map((value) => (
                    <div key={value} className="h-24 bg-secondary/30 animate-pulse rounded-xl" />
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
                                    onClick={() => onOpenReject(request)}
                                    disabled={processing}
                                    className="btn btn-secondary text-red-400 hover:bg-red-500/10 flex items-center gap-1"
                                >
                                    <XCircle className="w-4 h-4" />
                                    Reject
                                </button>
                                <button
                                    onClick={() => onApprove(request)}
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

export default function Approvals() {
    const user = useAuthStore((s) => s.user)
    const { showToast } = useToast()
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
                    ? globalThis.electronAPI.system.getPendingApprovals()
                    : globalThis.electronAPI.system.getAllApprovals(),
                globalThis.electronAPI.system.getApprovalCounts()
            ])

            const safeRequests = unwrapArrayResult(requestsData, 'Invalid approval request payload')
            const safeCounts = unwrapIPCResult<ApprovalCounts>(countsData, 'Failed to load approval counts')
            if (!isApprovalCounts(safeCounts)) {
                throw new Error('Invalid approval counts payload')
            }

            setRequests(safeRequests)
            setCounts(safeCounts)
        } catch (error) {
            console.error('Failed to load approvals:', error)
            setRequests([])
            setCounts({ pending: 0, approved: 0, rejected: 0 })
            showToast(error instanceof Error ? error.message : 'Failed to load approvals', 'error')
        } finally {
            setLoading(false)
        }
    }, [filter, showToast])

    useEffect(() => {
        loadData().catch((err: unknown) => console.error('Failed to load data:', err))
    }, [loadData])

    const handleApprove = async (request: ApprovalRequest) => {
        if (!user?.id) {
            showToast('You must be signed in to approve requests', 'error')
            return
        }
        setProcessing(true)
        try {
            const result = await globalThis.electronAPI.system.approveRequest(request.id, user.id)
            if (result.success) {
                showToast('Request approved', 'success')
                await loadData()
            } else {
                const message = getApprovalActionErrorMessage(result, 'Failed to approve')
                showToast(message, 'error')
            }
        } catch (error) {
            console.error('Failed to approve:', error)
            showToast(error instanceof Error ? error.message : 'Failed to approve', 'error')
        } finally {
            setProcessing(false)
        }
    }

    const handleReject = async () => {
        if (!user?.id || !selectedRequest) {
            showToast('You must select a request and be signed in to reject', 'error')
            return
        }
        if (!rejectReason.trim()) {
            showToast('Please provide a reason for rejection', 'warning')
            return
        }

        setProcessing(true)
        try {
            const result = await globalThis.electronAPI.system.rejectRequest(selectedRequest.id, user.id, rejectReason)
            if (result.success) {
                setShowRejectModal(false)
                setRejectReason('')
                setSelectedRequest(null)
                showToast('Request rejected', 'success')
                await loadData()
            } else {
                const message = getApprovalActionErrorMessage(result, 'Failed to reject')
                showToast(message, 'error')
            }
        } catch (error) {
            console.error('Failed to reject:', error)
            showToast(error instanceof Error ? error.message : 'Failed to reject', 'error')
        } finally {
            setProcessing(false)
        }
    }

    const openRejectModal = (request: ApprovalRequest) => {
        setSelectedRequest(request)
        setRejectReason('')
        setShowRejectModal(true)
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Approval Requests"
                subtitle="Review and manage pending approvals"
                breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Approvals' }]}
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
                <ApprovalRequestList
                    loading={loading}
                    requests={requests}
                    processing={processing}
                    onApprove={handleApprove}
                    onOpenReject={openRejectModal}
                />
            </div>

            {/* Reject Modal */}
            <Modal
                isOpen={showRejectModal}
                onClose={() => {
                    setShowRejectModal(false)
                    setRejectReason('')
                    setSelectedRequest(null)
                }}
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
                            onClick={() => {
                                setShowRejectModal(false)
                                setRejectReason('')
                                setSelectedRequest(null)
                            }}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleReject}
                            disabled={processing || !rejectReason.trim()}
                            className="btn bg-red-600 text-white hover:bg-destructive/80"
                        >
                            {processing ? 'Rejecting...' : 'Reject'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
