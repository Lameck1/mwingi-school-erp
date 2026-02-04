import { ipcMain } from '../../electron-env';
import { PerformanceAnalysisService } from '../../services/academic/PerformanceAnalysisService';

const service = new PerformanceAnalysisService();

export function registerPerformanceAnalysisHandlers() {
  ipcMain.handle('performance:getMostImproved', async (_event, params: {
    term1Id: number;
    term2Id: number;
    minThreshold?: number;
  }) => {
    try {
      return await service.getMostImprovedStudents(
        params.term1Id,
        params.term2Id,
        params.minThreshold ?? 5
      );
    } catch (error) {
      throw new Error(`Failed to get most improved students: ${error.message}`);
    }
  });

  ipcMain.handle('performance:getComparison', async (_event, studentId: number, term1Id: number, term2Id: number) => {
    try {
      return await service.getStudentPerformanceComparison(studentId, term1Id, term2Id);
    } catch (error) {
      throw new Error(`Failed to get performance comparison: ${error.message}`);
    }
  });

  ipcMain.handle('performance:getStruggling', async (_event, examId: number, threshold?: number) => {
    try {
      return await service.getStrugglingStudents(examId, threshold ?? 50);
    } catch (error) {
      throw new Error(`Failed to get struggling students: ${error.message}`);
    }
  });

  ipcMain.handle('performance:getTrends', async (_event, studentId: number, numTerms?: number) => {
    try {
      return await service.getPerformanceTrends(studentId, numTerms ?? 3);
    } catch (error) {
      throw new Error(`Failed to get performance trends: ${error.message}`);
    }
  });
}
