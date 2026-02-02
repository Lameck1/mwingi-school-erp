import { ipcMain } from '../../electron-env'
import { AcademicSystemService } from '../../services/academic/AcademicSystemService'

const service = new AcademicSystemService()

export function registerAcademicSystemHandlers(): void {
    ipcMain.handle('academic:getSubjects', async () => {
        return service.getAllSubjects()
    })

    ipcMain.handle('academic:getExams', async (_event: any, academicYearId: number, termId: number) => {
        return service.getAllExams(academicYearId, termId)
    })

    ipcMain.handle('academic:createExam', async (_event: any, data: any, userId: number) => {
        return service.createExam(data, userId)
    })

    ipcMain.handle('academic:deleteExam', async (_event: any, id: number, userId: number) => {
        return service.deleteExam(id, userId)
    })

    ipcMain.handle('academic:allocateTeacher', async (_event: any, data: any, userId: number) => {
        return service.allocateTeacher(data, userId)
    })

    ipcMain.handle('academic:getAllocations', async (_event: any, academicYearId: number, termId: number, streamId?: number) => {
        return service.getAllocations(academicYearId, termId, streamId)
    })

    ipcMain.handle('academic:saveResults', async (_event: any, examId: number, results: any[], userId: number) => {
        return service.saveResults(examId, results, userId)
    })

    ipcMain.handle('academic:getResults', async (_event: any, examId: number, subjectId: number, streamId: number, userId: number) => {
        return service.getResults(examId, subjectId, streamId, userId)
    })

    ipcMain.handle('academic:processResults', async (_event: any, examId: number, userId: number) => {
        return service.processResults(examId, userId)
    })
}
