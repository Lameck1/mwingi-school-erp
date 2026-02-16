import { container } from '../../services/base/ServiceContainer'
import { validateId } from '../../utils/validation'
import { ROLES, resolveActorId, safeHandleRawWithRole } from '../ipc-result'

import type { ExemptionCreateData } from '../../services/finance/ExemptionService'

export function registerExemptionHandlers(): void {
    const svc = () => container.resolve('ExemptionService')

    safeHandleRawWithRole('exemption:getAll', ROLES.FINANCE, (_event, filters?: {
        studentId?: number;
        academicYearId?: number;
        termId?: number;
        status?: string
    }) => {
        return svc().getExemptions(filters)
    })

    safeHandleRawWithRole('exemption:getById', ROLES.FINANCE, (_event, id: number) => {
        const v = validateId(id, 'Exemption ID')
        if (!v.success) { return { success: false, error: v.error } }
        return svc().getExemptionById(v.data!)
    })

    safeHandleRawWithRole('exemption:getStudentExemptions', ROLES.FINANCE, (_event, studentId: number, academicYearId: number, termId: number) => {
        const vStudent = validateId(studentId, 'Student ID')
        const vYear = validateId(academicYearId, 'Academic Year ID')
        const vTerm = validateId(termId, 'Term ID')
        if (!vStudent.success) { return { success: false, error: vStudent.error } }
        if (!vYear.success) { return { success: false, error: vYear.error } }
        if (!vTerm.success) { return { success: false, error: vTerm.error } }
        return svc().getStudentExemptions(vStudent.data!, vYear.data!, vTerm.data!)
    })

    safeHandleRawWithRole('exemption:calculate', ROLES.FINANCE, (_event, studentId: number, academicYearId: number, termId: number, categoryId: number, originalAmount: number) => {
        return svc().calculateExemption(studentId, academicYearId, termId, categoryId, originalAmount)
    })

    safeHandleRawWithRole('exemption:create', ROLES.FINANCE, (event, data: ExemptionCreateData, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return svc().createExemption(data, actor.actorId)
    })

    safeHandleRawWithRole('exemption:revoke', ROLES.FINANCE, (event, id: number, reason: string, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        const vId = validateId(id, 'Exemption ID')
        if (!vId.success) { return { success: false, error: vId.error } }
        if (!reason || typeof reason !== 'string' || !reason.trim()) { return { success: false, error: 'Revoke reason is required' } }
        return svc().revokeExemption(vId.data!, reason.trim(), actor.actorId)
    })

    safeHandleRawWithRole('exemption:getStats', ROLES.FINANCE, (_event, academicYearId?: number) => {
        return svc().getExemptionStats(academicYearId)
    })
}
