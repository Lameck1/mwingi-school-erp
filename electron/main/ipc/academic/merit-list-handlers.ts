import { ipcMain } from '../../electron-env';
import { MeritListService } from '../../services/academic/MeritListService';

let cachedService: MeritListService | null = null;
const getService = () => {
  if (!cachedService) {
    cachedService = new MeritListService();
  }
  return cachedService;
};

export function registerMeritListHandlers() {
  ipcMain.handle('merit-list:generate', async (_event, options: { academicYearId: number; termId: number; streamId: number }) => {
    try {
      return await getService().generateMeritList(options);
    } catch (error) {
      throw new Error(`Failed to generate merit list: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('merit-list:getSubject', async (_event, payload: { examId: number; subjectId: number; streamId: number }) => {
    try {
      return await getService().getSubjectMeritList(payload.examId, payload.subjectId, payload.streamId);
    } catch (error) {
      throw new Error(`Failed to get subject merit list: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('merit-list:getSubjectDifficulty', async (_event, payload: { examId: number; subjectId: number; streamId: number }) => {
    try {
      return await getService().getSubjectDifficulty(payload.examId, payload.subjectId, payload.streamId);
    } catch (error) {
      throw new Error(`Failed to get subject difficulty: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('merit-list:getMostImproved', async (_event, payload: {
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
