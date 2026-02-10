import { ipcMain } from '../../electron-env'
import { AttendanceService, type DailyAttendanceEntry } from '../../services/academic/AttendanceService'

import type { IpcMainInvokeEvent } from 'electron'

let cachedService: AttendanceService | null = null
const getService = () => {
    if (!cachedService) {
        cachedService = new AttendanceService()
    }
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
        return getService().getAttendanceByDate(streamId, date, academicYearId, termId)
    })

    ipcMain.handle('attendance:markAttendance', async (
        _event: IpcMainInvokeEvent,
        ...[entries, streamId, date, academicYearId, termId, userId]: MarkAttendanceArgs
    ) => {
        return getService().markAttendance(entries, streamId, date, academicYearId, termId, userId)
    })

    ipcMain.handle('attendance:getStudentSummary', async (
        _event: IpcMainInvokeEvent,
        studentId: number,
        academicYearId: number,
        termId?: number
    ) => {
        return getService().getStudentAttendanceSummary(studentId, academicYearId, termId)
    })

    ipcMain.handle('attendance:getClassSummary', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number
    ) => {
        return getService().getClassAttendanceSummary(streamId, date, academicYearId, termId)
    })

    ipcMain.handle('attendance:getStudentsForMarking', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        academicYearId: number,
        termId: number
    ) => {
        return getService().getStudentsForAttendance(streamId, academicYearId, termId)
    })
}
