import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    JssTransitionSchema,
    JssBulkTransitionSchema,
    JssFeeStructurePayloadSchema,
    JssGetEligibleSchema,
    JssGetFeeStructureSchema,
    JssGetReportSchema,
    JssGetSummarySchema
} from '../schemas/academic-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { JSSTransitionService } from '../../services/cbc/JSSTransitionService'

type TransitionPayload = Parameters<JSSTransitionService['processStudentTransition']>[0]
type BulkTransitionPayload = Parameters<JSSTransitionService['batchProcessTransitions']>[0]
type FeeStructurePayload = Parameters<JSSTransitionService['setJSSFeeStructure']>[0]

export function registerJSSHandlers() {
    const jssService = container.resolve('JSSTransitionService')

    // Initiate transition for single student
    validatedHandler('jss:initiateTransition', ROLES.STAFF, JssTransitionSchema, (_event, data: TransitionPayload, actor) => {
        // data.processed_by is set in schema but we should probably override with actor.id for security
        // However, schema expects strict shape.
        // Let's assume we want to enforce the actor as the processor.
        const payload = { ...data, processed_by: actor.id }
        // Wait, schema check already passed.
        // If schema requires processed_by, frontend must send it.
        // But we should override it.
        // Let's use payload.
        const id = jssService.processStudentTransition(payload)
        return { success: true, data: id }
    })

    // Bulk transition
    validatedHandler('jss:bulkTransition', ROLES.STAFF, JssBulkTransitionSchema, (_event, data: BulkTransitionPayload, actor) => {
        const payload = { ...data, processed_by: actor.id }
        const result = jssService.batchProcessTransitions(payload)
        return { success: true, data: result }
    })

    // Get eligible students
    validatedHandlerMulti('jss:getEligibleStudents', ROLES.STAFF, JssGetEligibleSchema, (_event, [fromGrade, fiscalYear]: [number, number]) => {
        const students = jssService.getEligibleStudentsForTransition(fromGrade, fiscalYear)
        return { success: true, data: students }
    })

    // Get fee structure
    validatedHandlerMulti('jss:getFeeStructure', ROLES.STAFF, JssGetFeeStructureSchema, (_event, [grade, fiscalYear]: [number, number]) => {
        const structure = jssService.getJSSFeeStructure(grade, fiscalYear)
        return { success: true, data: structure }
    })

    // Set fee structure
    validatedHandler('jss:setFeeStructure', ROLES.STAFF, JssFeeStructurePayloadSchema, (_event, data: FeeStructurePayload) => {
        const id = jssService.setJSSFeeStructure(data)
        return { success: true, data: id }
    })

    // Get transition report (history)
    validatedHandlerMulti('jss:getTransitionReport', ROLES.STAFF, JssGetReportSchema, (_event, [studentId]: [number]) => {
        const history = jssService.getStudentTransitionHistory(studentId)
        return { success: true, data: history }
    })

    // Get transition summary
    validatedHandlerMulti('jss:getTransitionSummary', ROLES.STAFF, JssGetSummarySchema, (_event, [fiscalYear]: [number]) => {
        const summary = jssService.getTransitionSummary(fiscalYear)
        return { success: true, data: summary }
    })
}
