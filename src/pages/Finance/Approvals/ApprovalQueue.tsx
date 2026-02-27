import { format } from 'date-fns';
import { useState, useEffect, useCallback } from 'react';

import { PageHeader } from '../../../components/patterns/PageHeader'
import { useToast } from '../../../contexts/ToastContext';
import { useAuthStore } from '../../../stores';
import { formatCurrencyFromCents } from '../../../utils/format';
import { getIPCFailureMessage, isIPCFailure } from '../../../utils/ipc'


interface ApprovalRequest {
  id: number;
  journal_entry_id: number;
  entry_ref: string;
  entry_type: string;
  description: string;
  amount: number;
  student_name?: string;
  requested_by_name: string;
  requested_at: string;
  rule_name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

const getStatusBadge = (status: string) => {
  const colors = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-500'
  };
  return colors[status as keyof typeof colors] || colors.PENDING;
};

const isSuccessResult = (value: unknown): value is { success: true; data?: unknown } => (
  typeof value === 'object' &&
  value !== null &&
  'success' in value &&
  (value as { success?: unknown }).success === true
)

const getResultMessage = (value: unknown, fallback: string): string => {
  if (isIPCFailure(value)) {
    return getIPCFailureMessage(value, fallback)
  }
  if (value && typeof value === 'object') {
    const maybe = value as { error?: unknown; message?: unknown }
    if (typeof maybe.error === 'string' && maybe.error.trim()) {
      return maybe.error
    }
    if (typeof maybe.message === 'string' && maybe.message.trim()) {
      return maybe.message
    }
  }
  return fallback
}

