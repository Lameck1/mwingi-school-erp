import { ipcMain } from '../../electron-env';
import { MeritListService } from '../../services/academic/MeritListService';

const service = new MeritListService();

export function registerMeritListHandlers() {
  ipcMain.handle('merit-list:generate', async (_event, options: any) => {
    try {
      return await service.generateMeritList(options);
    } catch (error) {
      throw new Error(`Failed to generate merit list: ${(error as Error).message}`);
    }
  });

  // Broken handlers commented out until fixed/needed
  /*
  ipcMain.handle('merit-list:getClass', async (_event, examId: number, streamId: number) => {
    try {
      // Missing required args: academicYearId, termId, userId
      return await service.generateClassMeritList(0, 0, streamId, examId, 1);
    } catch (error) {
      throw new Error(`Failed to get class merit list: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('merit-list:getSubject', async (_event, subjectId: number, examId: number) => {
    try {
      // Missing streamId argument
      return await service.getSubjectMeritList(examId, subjectId, 0);
    } catch (error) {
      throw new Error(`Failed to get subject merit list: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('merit-list:getImprovement', async (_event, studentId: number) => {
    try {
      // Missing required args
      return await service.calculatePerformanceImprovements(0, 0, 0, undefined);
    } catch (error) {
      throw new Error(`Failed to get improvement: ${(error as Error).message}`);
    }
  });
  */
}