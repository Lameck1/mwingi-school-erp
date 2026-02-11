import { ipcMain } from '../../electron-env';
import { MeritListService } from '../../services/academic/MeritListService';

import type { IpcMainInvokeEvent } from 'electron';

let cachedService: MeritListService | null = null;
const getService = () => {
  cachedService ??= new MeritListService();
  return cachedService;
};

export function registerMeritListHandlers() {
  ipcMain.handle('merit-list:generate', async (_event: IpcMainInvokeEvent, options: { academicYearId: number; termId: number; streamId: number }) => {
    try {
      return await getService().generateMeritList(options);
    } catch (error) {
      throw new Error(`Failed to generate merit list: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('merit-list:getClass', async (_event: IpcMainInvokeEvent, examId: number, streamId: number) => {
    try {
      // Get academic year and term from exam
      const service = getService();
      // We need to fetch exam details to get academic year, term for the class merit list
      // For now, use a simplified approach that matches what the preload expects
      return await service.generateClassMeritList(0, 0, streamId, examId, 1);
    } catch (error) {
      throw new Error(`Failed to generate class merit list: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('merit-list:getImprovement', async () => {
    // Get student's performance improvement over recent terms
    // This would need to query student's term-over-term performance
    // Return empty array if no comparison data available
    return [];
  });

  ipcMain.handle('merit-list:getSubject', async (_event: IpcMainInvokeEvent, payload: { examId: number; subjectId: number; streamId: number }) => {
    try {
      return await getService().getSubjectMeritList(payload.examId, payload.subjectId, payload.streamId);
    } catch (error) {
      throw new Error(`Failed to get subject merit list: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('merit-list:getSubjectDifficulty', async (_event: IpcMainInvokeEvent, payload: { examId: number; subjectId: number; streamId: number }) => {
    try {
      return await getService().getSubjectDifficulty(payload.examId, payload.subjectId, payload.streamId);
    } catch (error) {
      throw new Error(`Failed to get subject difficulty: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('merit-list:getMostImproved', async (_event: IpcMainInvokeEvent, payload: {
    academicYearId: number;
    currentTermId: number;
    comparisonTermId: number;
    streamId?: number;
    minimumImprovement?: number;
  }) => {
    try {
      const results = await getService().calculatePerformanceImprovements(
        payload.academicYearId,
        payload.currentTermId,
        payload.comparisonTermId,
        payload.streamId
      );
      const threshold = payload.minimumImprovement ?? 0;
      return results.filter(r => r.improvement_percentage >= threshold);
    } catch (error) {
      throw new Error(`Failed to get most improved students: ${(error as Error).message}`);
    }
  });
}
