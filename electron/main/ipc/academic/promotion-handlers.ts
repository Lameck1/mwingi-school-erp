import { z } from 'zod'

import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    PromotionGetStudentsSchema,
    PromotionStudentSchema,
    PromotionBatchSchema,
    PromotionHistorySchema,
    PromotionNextStreamSchema
} from '../schemas/academic-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

const getService = () => container.resolve('PromotionService')

export function registerPromotionHandlers(): void {
    validatedHandler('promotion:getStreams', ROLES.STAFF, z.undefined(), () => {
        return getService().getStreams()
    })

    validatedHandlerMulti('promotion:getStudentsForPromotion', ROLES.STAFF, PromotionGetStudentsSchema, (_event, [streamId, academicYearId]: [number, number]) => {
        return getService().getStudentsForPromotion(streamId, academicYearId)
    })

    validatedHandler('promotion:promoteStudent', ROLES.MANAGEMENT, PromotionStudentSchema, (event, data, actor) => {
        return getService().promoteStudent(data, actor.id)
    })

    validatedHandlerMulti('promotion:batchPromote', ROLES.MANAGEMENT, PromotionBatchSchema, (event, [studentIds, fromStreamId, toStreamId, fromAcademicYearId, toAcademicYearId, toTermId]: [number[], number, number, number, number, number, number?], actor) => {
        return getService().batchPromote(
            studentIds, fromStreamId, toStreamId,
            fromAcademicYearId, toAcademicYearId, toTermId, actor.id
        )
    })

    validatedHandlerMulti('promotion:getStudentHistory', ROLES.STAFF, PromotionHistorySchema, (_event, [studentId]: [number]) => {
        return getService().getStudentPromotionHistory(studentId)
    })

    validatedHandlerMulti('promotion:getNextStream', ROLES.STAFF, PromotionNextStreamSchema, (_event, [currentStreamId]: [number]) => {
        return getService().getNextStream(currentStreamId)
    })
}
