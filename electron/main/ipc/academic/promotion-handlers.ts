import { ipcMain } from '../../electron-env'
import { PromotionService } from '../../services/academic/PromotionService'

import type { IpcMainInvokeEvent } from 'electron'

let cachedService: PromotionService | null = null
const getService = () => {
    if (!cachedService) {
        cachedService = new PromotionService()
    }
    return cachedService
}

export function registerPromotionHandlers(): void {
    type BatchPromoteArgs = [
        studentIds: number[],
        fromStreamId: number,
        toStreamId: number,
        fromAcademicYearId: number,
        toAcademicYearId: number,
        toTermId: number,
        userId: number
    ]

    ipcMain.handle('promotion:getStreams', async () => {
        return getService().getStreams()
    })

    ipcMain.handle('promotion:getStudentsForPromotion', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        academicYearId: number
    ) => {
        return getService().getStudentsForPromotion(streamId, academicYearId)
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
        return getService().promoteStudent(data, userId)
    })

    ipcMain.handle('promotion:batchPromote', async (
        _event: IpcMainInvokeEvent,
        ...[studentIds, fromStreamId, toStreamId, fromAcademicYearId, toAcademicYearId, toTermId, userId]: BatchPromoteArgs
    ) => {
        return getService().batchPromote(
            studentIds, fromStreamId, toStreamId,
            fromAcademicYearId, toAcademicYearId, toTermId, userId
        )
    })

    ipcMain.handle('promotion:getStudentHistory', async (
        _event: IpcMainInvokeEvent,
        studentId: number
    ) => {
        return getService().getStudentPromotionHistory(studentId)
    })

    ipcMain.handle('promotion:getNextStream', async (
        _event: IpcMainInvokeEvent,
        currentStreamId: number
    ) => {
        return getService().getNextStream(currentStreamId)
    })
}
