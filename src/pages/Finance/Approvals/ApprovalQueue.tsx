import { format } from 'date-fns';
import { useState, useEffect, useCallback } from 'react';

import { HubBreadcrumb } from '../../../components/patterns/HubBreadcrumb'
import { useAuthStore } from '../../../stores';
import { formatCurrencyFromCents } from '../../../utils/format';


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

export default function ApprovalQueuePage() {
  const { user } = useAuthStore();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string>('');

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await globalThis.electronAPI.getApprovalQueue(filter);

      if (result.success) {
        setApprovals(result.data);
      } else {
        setError(result.error || result.message || 'Failed to load approvals');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadApprovals().catch((err: unknown) => console.error('Failed to load approvals:', err));
  }, [loadApprovals]);

  const handleApprove = async (approvalId: number) => {
    if (!user?.id) {
      setError('You must be signed in to approve transactions');
      return;
    }
    try {
      const result = await globalThis.electronAPI.approveTransaction(
        approvalId,
        reviewNotes || 'Approved',
        user.id
      );

      if (result.success) {
        loadApprovals().catch((err: unknown) => console.error('Failed to reload approvals:', err));
        setSelectedApproval(null);
        setReviewNotes('');
      } else {
        setError(result.error || result.message || 'Approval failed');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleReject = async (approvalId: number) => {
    if (!reviewNotes) {
      setError('Please provide a reason for rejection');
      return;
    }
    if (!user?.id) {
      setError('You must be signed in to reject transactions');
      return;
    }

    try {
      const result = await globalThis.electronAPI.rejectTransaction(
        approvalId,
        reviewNotes,
        user.id
      );

      if (result.success) {
        loadApprovals().catch((err: unknown) => console.error('Failed to reload approvals:', err));
        setSelectedApproval(null);
        setReviewNotes('');
      } else {
        setError(result.error || result.message || 'Rejection failed');
      }
    } catch (err) {
      setError((err as Error).message);
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
            <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Approval Queue' }]} />
        <h1 className="text-xl md:text-3xl font-bold text-foreground">Approval Queue</h1>
        <p className="text-muted-foreground mt-1">Review and approve pending transactions</p>
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
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/80"
          >
            Refresh
          </button>
          {approvals.some(a => a.status === 'PENDING') && (
            <span className="ml-auto bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 px-3 py-1 rounded-full text-sm font-medium">
              {approvals.filter(a => a.status === 'PENDING').length} Pending
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {approvals.length === 0 ? (
        <div className="bg-card rounded-lg shadow p-8 text-center">
          <div className="text-muted-foreground">No approval requests found</div>
        </div>
      ) : (
        <div className="bg-card rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Entry Ref</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Rule</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Requested By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {approvals.map((approval) => (
                <tr key={approval.id} className="hover:bg-secondary">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">{approval.entry_ref}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{approval.entry_type}</td>
                  <td className="px-6 py-4 text-sm text-foreground max-w-xs truncate">
                    {approval.description}
                    {approval.student_name && (
                      <div className="text-xs text-muted-foreground">{approval.student_name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{formatCurrencyFromCents(approval.amount)}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{approval.rule_name}</td>
                  <td className="px-6 py-4 text-sm text-foreground">
                    {approval.requested_by_name}
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(approval.requested_at), 'MMM dd, HH:mm')}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(approval.status)}`}>
                      {approval.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {approval.status === 'PENDING' && (
                      <button
                        onClick={() => setSelectedApproval(approval)}
                        className="text-primary hover:text-primary/80"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
            <h2 className="text-2xl font-bold mb-4">Review Approval Request</h2>

            <div className="space-y-3 mb-6">
              <div>
                <span className="font-medium">Entry Reference:</span> {selectedApproval.entry_ref}
              </div>
              <div>
                <span className="font-medium">Type:</span> {selectedApproval.entry_type}
              </div>
              <div>
                <span className="font-medium">Description:</span> {selectedApproval.description}
              </div>
              <div>
                <span className="font-medium">Amount:</span> {formatCurrencyFromCents(selectedApproval.amount)}
              </div>
              {selectedApproval.student_name && (
                <div>
                  <span className="font-medium">Student:</span> {selectedApproval.student_name}
                </div>
              )}
              <div>
                <span className="font-medium">Requested By:</span> {selectedApproval.requested_by_name}
              </div>
              <div>
                <span className="font-medium">Reason for Approval:</span> {selectedApproval.rule_name}
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
                className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground"
                placeholder="Enter your review notes..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleApprove(selectedApproval.id)}
                className="flex-1 px-4 py-2 bg-success text-white rounded-md hover:bg-success/80"
              >
                Approve
              </button>
              <button
                onClick={() => handleReject(selectedApproval.id)}
                className="flex-1 px-4 py-2 bg-destructive text-white rounded-md hover:bg-destructive/80"
              >
                Reject
              </button>
              <button
                onClick={() => {
                  setSelectedApproval(null);
                  setReviewNotes('');
                }}
                className="px-4 py-2 border border-border rounded-md hover:bg-secondary"
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