export default function ApprovalQueuePage() {
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [loading, setLoading] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string>('');

  const formatRequestedAt = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown time';
    }
    return format(date, 'MMM dd, HH:mm');
  };

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedApproval(null);
    setReviewNotes('');

    try {
      const result = await globalThis.electronAPI.getApprovalQueue(filter);

      if (!isSuccessResult(result)) {
        throw new Error(getResultMessage(result, 'Failed to load approvals'))
      }

      if (!Array.isArray(result.data)) {
        throw new Error('Invalid approval queue payload');
      }

      setApprovals(result.data as ApprovalRequest[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load approvals';
      setApprovals([]);
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, showToast]);

  useEffect(() => {
    loadApprovals().catch((err: unknown) => console.error('Failed to load approvals:', err));
  }, [loadApprovals]);

  const handleApprove = async (approvalId: number) => {
    if (!user?.id) {
      setError('You must be signed in to approve transactions');
      showToast('You must be signed in to approve transactions', 'error');
      return;
    }
    if (processing) {
      return;
    }
    setProcessing(true);
    try {
      const result = await globalThis.electronAPI.approveTransaction(
        approvalId,
        reviewNotes.trim() || 'Approved',
        user.id
      );

      if (isSuccessResult(result)) {
        await loadApprovals();
        showToast('Transaction approved', 'success');
        setSelectedApproval(null);
        setReviewNotes('');
      } else {
        const message = getResultMessage(result, 'Approval failed')
        setError(message);
        showToast(message, 'error');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Approval failed';
      setError(message);
      showToast(message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (approvalId: number) => {
    if (!reviewNotes.trim()) {
      setError('Please provide a reason for rejection');
      showToast('Please provide a reason for rejection', 'warning');
      return;
    }
    if (!user?.id) {
      setError('You must be signed in to reject transactions');
      showToast('You must be signed in to reject transactions', 'error');
      return;
    }
    if (processing) {
      return;
    }

    setProcessing(true);
    try {
      const result = await globalThis.electronAPI.rejectTransaction(
        approvalId,
        reviewNotes.trim(),
        user.id
      );

      if (isSuccessResult(result)) {
        await loadApprovals();
        showToast('Transaction rejected', 'success');
        setSelectedApproval(null);
        setReviewNotes('');
      } else {
        const message = getResultMessage(result, 'Rejection failed')
        setError(message);
        showToast(message, 'error');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rejection failed';
      setError(message);
      showToast(message, 'error');
    } finally {
      setProcessing(false);
    }
  };
  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading approvals...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10 h-full flex flex-col">
      <div className="flex justify-between items-start">
        <PageHeader
          title="Approval Queue"
          subtitle="Review and approve pending transactions"
          breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Approval Queue' }]}
        />
      </div>

      <div className="bg-card rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-4">
          <label htmlFor="field-137" className="text-sm font-medium text-foreground/70">Filter:</label>
          <select id="field-137"
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'PENDING' | 'ALL')}
            className="px-3 py-2 border border-border rounded-md bg-input text-foreground"
            aria-label="Filter approval requests"
          >
            <option value="PENDING">Pending Only</option>
            <option value="ALL">All Requests</option>
          </select>
          <button
            onClick={loadApprovals}
            className="btn btn-secondary"
          >
            Refresh
          </button>
          {approvals.some(a => a.status === 'PENDING') && (
            <span className="ml-auto bg-amber-500/15 text-amber-500 px-3 py-1 rounded-full text-sm font-medium">
              {approvals.filter(a => a.status === 'PENDING').length} Pending
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {approvals.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-foreground/50">No approval requests found</div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table w-full">
            <thead>
              <tr className="border-b border-border/20">
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground/80 uppercase tracking-wider">Entry Ref</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground/80 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground/80 uppercase tracking-wider">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground/80 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground/80 uppercase tracking-wider">Rule</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground/80 uppercase tracking-wider">Requested By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground/80 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground/80 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {approvals.map((approval) => (
                <tr key={approval.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-4 text-sm font-medium text-foreground">{approval.entry_ref}</td>
                  <td className="px-4 py-4 text-sm text-foreground/80">{approval.entry_type}</td>
                  <td className="px-4 py-4 text-sm text-foreground max-w-xs truncate">
                    {approval.description}
                    {approval.student_name && (
                      <div className="text-xs text-foreground/50">{approval.student_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm font-semibold text-foreground">{formatCurrencyFromCents(approval.amount)}</td>
                  <td className="px-4 py-4 text-sm text-foreground/80">{approval.rule_name}</td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {approval.requested_by_name}
                    <div className="text-xs text-foreground/50">
                      {formatRequestedAt(approval.requested_at)}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(approval.status)}`}>
                      {approval.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    {approval.status === 'PENDING' && (
                      <button
                        onClick={() => setSelectedApproval(approval)}
                        disabled={processing}
                        className="btn btn-secondary py-1 px-3 text-xs"
                      >
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl border border-border/40 max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-bold mb-4 text-foreground">Review Approval Request</h2>

            <div className="space-y-3 mb-6">
              <div className="text-foreground/80">
                <span className="font-medium text-foreground">Entry Reference:</span> {selectedApproval.entry_ref}
              </div>
              <div className="text-foreground/80">
                <span className="font-medium text-foreground">Type:</span> {selectedApproval.entry_type}
              </div>
              <div className="text-foreground/80">
                <span className="font-medium text-foreground">Description:</span> {selectedApproval.description}
              </div>
              <div className="text-foreground/80">
                <span className="font-medium text-foreground">Amount:</span> {formatCurrencyFromCents(selectedApproval.amount)}
              </div>
              {selectedApproval.student_name && (
                <div className="text-foreground/80">
                  <span className="font-medium text-foreground">Student:</span> {selectedApproval.student_name}
                </div>
              )}
              <div className="text-foreground/80">
                <span className="font-medium text-foreground">Requested By:</span> {selectedApproval.requested_by_name}
              </div>
              <div className="text-foreground/80">
                <span className="font-medium text-foreground">Reason for Approval:</span> {selectedApproval.rule_name}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground/70 mb-2">
                Review Notes {selectedApproval.status === 'PENDING' && '(Required for rejection)'}
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                className="input w-full"
                placeholder="Enter your review notes..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleApprove(selectedApproval.id)}
                disabled={processing}
                className="flex-1 btn bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20"
              >
                {processing ? 'Processing...' : 'Approve'}
              </button>
              <button
                onClick={() => handleReject(selectedApproval.id)}
                disabled={processing}
                className="flex-1 btn bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
              >
                {processing ? 'Processing...' : 'Reject'}
              </button>
              <button
                onClick={() => {
                  setSelectedApproval(null);
                  setReviewNotes('');
                }}
                className="flex-1 btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
