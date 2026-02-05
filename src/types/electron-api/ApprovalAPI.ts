export interface ApprovalRequest {
    id: number;
    workflow_name: string;
    entity_type: string;
    entity_id: number;
    entity_description: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    requester_name: string;
    approver_name: string | null;
    created_at: string;
    completed_at: string | null;
}

export interface ApprovalCounts {
    pending: number;
    approved: number;
    rejected: number;
}

export interface ApprovalAPI {
    getPendingApprovals: (userId?: number) => Promise<ApprovalRequest[]>;
    getAllApprovals: (filters?: { status?: string; entity_type?: string }) => Promise<ApprovalRequest[]>;
    getApprovalCounts: () => Promise<ApprovalCounts>;
    createApprovalRequest: (entityType: string, entityId: number, userId: number) => Promise<{ success: boolean; id?: number; errors?: string[] }>;
    approveRequest: (requestId: number, approverId: number) => Promise<{ success: boolean; errors?: string[] }>;
    rejectRequest: (requestId: number, approverId: number, reason: string) => Promise<{ success: boolean; errors?: string[] }>;
    cancelApprovalRequest: (requestId: number, userId: number) => Promise<{ success: boolean; errors?: string[] }>;
}
