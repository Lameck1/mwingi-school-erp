import { useState, useEffect } from 'react';
import { format } from 'date-fns';

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

export default function ApprovalQueuePage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string>('');

  useEffect(() => {
    loadApprovals();
  }, [filter]);

  const loadApprovals = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await (window as any).electronAPI.getApprovalQueue(filter);
      
      if (result.success) {
        setApprovals(result.data);
      } else {
        setError(result.message || 'Failed to load approvals');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (approvalId: number) => {
    try {
      const result = await (window as any).electronAPI.approveTransaction(
        approvalId,
        reviewNotes || 'Approved'
      );

      if (result.success) {
        loadApprovals();
        setSelectedApproval(null);
        setReviewNotes('');
      } else {
        setError(result.message);
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

    try {
      const result = await (window as any).electronAPI.rejectTransaction(
        approvalId,
        reviewNotes
      );

      if (result.success) {
        loadApprovals();
        setSelectedApproval(null);
        setReviewNotes('');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const formatAmount = (amount: number): string => {
    return `Kes ${(amount / 100).toLocaleString('en-KE', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800'
    };
    return colors[status as keyof typeof colors] || colors.PENDING;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading approvals...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Approval Queue</h1>
        <p className="text-gray-600 mt-1">Review and approve pending transactions</p>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filter:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'PENDING' | 'ALL')}
            className="px-3 py-2 border border-gray-300 rounded-md"
            aria-label="Filter approval requests"
          >
            <option value="PENDING">Pending Only</option>
            <option value="ALL">All Requests</option>
          </select>
          <button
            onClick={loadApprovals}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Refresh
          </button>
          {approvals.filter(a => a.status === 'PENDING').length > 0 && (
            <span className="ml-auto bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
              {approvals.filter(a => a.status === 'PENDING').length} Pending
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {approvals.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-gray-500">No approval requests found</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entry Ref</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rule</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {approvals.map((approval) => (
                <tr key={approval.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{approval.entry_ref}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{approval.entry_type}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                    {approval.description}
                    {approval.student_name && (
                      <div className="text-xs text-gray-500">{approval.student_name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{formatAmount(approval.amount)}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{approval.rule_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {approval.requested_by_name}
                    <div className="text-xs text-gray-500">
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
                        className="text-blue-600 hover:text-blue-800"
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
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
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
                <span className="font-medium">Amount:</span> {formatAmount(selectedApproval.amount)}
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Review Notes {selectedApproval.status === 'PENDING' && '(Required for rejection)'}
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Enter your review notes..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleApprove(selectedApproval.id)}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => handleReject(selectedApproval.id)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Reject
              </button>
              <button
                onClick={() => {
                  setSelectedApproval(null);
                  setReviewNotes('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
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
