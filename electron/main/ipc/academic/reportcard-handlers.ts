import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { ReportCardService } from '../../services/academic/ReportCardService'

const service = new ReportCardService()

export function registerReportCardHandlers(): void {
    ipcMain.handle('reportcard:getSubjects', async () => {
        return service.getSubjects()
    })

    ipcMain.handle('reportcard:getStudentGrades', async (
        _event: IpcMainInvokeEvent,
        studentId: number,
        academicYearId: number,
        termId: number
    ) => {
        return service.getStudentGrades(studentId, academicYearId, termId)
    })

    ipcMain.handle('reportcard:generate', async (
        _event: IpcMainInvokeEvent,
        studentId: number,
        academicYearId: number,
        termId: number
    ) => {
        return service.generateReportCard(studentId, academicYearId, termId)
    })

    ipcMain.handle('reportcard:getStudentsForGeneration', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        academicYearId: number,
        termId: number
    ) => {
        return service.getStudentsForReportCards(streamId, academicYearId, termId)
    })
}
