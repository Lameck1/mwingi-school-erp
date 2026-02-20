import { z } from 'zod'

import { DateStringSchema, PositiveIntSchema } from './finance-schemas'

export const BankAccountSchema = z.object({
    account_name: z.string().min(1),
    account_number: z.string().min(1),
    bank_name: z.string().min(1),
    branch: z.string().optional(),
    swift_code: z.string().optional(),
    currency: z.string().optional(),
    opening_balance: z.number()
})

export const CreateStatementTuple = z.tuple([
    PositiveIntSchema, // bankAccountId
    DateStringSchema,
    z.number(), // opening
    z.number(), // closing
    z.string().optional() // reference
])

export const StatementLineSchema = z.object({
    transaction_date: DateStringSchema,
    description: z.string().min(1),
    reference: z.string().nullable().default(null),
    debit_amount: z.number().nonnegative(),
    credit_amount: z.number().nonnegative(),
    running_balance: z.number().nullable().default(null)
}).refine(data => {
    return (data.debit_amount > 0 && data.credit_amount === 0) || (data.debit_amount === 0 && data.credit_amount > 0)
}, { message: "Exactly one of debit or credit must be positive", path: ['debit_amount'] })



export const AddStatementLineTuple = z.tuple([
    PositiveIntSchema, // statementId
    StatementLineSchema
])

export const UnmatchedTransactionTuple = z.tuple([
    DateStringSchema,
    DateStringSchema,
    z.number().int().positive().optional()
])

export const MatchTransactionTuple = z.tuple([
    PositiveIntSchema, // lineId
    PositiveIntSchema // transactionId
])

export const MarkReconciledTuple = z.tuple([
    PositiveIntSchema, // statementId
    z.number().optional() // legacyUserId
])
