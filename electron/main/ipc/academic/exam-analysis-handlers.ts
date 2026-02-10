import { ipcMain } from '../../electron-env';
import { ExamAnalysisService } from '../../services/academic/ExamAnalysisService';

import type { IpcMainInvokeEvent } from 'electron';

let cachedService: ExamAnalysisService | null = null;
const getService = () => {
  cachedService ??= new ExamAnalysisService();
  return cachedService;
};

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const UNKNOWN_ERROR = 'Unknown error';

export function registerExamAnalysisHandlers() {
  ipcMain.handle('exam-analysis:getSubjectAnalysis', async (_event: IpcMainInvokeEvent, subjectId: number, examId: number) => {
    try {
      return await getService().getSubjectAnalysis(examId, subjectId);
    } catch (error) {
      throw new Error(`Failed to analyze subject: ${getErrorMessage(error, UNKNOWN_ERROR)}`);
    }
  });

  ipcMain.handle('exam-analysis:analyzeAllSubjects', async (_event: IpcMainInvokeEvent, examId: number) => {
    try {
      return await getService().analyzeAllSubjects(examId);
    } catch (error) {
      throw new Error(`Failed to analyze all subjects: ${getErrorMessage(error, UNKNOWN_ERROR)}`);
    }
  });

  ipcMain.handle(
    'exam-analysis:getTeacherPerf',
    async (_event: IpcMainInvokeEvent, teacherId: number, academicYearId: number, termId: number) => {
    try {
      return await getService().getTeacherPerformance(teacherId, academicYearId, termId);
    } catch (error) {
      throw new Error(`Failed to get teacher performance: ${getErrorMessage(error, UNKNOWN_ERROR)}`);
    }
  });

  ipcMain.handle('exam-analysis:getStudentPerf', async (_event: IpcMainInvokeEvent, studentId: number, examId: number) => {
    try {
      return await getService().getStudentPerformance(studentId, examId);
    } catch (error) {
      throw new Error(`Failed to get student performance: ${getErrorMessage(error, UNKNOWN_ERROR)}`);
    }
  });

  ipcMain.handle('exam-analysis:getStruggling', async (_event: IpcMainInvokeEvent, examId: number, threshold?: number) => {
    try {
      return await getService().getStrugglingStudents(examId, threshold ?? 50);
    } catch (error) {
      throw new Error(`Failed to get struggling students: ${getErrorMessage(error, UNKNOWN_ERROR)}`);
    }
  });
}
