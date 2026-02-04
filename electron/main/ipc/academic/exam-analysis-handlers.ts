import { ipcMain } from '../../electron-env';
import { ExamAnalysisService } from '../../services/academic/ExamAnalysisService';

const service = new ExamAnalysisService();

export function registerExamAnalysisHandlers() {
  ipcMain.handle('exam-analysis:getSubjectAnalysis', async (_event, subjectId: number, examId: number) => {
    try {
      return await service.getSubjectAnalysis(subjectId, examId);
    } catch (error) {
      throw new Error(`Failed to analyze subject: ${error.message}`);
    }
  });

  ipcMain.handle('exam-analysis:analyzeAllSubjects', async (_event, examId: number) => {
    try {
      return await service.analyzeAllSubjects(examId);
    } catch (error) {
      throw new Error(`Failed to analyze all subjects: ${error.message}`);
    }
  });

  ipcMain.handle('exam-analysis:getTeacherPerf', async (_event, teacherId: number, examId?: number) => {
    try {
      return await service.getTeacherPerformance(teacherId, examId);
    } catch (error) {
      throw new Error(`Failed to get teacher performance: ${error.message}`);
    }
  });

  ipcMain.handle('exam-analysis:getStudentPerf', async (_event, studentId: number, examId: number) => {
    try {
      return await service.getStudentPerformance(studentId, examId);
    } catch (error) {
      throw new Error(`Failed to get student performance: ${error.message}`);
    }
  });

  ipcMain.handle('exam-analysis:getStruggling', async (_event, examId: number, threshold?: number) => {
    try {
      return await service.getStrugglingStudents(examId, threshold ?? 50);
    } catch (error) {
      throw new Error(`Failed to get struggling students: ${error.message}`);
    }
  });
}
