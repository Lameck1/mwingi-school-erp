import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { AttendanceService, DailyAttendanceEntry } from '../../services/academic/AttendanceService'

const service = new AttendanceService()

export function registerAttendanceHandlers(): void {
    ipcMain.handle('attendance:getByDate', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number
    ) => {
        return service.getAttendanceByDate(streamId, date, academicYearId, termId)
    })

    ipcMain.handle('attendance:markAttendance', async (
        _event: IpcMainInvokeEvent,
        entries: DailyAttendanceEntry[],
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number,
        userId: number
    ) => {
        return service.markAttendance(entries, streamId, date, academicYearId, termId, userId)
    })

    ipcMain.handle('attendance:getStudentSummary', async (
        _event: IpcMainInvokeEvent,
        studentId: number,
        academicYearId: number,
        termId?: number
    ) => {
        return service.getStudentAttendanceSummary(studentId, academicYearId, termId)
    })

    ipcMain.handle('attendance:getClassSummary', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number
    ) => {
        return service.getClassAttendanceSummary(streamId, date, academicYearId, termId)
    })

    ipcMain.handle('attendance:getStudentsForMarking', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        academicYearId: number,
        termId: number
    ) => {
        return service.getStudentsForAttendance(streamId, academicYearId, termId)
    })
}
