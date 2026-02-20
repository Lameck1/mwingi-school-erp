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

import type {
    CreateExamDTO,
    SubjectAllocation,
    ExamResult,
    SubjectCreateData,
    SubjectUpdateData
} from '../../services/academic/AcademicSystemService'

const getService = () => container.resolve('AcademicSystemService')
const _getNotificationService = () => container.resolve('NotificationService')

interface CertificatePayload {
    studentId: number
    studentName: string
    awardCategory: string
    academicYearId: number
    improvementPercentage: number
}

interface EmailParentsPayload {
    students: Array<{ student_id: number; student_name: string; improvement_percentage: number }>
    awardCategory: string
    templateType: string
}

export function registerAcademicSystemHandlers() {
    // ==================== Subject Management ====================
    // handlers that take no args (or void schema)
    validatedHandler('academic:getSubjects', ROLES.STAFF, GetSubjectsSchema, () => getService().getAllSubjects())
    validatedHandler('academic:getSubjectsAdmin', ROLES.STAFF, GetSubjectsAdminSchema, () => getService().getAllSubjectsAdmin())

    validatedHandler('academic:createSubject', ROLES.ADMIN_ONLY, SubjectCreateSchema, (event, data: SubjectCreateData, actor) => {
        return getService().createSubject(data, actor.id)
    })

    validatedHandlerMulti('academic:updateSubject', ROLES.ADMIN_ONLY, SubjectUpdateSchema, (event, [id, data]: [number, SubjectUpdateData], actor) => {
        return getService().updateSubject(id, data, actor.id)
    })

    validatedHandlerMulti('academic:setSubjectActive', ROLES.ADMIN_ONLY, SubjectSetActiveSchema, (event, [id, isActive]: [number, boolean], actor) => {
        return getService().setSubjectActive(id, isActive, actor.id)
    })

    // ==================== Exam Management ====================
    validatedHandlerMulti('academic:getExams', ROLES.STAFF, GetExamsSchema, (_event, [academicYearId, termId]: [number, number]) => {
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

    validatedHandler('academic:createExam', ROLES.ADMIN_ONLY, CreateExamSchema, (event, data: CreateExamDTO, actor) => {
        return getService().createExam(data, actor.id)
    })

    validatedHandlerMulti('academic:deleteExam', ROLES.ADMIN_ONLY, DeleteExamSchema, (event, [id]: [number], actor) => {
        return getService().deleteExam(id, actor.id)
    })

    // ==================== Teacher Allocations ====================
    validatedHandler('academic:allocateTeacher', ROLES.ADMIN_ONLY, AllocateTeacherSchema, (event, data: Omit<SubjectAllocation, 'id'>, actor) => {
        return getService().allocateTeacher(data, actor.id)
    })

    validatedHandlerMulti('academic:getAllocations', ROLES.STAFF, GetAllocationsSchema, (_event, [academicYearId, termId, streamId]: [number, number, number?]) => {
        return getService().getAllocations(academicYearId, termId, streamId)
    })

    validatedHandlerMulti('academic:deleteAllocation', ROLES.ADMIN_ONLY, DeleteAllocationSchema, (event, [allocationId]: [number], actor) => {
        return getService().deleteAllocation(allocationId, actor.id)
    })

    // ==================== Results & Report Cards ====================
    validatedHandlerMulti('academic:saveResults', ROLES.STAFF, SaveResultsSchema, (event, [examId, results]: [number, Omit<ExamResult, 'id' | 'exam_id'>[]], actor) => {
        return getService().saveResults(examId, results, actor.id)
    })

    validatedHandlerMulti('academic:getResults', ROLES.STAFF, GetResultsSchema, (event, [examId, subjectId, streamId]: [number, number, number], actor) => {
        return getService().getResults(examId, subjectId, streamId, actor.id)
    })

    validatedHandlerMulti('academic:processResults', ROLES.ADMIN_ONLY, ProcessResultsSchema, (event, [examId]: [number], actor) => {
        return getService().processResults(examId, actor.id)
    })

    // ==================== Certificates & Emails ====================
    validatedHandler('academic:generateCertificate', ROLES.STAFF, CertificatePayloadSchema, (event, data: CertificatePayload) => {
        return getService().generateCertificate(data)
    })

    validatedHandler('academic:emailParents', ROLES.STAFF, EmailParentsPayloadSchema, (event, data: EmailParentsPayload) => {
        return getService().emailParents(data)
    })
}
