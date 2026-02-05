import { ipcMain } from '../../electron-env'
import { IpcMainInvokeEvent } from 'electron'
import {
    AcademicSystemService,
    CreateExamDTO,
    SubjectAllocation,
    ExamResult
} from '../../services/academic/AcademicSystemService'

const service = new AcademicSystemService()

export function registerAcademicSystemHandlers(): void {
    ipcMain.handle('academic:getSubjects', async () => {
        return service.getAllSubjects()
    })

    ipcMain.handle('academic:getExams', async (_event: IpcMainInvokeEvent, academicYearId: number, termId: number) => {
        return service.getAllExams(academicYearId, termId)
    })

    ipcMain.handle('academic:createExam', async (_event: IpcMainInvokeEvent, data: unknown, userId: number) => {
        return service.createExam(data as CreateExamDTO, userId)
    })

    ipcMain.handle('academic:deleteExam', async (_event: IpcMainInvokeEvent, id: number, userId: number) => {
        return service.deleteExam(id, userId)
    })

    ipcMain.handle('academic:allocateTeacher', async (_event: IpcMainInvokeEvent, data: unknown, userId: number) => {
        return service.allocateTeacher(data as Omit<SubjectAllocation, 'id'>, userId)
    })

    ipcMain.handle('academic:getAllocations', async (_event: IpcMainInvokeEvent, academicYearId: number, termId: number, streamId?: number) => {
        return service.getAllocations(academicYearId, termId, streamId)
    })

    ipcMain.handle('academic:saveResults', async (_event: IpcMainInvokeEvent, examId: number, results: unknown[], userId: number) => {
        return service.saveResults(examId, results as Omit<ExamResult, 'id' | 'exam_id'>[], userId)
    })

    ipcMain.handle('academic:getResults', async (_event: IpcMainInvokeEvent, examId: number, subjectId: number, streamId: number, userId: number) => {
        return service.getResults(examId, subjectId, streamId, userId)
    })

    ipcMain.handle('academic:processResults', async (_event: IpcMainInvokeEvent, examId: number, userId: number) => {
        return service.processResults(examId, userId)
    })
}
