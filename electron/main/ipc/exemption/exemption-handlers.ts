import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    ExemptionCreateSchema,
    ExemptionGetAllSchema,
    ExemptionGetByIdSchema,
    ExemptionGetStudentSchema,
    ExemptionCalculateSchema,
    ExemptionRevokeSchema,
    ExemptionGetStatsSchema
} from '../schemas/exemption-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { ExemptionCreateData } from '../../services/finance/ExemptionService'
import type { z } from 'zod'

function normalizeExemptionFilters(filters: z.infer<typeof ExemptionGetAllSchema>) {
  if (!filters) {
        return
  }
    const normalized: {
        studentId?: number
        academicYearId?: number
        termId?: number
        status?: string
    } = {}
    if (filters.studentId !== undefined) { normalized.studentId = filters.studentId }
    if (filters.academicYearId !== undefined) { normalized.academicYearId = filters.academicYearId }
    if (filters.termId !== undefined) { normalized.termId = filters.termId }
    if (filters.status !== undefined) { normalized.status = filters.status }
    return normalized
}

function normalizeExemptionCreateData(data: z.infer<typeof ExemptionCreateSchema>): ExemptionCreateData {
    const normalized: ExemptionCreateData = {
        student_id: data.student_id,
        academic_year_id: data.academic_year_id,
        exemption_percentage: data.exemption_percentage,
        exemption_reason: data.exemption_reason
    }
    if (data.term_id !== undefined) { normalized.term_id = data.term_id }
    if (data.fee_category_id !== undefined) { normalized.fee_category_id = data.fee_category_id }
    if (data.notes !== undefined) { normalized.notes = data.notes }
    return normalized
}

export function registerExemptionHandlers(): void {
    const svc = () => container.resolve('ExemptionService')

    validatedHandler('exemption:getAll', ROLES.FINANCE, ExemptionGetAllSchema, (_event, filters) => {
        return svc().getExemptions(normalizeExemptionFilters(filters))
    })

    validatedHandlerMulti('exemption:getById', ROLES.FINANCE, ExemptionGetByIdSchema, (_event, [id]) => {
        return svc().getExemptionById(id)
    })

    validatedHandlerMulti('exemption:getStudentExemptions', ROLES.FINANCE, ExemptionGetStudentSchema, (_event, [studentId, academicYearId, termId]) => {
        return svc().getStudentExemptions(studentId, academicYearId, termId)
    })

    validatedHandlerMulti('exemption:calculate', ROLES.FINANCE, ExemptionCalculateSchema, (_event, [studentId, academicYearId, termId, categoryId, originalAmount]) => {
        return svc().calculateExemption(studentId, academicYearId, termId, categoryId, originalAmount)
    })

    validatedHandler('exemption:create', ROLES.FINANCE, ExemptionCreateSchema, (_event, data, actor) => {
        return svc().createExemption(normalizeExemptionCreateData(data), actor.id)
    })

    validatedHandlerMulti('exemption:revoke', ROLES.FINANCE, ExemptionRevokeSchema, (_event, [id, reason], actor) => {
        return svc().revokeExemption(id, reason, actor.id)
    })

    validatedHandlerMulti('exemption:getStats', ROLES.FINANCE, ExemptionGetStatsSchema, (_event, [academicYearId]) => {
        return svc().getExemptionStats(academicYearId)
    })
}
