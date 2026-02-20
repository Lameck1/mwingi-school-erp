import { z } from 'zod'

/** Zod schema for transaction:create input (M-04 remediation) */
export const TransactionCreateSchema = z.object({
    transaction_date: z.string().min(1),
    transaction_type: z.enum(['INCOME', 'EXPENSE']),
    category_id: z.number().int().positive(),
    amount: z.number().positive(),
    payment_method: z.string().min(1),
    payment_reference: z.string().optional(),
    description: z.string().optional(),
    force_budget_override: z.boolean().optional(),
    budget_override_reason: z.string().optional(),
    budget_department: z.string().nullable().optional(),
})

/** Zod schema for transaction:createCategory input — tuple [name, type] */
export const TransactionCreateCategorySchema = z.tuple([
    z.string().min(1),
    z.enum(['INCOME', 'EXPENSE']),
])

export const TransactionFiltersSchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    type: z.string().optional(),
    categoryId: z.number().optional()
}).optional()

export const TransactionSummaryInputSchema = z.tuple([
    z.string().min(10), // startDate YYYY-MM-DD
    z.string().min(10)  // endDate YYYY-MM-DD
])
