import { ipcMain } from '../../electron-env'
import { AttendanceService, type DailyAttendanceEntry } from '../../services/academic/AttendanceService'

import type { IpcMainInvokeEvent } from 'electron'

let cachedService: AttendanceService | null = null
const getService = () => {
    cachedService ??= new AttendanceService()
    return cachedService
}

export function registerAttendanceHandlers(): void {
    type MarkAttendanceArgs = [
        entries: DailyAttendanceEntry[],
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number,
        userId: number
    ]

    ipcMain.handle('attendance:getByDate', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number
    ) => {
        try {
            return getService().getAttendanceByDate(streamId, date, academicYearId, termId)
        } catch (error) {
            throw new Error(`Failed to get attendance: ${(error as Error).message}`)
        }
    })

    ipcMain.handle('attendance:markAttendance', async (
        _event: IpcMainInvokeEvent,
        ...[entries, streamId, date, academicYearId, termId, userId]: MarkAttendanceArgs
    ) => {
        try {
            return getService().markAttendance(entries, streamId, date, academicYearId, termId, userId)
        } catch (error) {
            throw new Error(`Failed to mark attendance: ${(error as Error).message}`)
        }
    })

    ipcMain.handle('attendance:getStudentSummary', async (
        _event: IpcMainInvokeEvent,
        studentId: number,
        academicYearId: number,
        termId?: number
    ) => {
        try {
            return getService().getStudentAttendanceSummary(studentId, academicYearId, termId)
        } catch (error) {
            throw new Error(`Failed to get student summary: ${(error as Error).message}`)
        }
    })

    ipcMain.handle('attendance:getClassSummary', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number
    ) => {
        try {
            return getService().getClassAttendanceSummary(streamId, date, academicYearId, termId)
        } catch (error) {
            throw new Error(`Failed to get class summary: ${(error as Error).message}`)
        }
    })

    ipcMain.handle('attendance:getStudentsForMarking', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        academicYearId: number,
        termId: number
    ) => {
        try {
            return getService().getStudentsForAttendance(streamId, academicYearId, termId)
        } catch (error) {
            throw new Error(`Failed to get students for marking: ${(error as Error).message}`)
        }
    })
}
