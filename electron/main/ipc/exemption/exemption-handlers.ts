import { container } from '../../services/base/ServiceContainer'
import { validateId } from '../../utils/validation'
import { safeHandleRaw } from '../ipc-result'

import type { ExemptionCreateData } from '../../services/finance/ExemptionService'

export function registerExemptionHandlers(): void {
    const svc = () => container.resolve('ExemptionService')

    safeHandleRaw('exemption:getAll', (_event, filters?: {
        studentId?: number;
        academicYearId?: number;
        termId?: number;
        status?: string
    }) => {
        return svc().getExemptions(filters)
    })

    safeHandleRaw('exemption:getById', (_event, id: number) => {
        const v = validateId(id, 'Exemption ID')
        if (!v.success) { return { success: false, error: v.error } }
        return svc().getExemptionById(v.data!)
    })

    safeHandleRaw('exemption:getStudentExemptions', (_event, studentId: number, academicYearId: number, termId: number) => {
        const vStudent = validateId(studentId, 'Student ID')
        const vYear = validateId(academicYearId, 'Academic Year ID')
        const vTerm = validateId(termId, 'Term ID')
        if (!vStudent.success) { return { success: false, error: vStudent.error } }
        if (!vYear.success) { return { success: false, error: vYear.error } }
        if (!vTerm.success) { return { success: false, error: vTerm.error } }
        return svc().getStudentExemptions(vStudent.data!, vYear.data!, vTerm.data!)
    })

    safeHandleRaw('exemption:calculate', (_event, studentId: number, academicYearId: number, termId: number, categoryId: number, originalAmount: number) => {
        return svc().calculateExemption(studentId, academicYearId, termId, categoryId, originalAmount)
    })

    safeHandleRaw('exemption:create', (_event, data: ExemptionCreateData, userId: number) => {
        return svc().createExemption(data, userId)
    })

    safeHandleRaw('exemption:revoke', (_event, id: number, reason: string, userId: number) => {
        const vId = validateId(id, 'Exemption ID')
        const vUser = validateId(userId, 'User ID')
        if (!vId.success) { return { success: false, error: vId.error } }
        if (!vUser.success) { return { success: false, error: vUser.error } }
        if (!reason || typeof reason !== 'string' || !reason.trim()) { return { success: false, error: 'Revoke reason is required' } }
        return svc().revokeExemption(vId.data!, reason.trim(), vUser.data!)
    })

    safeHandleRaw('exemption:getStats', (_event, academicYearId?: number) => {
        return svc().getExemptionStats(academicYearId)
    })
}
