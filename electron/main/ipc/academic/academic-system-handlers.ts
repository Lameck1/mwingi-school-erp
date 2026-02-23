import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    SubjectCreateSchema,
    SubjectUpdateSchema,
    SubjectSetActiveSchema,
    GetExamsSchema,
    CreateExamSchema,
    DeleteExamSchema,
    AllocateTeacherSchema,
    GetAllocationsSchema,
    DeleteAllocationSchema,
    SaveResultsSchema,
    GetResultsSchema,
    ProcessResultsSchema,
    GetSubjectsSchema,
    GetSubjectsAdminSchema,
    CertificatePayloadSchema,
    EmailParentsPayloadSchema
} from '../schemas/academic-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { z } from 'zod'

const getService = () => container.resolve('AcademicSystemService')
const _getNotificationService = () => container.resolve('NotificationService')

function normalizeSubjectCreate(data: z.infer<typeof SubjectCreateSchema>) {
    const normalized: {
        code: string
        name: string
        curriculum: string
        is_compulsory?: boolean
        is_active?: boolean
    } = {
        code: data.code,
        name: data.name,
        curriculum: data.curriculum
    }
    if (data.is_compulsory !== undefined) {
        normalized.is_compulsory = data.is_compulsory
    }
    if (data.is_active !== undefined) {
        normalized.is_active = data.is_active
    }
    return normalized
}

function normalizeSubjectUpdate(data: z.infer<typeof SubjectUpdateSchema>[1]) {
    const normalized: {
        code?: string
        name?: string
        curriculum?: string
        is_compulsory?: boolean
        is_active?: boolean
    } = {}
    if (data.code !== undefined) { normalized.code = data.code }
    if (data.name !== undefined) { normalized.name = data.name }
    if (data.curriculum !== undefined) { normalized.curriculum = data.curriculum }
    if (data.is_compulsory !== undefined) { normalized.is_compulsory = data.is_compulsory }
    if (data.is_active !== undefined) { normalized.is_active = data.is_active }
    return normalized
}

function normalizeCreateExam(data: z.infer<typeof CreateExamSchema>) {
    const normalized: {
        academic_year_id: number
        term_id: number
        name: string
        weight?: number
    } = {
        academic_year_id: data.academic_year_id,
        term_id: data.term_id,
        name: data.name
    }
    if (data.weight !== undefined) {
        normalized.weight = data.weight
    }
    return normalized
}

export function registerAcademicSystemHandlers() {
    // ==================== Subject Management ====================
    // handlers that take no args (or void schema)
    validatedHandler('academic:getSubjects', ROLES.STAFF, GetSubjectsSchema, () => getService().getAllSubjects())
    validatedHandler('academic:getSubjectsAdmin', ROLES.STAFF, GetSubjectsAdminSchema, () => getService().getAllSubjectsAdmin())

    validatedHandler('academic:createSubject', ROLES.ADMIN_ONLY, SubjectCreateSchema, (_event, data, actor) => {
        return getService().createSubject(normalizeSubjectCreate(data), actor.id)
    })

    validatedHandlerMulti('academic:updateSubject', ROLES.ADMIN_ONLY, SubjectUpdateSchema, (_event, [id, data], actor) => {
        return getService().updateSubject(id, normalizeSubjectUpdate(data), actor.id)
    })

    validatedHandlerMulti('academic:setSubjectActive', ROLES.ADMIN_ONLY, SubjectSetActiveSchema, (_event, [id, isActive], actor) => {
        return getService().setSubjectActive(id, isActive, actor.id)
    })

    // ==================== Exam Management ====================
    validatedHandlerMulti('academic:getExams', ROLES.STAFF, GetExamsSchema, (_event, [academicYearId, termId]) => {
        return getService().getAllExams(academicYearId, termId)
    })

    // Legacy handler requiring manual check or removal if not used. 
    // Assuming 'academic:getExamsList' is the same as above but object based? 
    // The previous file had: 'exam:getAllList'. Let's check if we need to keep it.
    // The previous file had `safeHandleRawWithRole('exam:getAllList', ...)` calling `getService().getAllExams(academicYearId, termId)`.
    // We will port it if needed, but 'academic:getExams' seems to cover it. 
    // I'll stick to the ones I saw in the original file I replaced.
    // Original file had:
    // academic:getSubjects, academic:getSubjectsAdmin, academic:createSubject, academic:updateSubject, academic:setSubjectActive
    // academic:getExams, academic:createExam, academic:deleteExam
    // academic:allocateTeacher, academic:getAllocations, academic:deleteAllocation
    // academic:saveResults, academic:getResults, academic:processResults
    // academic:generateCertificate, academic:emailParents

    validatedHandler('academic:createExam', ROLES.ADMIN_ONLY, CreateExamSchema, (_event, data, actor) => {
        return getService().createExam(normalizeCreateExam(data), actor.id)
    })

    validatedHandlerMulti('academic:deleteExam', ROLES.ADMIN_ONLY, DeleteExamSchema, (_event, [id], actor) => {
        return getService().deleteExam(id, actor.id)
    })

    // ==================== Teacher Allocations ====================
    validatedHandler('academic:allocateTeacher', ROLES.ADMIN_ONLY, AllocateTeacherSchema, (_event, data, actor) => {
        return getService().allocateTeacher(data, actor.id)
    })

    validatedHandlerMulti('academic:getAllocations', ROLES.STAFF, GetAllocationsSchema, (_event, [academicYearId, termId, streamId]) => {
        return getService().getAllocations(academicYearId, termId, streamId)
    })

    validatedHandlerMulti('academic:deleteAllocation', ROLES.ADMIN_ONLY, DeleteAllocationSchema, (_event, [allocationId], actor) => {
        return getService().deleteAllocation(allocationId, actor.id)
    })

    // ==================== Results & Report Cards ====================
    validatedHandlerMulti('academic:saveResults', ROLES.STAFF, SaveResultsSchema, (_event, [examId, results], actor) => {
        return getService().saveResults(examId, results, actor.id)
    })

    validatedHandlerMulti('academic:getResults', ROLES.STAFF, GetResultsSchema, (_event, [examId, subjectId, streamId], actor) => {
        return getService().getResults(examId, subjectId, streamId, actor.id)
    })

    validatedHandlerMulti('academic:processResults', ROLES.ADMIN_ONLY, ProcessResultsSchema, (_event, [examId], actor) => {
        return getService().processResults(examId, actor.id)
    })

    // ==================== Certificates & Emails ====================
    validatedHandler('academic:generateCertificate', ROLES.STAFF, CertificatePayloadSchema, (_event, data) => {
        return getService().generateCertificate(data)
    })

    validatedHandler('academic:emailParents', ROLES.STAFF, EmailParentsPayloadSchema, (_event, data) => {
        return getService().emailParents(data)
    })
}
