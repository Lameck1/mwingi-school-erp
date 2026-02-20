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


export function registerExemptionHandlers(): void {
    const svc = () => container.resolve('ExemptionService')

    validatedHandler('exemption:getAll', ROLES.FINANCE, ExemptionGetAllSchema, (_event, filters) => {
        return svc().getExemptions(filters)
    })

    validatedHandler('exemption:getById', ROLES.FINANCE, ExemptionGetByIdSchema, (_event, [id]) => {
        return svc().getExemptionById(id)
    })

    validatedHandlerMulti('exemption:getStudentExemptions', ROLES.FINANCE, ExemptionGetStudentSchema, (_event, [studentId, academicYearId, termId]: [number, number, number]) => {
        return svc().getStudentExemptions(studentId, academicYearId, termId)
    })

    validatedHandlerMulti('exemption:calculate', ROLES.FINANCE, ExemptionCalculateSchema, (_event, [studentId, academicYearId, termId, categoryId, originalAmount]: [number, number, number, number, number]) => {
        return svc().calculateExemption(studentId, academicYearId, termId, categoryId, originalAmount)
    })

    validatedHandler('exemption:create', ROLES.FINANCE, ExemptionCreateSchema, (event, data, actor) => {
        return svc().createExemption(data, actor.id)
    })

    validatedHandlerMulti('exemption:revoke', ROLES.FINANCE, ExemptionRevokeSchema, (event, [id, reason], actor) => {
        return svc().revokeExemption(id, reason, actor.id)
    })

    validatedHandler('exemption:getStats', ROLES.FINANCE, ExemptionGetStatsSchema, (_event, [academicYearId]) => {
        return svc().getExemptionStats(academicYearId)
    })
}
