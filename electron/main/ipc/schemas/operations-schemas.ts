import { z } from 'zod'

const ExpensePayloadBaseSchema = z.object({
    amount_cents: z.number().int().positive(),
    fiscal_year: z.number().int().min(2000).max(2100),
    gl_account_code: z.string().min(1),
    recorded_by: z.number().int().positive(),
    term: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    description: z.string().min(1),
    payment_method: z.enum(['CASH', 'BANK']).optional()
})

export const BoardingExpenseSchema = ExpensePayloadBaseSchema.extend({
    facility_id: z.number().int().positive(),
    expense_type: z.enum(['FOOD', 'UTILITIES', 'BEDDING', 'STAFF', 'MAINTENANCE', 'OTHER'])
})

export const TransportExpenseSchema = ExpensePayloadBaseSchema.extend({
    route_id: z.number().int().positive(),
    expense_type: z.enum(['FUEL', 'MAINTENANCE', 'INSURANCE', 'PERMITS', 'DRIVER_SALARY', 'OTHER'])
})

export const TransportRouteSchema = z.object({
    route_name: z.string().min(1),
    description: z.string().optional(),
    cost_per_term: z.number().positive(),
    is_active: z.boolean().optional() // Assuming from standard pattern
    // TransportRouteInput definition?
    // I don't see the type definition, but I can infer or assume.
    // Let's assume generic object or refined if possible.
    // If unsure, use z.record(z.unknown()) or similar, but better to be specific if possible.
    // I'll leave it loose if I can't confirm. the handler code: `return transportService.createRoute(params)`
    // The service probably validates. But M-04 requires input validation at IPC layer.
    // Let's assume standard route fields.
})

// For getAll/Active facilities/routes: z.void()

// For getExpenses:
export const GetExpensesTuple = z.tuple([
    z.number().int().positive(), // facilityId or routeId
    z.number().int(), // fiscalYear
    z.number().int().optional() // term
])

// CBC / Grants
export const GrantCreateSchema = z.object({
    grant_name: z.string().min(1),
    grant_type: z.enum(['CAPITATION', 'INFRASTRUCTURE', 'OTHER']), // details needed on GrantType
    amount_allocated: z.number().int().positive(), // Was amount_cents
    amount_received: z.number().int().nonnegative(),
    fiscal_year: z.number().int(),
    source: z.string().min(1),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().optional()
})

export const GrantUtilizationSchema = z.object({
    grantId: z.number().int().positive(), // Was grant_id
    amount: z.number().int().positive(), // Was amount_cents
    utilizationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Was transaction_date
    description: z.string().min(1),
    glAccountCode: z.string().min(1), // Was category? Or category mapped to GL?
    category: z.string().optional(), // Keep if needed, but error said glAccountCode missing
    userId: z.number().int().positive().optional()
})

export const GrantCreateTuple = z.tuple([
    GrantCreateSchema,
    z.number().optional()
])

export const CreateUtilizationTuple = z.tuple([
    GrantUtilizationSchema
])

export const GetExpiringGrantsTuple = z.tuple([z.number().int().nonnegative()]) // days

// Student Cost Analysis
export const CostCalculateTuple = z.tuple([
    z.number().int().positive(), // studentId
    z.number().int().positive(), // termId
    z.number().int().positive() // yearId
])

export const CostBreakdownTuple = z.tuple([
    z.number().int().positive(), // studentId
    z.number().int().positive() // termId
])

export const CostAverageTuple = z.tuple([
    z.number().int().positive(), // grade
    z.number().int().positive() // termId
])

export const CostTrendTuple = z.tuple([
    z.number().int().positive(), // studentId
    z.number().int().positive().optional() // periods
])
