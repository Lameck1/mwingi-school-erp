import { ipcMain } from '../../electron-env';
import { PerformanceAnalysisService } from '../../services/academic/PerformanceAnalysisService';

import type { IpcMainInvokeEvent } from 'electron';

let cachedService: PerformanceAnalysisService | null = null;
const getService = () => {
  cachedService ??= new PerformanceAnalysisService();
  return cachedService;
};

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const UNKNOWN_ERROR = 'Unknown error';

export function registerPerformanceAnalysisHandlers() {
  ipcMain.handle('performance:getMostImproved', async (_event: IpcMainInvokeEvent, params: {
    academicYearId: number;
    currentTermId: number;
    comparisonTermId: number;
    streamId?: number;
    minimumImprovement?: number;
  }) => {
    try {
      return await getService().getMostImprovedStudents(params);
    } catch (error) {
      throw new Error(`Failed to get most improved students: ${getErrorMessage(error, UNKNOWN_ERROR)}`);
    }
  });

  ipcMain.handle(
    'performance:getComparison',
    async (_event: IpcMainInvokeEvent, studentId: number, academicYearId: number, currentTermId: number, comparisonTermId: number) => {
    try {
      return await getService().getStudentPerformanceComparison(studentId, academicYearId, currentTermId, comparisonTermId);
    } catch (error) {
      throw new Error(`Failed to get performance comparison: ${getErrorMessage(error, UNKNOWN_ERROR)}`);
    }
  });

  ipcMain.handle('performance:getStruggling', async (_event: IpcMainInvokeEvent, academicYearId: number, termId: number, threshold?: number, streamId?: number) => {
    try {
      return await getService().getStrugglingStudents(academicYearId, termId, threshold ?? 50, streamId);
    } catch (error) {
      throw new Error(`Failed to get struggling students: ${getErrorMessage(error, UNKNOWN_ERROR)}`);
    }
  });

  ipcMain.handle('performance:getTrends', async (_event: IpcMainInvokeEvent, studentId: number, academicYearId: number, numTerms?: number) => {
    try {
      return await getService().getPerformanceTrends(studentId, academicYearId, numTerms ?? 3);
    } catch (error) {
      throw new Error(`Failed to get performance trends: ${getErrorMessage(error, UNKNOWN_ERROR)}`);
    }
  });
}
