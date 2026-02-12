import { ipcMain } from '../../electron-env'
import { PromotionService } from '../../services/academic/PromotionService'

import type { IpcMainInvokeEvent } from 'electron'

let cachedService: PromotionService | null = null
const getService = () => {
    cachedService ??= new PromotionService()
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
        try {
            return getService().getStreams()
        } catch (error) {
            throw new Error(`Failed to get streams: ${(error as Error).message}`)
        }
    })

    ipcMain.handle('promotion:getStudentsForPromotion', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        academicYearId: number
    ) => {
        try {
            return getService().getStudentsForPromotion(streamId, academicYearId)
        } catch (error) {
            throw new Error(`Failed to get students for promotion: ${(error as Error).message}`)
        }
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
        try {
            return getService().promoteStudent(data, userId)
        } catch (error) {
            throw new Error(`Failed to promote student: ${(error as Error).message}`)
        }
    })

    ipcMain.handle('promotion:batchPromote', async (
        _event: IpcMainInvokeEvent,
        ...[studentIds, fromStreamId, toStreamId, fromAcademicYearId, toAcademicYearId, toTermId, userId]: BatchPromoteArgs
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

    ipcMain.handle('promotion:getStudentHistory', async (
        _event: IpcMainInvokeEvent,
        studentId: number
    ) => {
        try {
            return getService().getStudentPromotionHistory(studentId)
        } catch (error) {
            throw new Error(`Failed to get promotion history: ${(error as Error).message}`)
        }
    })

    ipcMain.handle('promotion:getNextStream', async (
        _event: IpcMainInvokeEvent,
        currentStreamId: number
    ) => {
        return getService().getNextStream(currentStreamId)
    })
}
