import { z } from 'zod'

export const ApprovalFilterSchema = z.object({
    status: z.string().optional(),
    entity_type: z.string().optional()
}).optional()

export const CreateApprovalSchema = z.tuple([
    z.string().min(1, "Entity type is required"),
    z.number().int().positive("Entity ID must be positive"),
    z.number().optional() // legacyUserId
])

export const ApproveRequestSchema = z.tuple([
    z.number().int().positive("Request ID must be positive"),
    z.number().optional() // legacyApproverId
])

export const RejectRequestSchema = z.tuple([
    z.number().int().positive("Request ID must be positive"),
    z.string().min(1, "Rejection reason is required"),
    z.number().optional() // legacyApproverId. Note order change in handler vs schema? 
    // Original handler: (event, requestId, legacyApproverId, reason)
    // Wait, original handler: (event, requestId, legacyApproverId, reason)
    // My schema should match the args passed.
    // So: [requestId, legacyId, reason]
])

// Correction for Reject schema to match handler args:
// Handler: (event, requestId, legacyApproverId, reason)
// Args: [requestId, legacyApproverId, reason]
export const RejectRequestTuple = z.tuple([
    z.number().int().positive(),
    z.number().optional(),
    z.string().min(1)
])

export const CancelRequestSchema = z.tuple([
    z.number().int().positive(),
    z.number().optional() // legacyUserId
])
