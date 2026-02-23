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

import type { z } from 'zod'

export function registerJSSHandlers() {
    const jssService = container.resolve('JSSTransitionService')

    const normalizeTransitionPayload = (data: z.infer<typeof JssTransitionSchema>, actorId: number) => {
        const payload: {
            student_id: number
            from_grade: number
            to_grade: number
            transition_date: string
            processed_by: number
            boarding_status_change?: 'TO_BOARDER' | 'TO_DAY_SCHOLAR' | 'NO_CHANGE'
            transition_notes?: string
        } = {
            student_id: data.student_id,
            from_grade: data.from_grade,
            to_grade: data.to_grade,
            transition_date: data.transition_date,
            processed_by: actorId
        }
        if (data.boarding_status_change !== undefined) {
            payload.boarding_status_change = data.boarding_status_change
        }
        if (data.transition_notes !== undefined) {
            payload.transition_notes = data.transition_notes
        }
        return payload
    }

    const normalizeFeeStructurePayload = (data: z.infer<typeof JssFeeStructurePayloadSchema>) => {
        const payload: {
            grade: number
            fiscal_year: number
            tuition_fee_cents: number
            boarding_fee_cents?: number
            activity_fee_cents?: number
            exam_fee_cents?: number
            library_fee_cents?: number
            lab_fee_cents?: number
            ict_fee_cents?: number
        } = {
            grade: data.grade,
            fiscal_year: data.fiscal_year,
            tuition_fee_cents: data.tuition_fee_cents
        }
        if (data.boarding_fee_cents !== undefined) { payload.boarding_fee_cents = data.boarding_fee_cents }
        if (data.activity_fee_cents !== undefined) { payload.activity_fee_cents = data.activity_fee_cents }
        if (data.exam_fee_cents !== undefined) { payload.exam_fee_cents = data.exam_fee_cents }
        if (data.library_fee_cents !== undefined) { payload.library_fee_cents = data.library_fee_cents }
        if (data.lab_fee_cents !== undefined) { payload.lab_fee_cents = data.lab_fee_cents }
        if (data.ict_fee_cents !== undefined) { payload.ict_fee_cents = data.ict_fee_cents }
        return payload
    }

    // Initiate transition for single student
    validatedHandler('jss:initiateTransition', ROLES.STAFF, JssTransitionSchema, (_event, data, actor) => {
        const payload = normalizeTransitionPayload(data, actor.id)
        const id = jssService.processStudentTransition(payload)
        return { success: true, data: id }
    })

    // Bulk transition
    validatedHandler('jss:bulkTransition', ROLES.STAFF, JssBulkTransitionSchema, (_event, data, actor) => {
        const payload = { ...data, processed_by: actor.id }
        const result = jssService.batchProcessTransitions(payload)
        return { success: true, data: result }
    })

    // Get eligible students
    validatedHandlerMulti('jss:getEligibleStudents', ROLES.STAFF, JssGetEligibleSchema, (_event, [fromGrade, fiscalYear]) => {
        const students = jssService.getEligibleStudentsForTransition(fromGrade, fiscalYear)
        return { success: true, data: students }
    })

    // Get fee structure
    validatedHandlerMulti('jss:getFeeStructure', ROLES.STAFF, JssGetFeeStructureSchema, (_event, [grade, fiscalYear]) => {
        const structure = jssService.getJSSFeeStructure(grade, fiscalYear)
        return { success: true, data: structure }
    })

    // Set fee structure
    validatedHandler('jss:setFeeStructure', ROLES.STAFF, JssFeeStructurePayloadSchema, (_event, data) => {
        const id = jssService.setJSSFeeStructure(normalizeFeeStructurePayload(data))
        return { success: true, data: id }
    })

    // Get transition report (history)
    validatedHandlerMulti('jss:getTransitionReport', ROLES.STAFF, JssGetReportSchema, (_event, [studentId]) => {
        const history = jssService.getStudentTransitionHistory(studentId)
        return { success: true, data: history }
    })

    // Get transition summary
    validatedHandlerMulti('jss:getTransitionSummary', ROLES.STAFF, JssGetSummarySchema, (_event, [fiscalYear]) => {
        const summary = jssService.getTransitionSummary(fiscalYear)
        return { success: true, data: summary }
    })
}
