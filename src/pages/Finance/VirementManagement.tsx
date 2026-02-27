import { ArrowRightLeft, CheckCircle2, FileText, Loader2, ShieldAlert, XCircle } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'


import { PageHeader } from '../../components/patterns/PageHeader'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../contexts/ToastContext'
import { useVirement } from '../../hooks/useVirement'
import type { AccountSummary, JssAccountType, VirementRequest } from '../../hooks/useVirement'
import { useAuthStore } from '../../stores'
import { formatCurrencyFromCents } from '../../utils/format'

const ACCOUNT_TYPES: JssAccountType[] = ['TUITION', 'OPERATIONS', 'INFRASTRUCTURE']
const ACCOUNT_COLORS: Record<JssAccountType, string> = {
    TUITION: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    OPERATIONS: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    INFRASTRUCTURE: 'text-amber-500 bg-amber-500/10 border-amber-500/20'
}

export default function VirementManagement() {
    const { getAccountSummaries, getPendingRequests, requestVirement, reviewVirement, isLoading } = useVirement()
    const { user } = useAuthStore()
    const { showToast } = useToast()

    const [summaries, setSummaries] = useState<AccountSummary[]>([])
    const [requests, setRequests] = useState<VirementRequest[]>([])
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [selectedRequest, setSelectedRequest] = useState<VirementRequest | null>(null)
    const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED' | null>(null)

    // Form State
    const [fromAccount, setFromAccount] = useState<JssAccountType>('TUITION')
    const [toAccount, setToAccount] = useState<JssAccountType>('OPERATIONS')
    const [amount, setAmount] = useState<string>('')
    const [reason, setReason] = useState<string>('')
    const [reviewNotes, setReviewNotes] = useState<string>('')

    const isPrincipalOrAdmin = user?.role === 'ADMIN' || user?.role === 'PRINCIPAL'

    const loadData = useCallback(async () => {
        const [sumData, reqData] = await Promise.all([
            getAccountSummaries(),
            getPendingRequests()
        ])
        if (sumData) {
            setSummaries(sumData)
        }
        if (reqData) {
            setRequests(reqData)
        }
    }, [getAccountSummaries, getPendingRequests])

    useEffect(() => {
        void loadData()
    }, [loadData])

    const handleCreateRequest = async (e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault()
        const amountCents = Math.round(parseFloat(amount) * 100)

        if (fromAccount === toAccount) {
            showToast('Source and destination accounts must differ', 'error')
            return
        }
        if (amountCents <= 0) {
            showToast('Amount must be positive', 'error')
            return
        }

        const sourceSummary = summaries.find(s => s.account_type === fromAccount)
        if (!sourceSummary || sourceSummary.balance < amountCents) {
            showToast(`Insufficient balance in ${fromAccount} account`, 'error')
            return
        }

        const successId = await requestVirement(fromAccount, toAccount, amountCents, reason)
        if (successId) {
            showToast('Virement request submitted for Principal approval', 'success')
            setIsCreateModalOpen(false)
            setAmount('')
            setReason('')
            void loadData()
        }
    }

    const handleReviewRequest = async () => {
        if (!selectedRequest || !reviewAction) {
            return
        }

        const success = await reviewVirement(selectedRequest.id, reviewAction, reviewNotes)
        if (success) {
            showToast(`Virement request ${reviewAction.toLowerCase()} successfully`, 'success')
            setSelectedRequest(null)
            setReviewAction(null)
            setReviewNotes('')
            void loadData()
        }
    }

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                    <PageHeader
                        title="JSS Account Virement"
                        subtitle="Manage cross-account transfers and compliance rules"
                        breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'JSS Virement Rules' }]}
                    />
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="btn btn-primary flex items-center gap-2 shadow-lg shadow-primary/20"
                >
                    <ArrowRightLeft className="w-4 h-4" /> Request Virement
                </button>
            </div>

            {/* Account Summaries Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {ACCOUNT_TYPES.map(type => {
                    const summary = summaries.find(s => s.account_type === type)
                    const style = ACCOUNT_COLORS[type]
                    return (
                        <div key={type} className="premium-card p-6 border-t-4 border-t-foreground/10 group cursor-default">
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-xl border ${style}`}>
                                    <ShieldAlert className="w-5 h-5 opacity-80" />
                                </div>
                                <span className={`text-[10px] font-bold tracking-wider px-2 py-1 rounded uppercase ${style}`}>
                                    {type} ACCOUNT
                                </span>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground/50">Current Balance</p>
                                <p className="text-3xl font-bold tracking-tight text-foreground">
                                    {summary ? formatCurrencyFromCents(summary.balance) : 'KES 0'}
                                </p>
                            </div>
                            <div className="mt-6 space-y-2 pt-4 border-t border-border/40">
                                <div className="flex justify-between text-sm">
                                    <span className="text-foreground/50">Total Invoiced</span>
                                    <span className="font-semibold">{summary ? formatCurrencyFromCents(summary.total_invoiced) : '0'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-foreground/50">Total Collected</span>
                                    <span className="font-semibold text-emerald-500">{summary ? formatCurrencyFromCents(summary.total_collected) : '0'}</span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Pending Requests */}
            <div className="card">
                <div className="p-5 border-b border-border/40 bg-secondary/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-bold">Pending Virement Requests</h2>
                    </div>
                </div>
                <div className="p-0 overflow-x-auto">
                    <table className="premium-table w-full text-left">
                        <thead>
                            <tr>
                                <th className="px-4 py-3 font-semibold text-foreground/70">Date Issued</th>
                                <th className="px-4 py-3 font-semibold text-foreground/70">Transfer Route</th>
                                <th className="px-4 py-3 font-semibold text-foreground/70">Amount</th>
                                <th className="px-4 py-3 font-semibold text-foreground/70">Reason for Transfer</th>
                                {isPrincipalOrAdmin && <th className="px-4 py-3 font-semibold text-foreground/70 text-right">Action</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {isLoading && requests.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
                            )}
                            {!isLoading && requests.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-12 text-foreground/50 bg-secondary/5">
                                        No pending virement requests found.
                                    </td>
                                </tr>
                            )}
                            {!isLoading && requests.length > 0 && requests.map(req => (
                                <tr key={req.id}>
                                    <td>
                                        <div className="font-medium">{new Date(req.created_at).toLocaleDateString()}</div>
                                        <div className="text-xs text-foreground/50">ID: VIR-{req.id.toString().padStart(4, '0')}</div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ACCOUNT_COLORS[req.from_account_type]}`}>
                                                {req.from_account_type}
                                            </span>
                                            <ArrowRightLeft className="w-3.5 h-3.5 text-foreground/40" />
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ACCOUNT_COLORS[req.to_account_type]}`}>
                                                {req.to_account_type}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="font-bold">{formatCurrencyFromCents(req.amount)}</td>
                                    <td className="text-sm max-w-md truncate" title={req.reason}>{req.reason}</td>
                                    {isPrincipalOrAdmin && (
                                        <td className="text-right">
                                            <button
                                                onClick={() => { setSelectedRequest(req); setReviewAction('APPROVED'); setReviewNotes('') }}
                                                className="btn btn-primary px-3 py-1.5 text-xs mr-2"
                                            >
                                                Review
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Request Modal */}
            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="New JSS Virement Request" size="md">
                <form onSubmit={handleCreateRequest} className="space-y-5">
                    <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-sm text-foreground/80 leading-relaxed font-medium flex items-start gap-3">
                        <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <p>Cross-account virements MUST be authorized by the Principal. Funds transferred between JSS structural accounts must be formally justified to maintain MoE compliance.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="label" htmlFor="from-account">From Account (Source)</label>
                            <select id="from-account" value={fromAccount} onChange={e => setFromAccount(e.target.value as JssAccountType)} className="input border-red-500/30 focus:border-red-500">
                                {ACCOUNT_TYPES.map(type => <option key={type} value={type}>{type} FUND</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="label" htmlFor="to-account">To Account (Destination)</label>
                            <select id="to-account" value={toAccount} onChange={e => setToAccount(e.target.value as JssAccountType)} className="input border-emerald-500/30 focus:border-emerald-500">
                                {ACCOUNT_TYPES.map(type => <option key={type} value={type}>{type} FUND</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="label">Amount (KES)</label>
                        <input
                            type="number"
                            required
                            min="1"
                            step="0.01"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="input text-lg font-bold"
                            placeholder="0.00"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="label">Justification</label>
                        <textarea
                            required
                            rows={3}
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            className="input resize-none"
                            placeholder="Provide formal compliance justification for this cross-account virement..."
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn btn-secondary">Cancel</button>
                        <button type="submit" disabled={isLoading} className="btn btn-primary flex items-center gap-2">
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                            Submit for Approval
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Review Modal */}
            <Modal isOpen={!!selectedRequest} onClose={() => { setSelectedRequest(null); setReviewAction(null) }} title="Review Virement Request">
                {selectedRequest && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/10 rounded-xl border border-border/40">
                            <div>
                                <p className="text-xs font-bold text-foreground/50 uppercase">Transfer Route</p>
                                <p className="font-semibold text-sm mt-1">{selectedRequest.from_account_type} → {selectedRequest.to_account_type}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-foreground/50 uppercase">Amount Requested</p>
                                <p className="font-bold text-lg text-primary">{formatCurrencyFromCents(selectedRequest.amount)}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs font-bold text-foreground/50 uppercase">Justification</p>
                                <p className="text-sm mt-1 p-3 bg-background rounded-lg border border-border/30">{selectedRequest.reason}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setReviewAction('APPROVED')}
                                    className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-colors ${reviewAction === 'APPROVED' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-border/40 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-foreground/60'}`}
                                >
                                    <CheckCircle2 className="w-8 h-8 mb-2" />
                                    <span className="font-bold">Approve Request</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setReviewAction('REJECTED')}
                                    className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-colors ${reviewAction === 'REJECTED' ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border/40 hover:border-destructive/50 hover:bg-destructive/5 text-foreground/60'}`}
                                >
                                    <XCircle className="w-8 h-8 mb-2" />
                                    <span className="font-bold">Reject Request</span>
                                </button>
                            </div>

                            <div className="space-y-2">
                                <label className="label">Principal Review Notes</label>
                                <textarea
                                    rows={3}
                                    value={reviewNotes}
                                    onChange={e => setReviewNotes(e.target.value)}
                                    className="input resize-none"
                                    placeholder="Add approval comments or rejection reasons..."
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
                            <button type="button" onClick={() => { setSelectedRequest(null); setReviewAction(null) }} className="btn btn-secondary">Cancel</button>
                            {(() => {
                                const disabled = isLoading || !reviewAction
                                let cls = 'btn flex items-center gap-2 '
                                let icon = <CheckCircle2 className="w-4 h-4" />
                                let label = 'Confirm'
                                if (reviewAction === 'APPROVED') {
                                    cls += 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                    label = 'Confirm Approval'
                                } else if (reviewAction === 'REJECTED') {
                                    cls += 'bg-destructive hover:bg-destructive/90 text-white'
                                    icon = <XCircle className="w-4 h-4" />
                                    label = 'Confirm Rejection'
                                } else {
                                    cls += 'btn-primary opacity-50'
                                }
                                return (
                                    <button type="button" onClick={handleReviewRequest} disabled={disabled} className={cls}>
                                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
                                        {label}
                                    </button>
                                )
                            })()}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    )
}
