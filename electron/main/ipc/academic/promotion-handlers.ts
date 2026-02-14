import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw } from '../ipc-result'

const getService = () => container.resolve('PromotionService')

export function registerPromotionHandlers(): void {
    safeHandleRaw('promotion:getStreams', () => {
        try {
            return getService().getStreams()
        } catch (error) {
            throw new Error(`Failed to get streams: ${(error as Error).message}`)
        }
    })

    safeHandleRaw('promotion:getStudentsForPromotion', (
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

    safeHandleRaw('promotion:promoteStudent', (
        _event,
        data: {
            student_id: number
            from_stream_id: number
            to_stream_id: number
            from_academic_year_id: number
            to_academic_year_id: number
            to_term_id: number
        },
        userId: number
    ) => {
        try {
            return getService().promoteStudent(data, userId)
        } catch (error) {
            throw new Error(`Failed to promote student: ${(error as Error).message}`)
        }
    })

    safeHandleRaw('promotion:batchPromote', (
        _event,
        studentIds: number[],
        fromStreamId: number,
        toStreamId: number,
        fromAcademicYearId: number,
        toAcademicYearId: number,
        toTermId: number,
        userId: number
    ) => {
        try {
            return getService().batchPromote(
                studentIds, fromStreamId, toStreamId,
                fromAcademicYearId, toAcademicYearId, toTermId, userId
            )
        } catch (error) {
            throw new Error(`Failed to batch promote: ${(error as Error).message}`)
        }
    })

    safeHandleRaw('promotion:getStudentHistory', (
        _event,
        studentId: number
    ) => {
        try {
            return getService().getStudentPromotionHistory(studentId)
        } catch (error) {
            throw new Error(`Failed to get promotion history: ${(error as Error).message}`)
        }
    })

    safeHandleRaw('promotion:getNextStream', (
        _event,
        currentStreamId: number
    ) => {
        return getService().getNextStream(currentStreamId)
    })
}
