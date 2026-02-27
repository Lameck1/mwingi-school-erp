import { z } from 'zod'

export const JssAccountTypeEnum = z.enum(['TUITION', 'OPERATIONS', 'INFRASTRUCTURE'])

export const VirementValidateSchema = z.object({
    expenseAccountType: JssAccountTypeEnum,
    fundingCategoryId: z.number().int().positive()
})

export const VirementRequestSchema = z.object({
    fromAccount: JssAccountTypeEnum,
    toAccount: JssAccountTypeEnum,
    amount: z.number().positive(),
    reason: z.string().min(3)
})

export const VirementReviewSchema = z.object({
    requestId: z.number().int().positive(),
    decision: z.enum(['APPROVED', 'REJECTED']),
    reviewNotes: z.string()
})
