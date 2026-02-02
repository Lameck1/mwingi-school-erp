import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { PromotionService } from '../../services/academic/PromotionService'

const service = new PromotionService()

export function registerPromotionHandlers(): void {
    ipcMain.handle('promotion:getStreams', async () => {
        return service.getStreams()
    })

    ipcMain.handle('promotion:getStudentsForPromotion', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        academicYearId: number
    ) => {
        return service.getStudentsForPromotion(streamId, academicYearId)
    })

    ipcMain.handle('promotion:promoteStudent', async (
        _event: IpcMainInvokeEvent,
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
        return service.promoteStudent(data, userId)
    })

    ipcMain.handle('promotion:batchPromote', async (
        _event: IpcMainInvokeEvent,
        studentIds: number[],
        fromStreamId: number,
        toStreamId: number,
        fromAcademicYearId: number,
        toAcademicYearId: number,
        toTermId: number,
        userId: number
    ) => {
        return service.batchPromote(
            studentIds, fromStreamId, toStreamId,
            fromAcademicYearId, toAcademicYearId, toTermId, userId
        )
    })

    ipcMain.handle('promotion:getStudentHistory', async (
        _event: IpcMainInvokeEvent,
        studentId: number
    ) => {
        return service.getStudentPromotionHistory(studentId)
    })

    ipcMain.handle('promotion:getNextStream', async (
        _event: IpcMainInvokeEvent,
        currentStreamId: number
    ) => {
        return service.getNextStream(currentStreamId)
    })
}
