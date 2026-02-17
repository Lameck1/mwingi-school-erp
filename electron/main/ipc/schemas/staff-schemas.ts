import { z } from 'zod'

/** Zod schema for staff:create input (M-04 remediation) */
export const StaffCreateSchema = z.object({
    staff_number: z.string().optional(),
    first_name: z.string().optional(),
    middle_name: z.string().nullable().optional(),
    last_name: z.string().optional(),
    id_number: z.string().nullable().optional(),
    kra_pin: z.string().nullable().optional(),
    nhif_number: z.string().nullable().optional(),
    nssf_number: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    bank_name: z.string().nullable().optional(),
    bank_account: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    job_title: z.string().nullable().optional(),
    employment_date: z.string().nullable().optional(),
    basic_salary: z.number().nullable().optional(),
    is_active: z.boolean().optional(),
})

/** Zod schema for staff:update input — tuple [id, partialData] */
export const StaffUpdateSchema = z.tuple([
    z.number().int().positive(),
    StaffCreateSchema.partial(),
])

/** Zod schema for staff:setActive input — tuple [id, isActive] */
export const StaffSetActiveSchema = z.tuple([
    z.number().int().positive(),
    z.boolean(),
])
