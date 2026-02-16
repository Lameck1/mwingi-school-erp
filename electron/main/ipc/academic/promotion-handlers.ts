import { container } from '../../services/base/ServiceContainer'
import { ROLES, resolveActorId, safeHandleRawWithRole } from '../ipc-result'

const getService = () => container.resolve('PromotionService')

export function registerPromotionHandlers(): void {
    safeHandleRawWithRole('promotion:getStreams', ROLES.STAFF, () => {
        try {
            return getService().getStreams()
        } catch (error) {
            throw new Error(`Failed to get streams: ${(error as Error).message}`)
        }
    })

    safeHandleRawWithRole('promotion:getStudentsForPromotion', ROLES.STAFF, (
        _event,
        streamId: number,
        academicYearId: number
    ) => {
        try {
            return getService().getStudentsForPromotion(streamId, academicYearId)
        } catch (error) {
            throw new Error(`Failed to get students for promotion: ${(error as Error).message}`)
        }
    })

    safeHandleRawWithRole('promotion:promoteStudent', ROLES.MANAGEMENT, (
        event,
        data: {
            student_id: number
            from_stream_id: number
            to_stream_id: number
            from_academic_year_id: number
            to_academic_year_id: number
            to_term_id: number
        },
        legacyUserId?: number
    ) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }

        try {
            return getService().promoteStudent(data, actor.actorId)
        } catch (error) {
            throw new Error(`Failed to promote student: ${(error as Error).message}`)
        }
    })

    safeHandleRawWithRole('promotion:batchPromote', ROLES.MANAGEMENT, (
        event,
        studentIds: number[],
        fromStreamId: number,
        toStreamId: number,
        fromAcademicYearId: number,
        toAcademicYearId: number,
        toTermId: number,
        legacyUserId?: number
    ) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }

        try {
            return getService().batchPromote(
                studentIds, fromStreamId, toStreamId,
                fromAcademicYearId, toAcademicYearId, toTermId, actor.actorId
            )
        } catch (error) {
            throw new Error(`Failed to batch promote: ${(error as Error).message}`)
        }
    })

    safeHandleRawWithRole('promotion:getStudentHistory', ROLES.STAFF, (
        _event,
        studentId: number
    ) => {
        try {
            return getService().getStudentPromotionHistory(studentId)
        } catch (error) {
            throw new Error(`Failed to get promotion history: ${(error as Error).message}`)
        }
    })

    safeHandleRawWithRole('promotion:getNextStream', ROLES.STAFF, (
        _event,
        currentStreamId: number
    ) => {
        return getService().getNextStream(currentStreamId)
    })
}
