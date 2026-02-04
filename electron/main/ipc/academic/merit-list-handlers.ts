import { ipcMain } from '../../electron-env';
import { MeritListService } from '../../services/academic/MeritListService';

const service = new MeritListService();

export function registerMeritListHandlers() {
  ipcMain.handle('merit-list:generate', async (_event, examId: number) => {
    try {
      return await service.generateMeritList(examId);
    } catch (error) {
      throw new Error(`Failed to generate merit list: ${error.message}`);
    }
  });

  ipcMain.handle('merit-list:getClass', async (_event, examId: number, streamId: number) => {
    try {
      return await service.generateClassMeritList(examId, streamId);
    } catch (error) {
      throw new Error(`Failed to get class merit list: ${error.message}`);
    }
  });

  ipcMain.handle('merit-list:getSubject', async (_event, subjectId: number, examId: number) => {
    try {
      return await service.getSubjectMeritList(subjectId, examId);
    } catch (error) {
      throw new Error(`Failed to get subject merit list: ${error.message}`);
    }
  });

  ipcMain.handle('merit-list:getImprovement', async (_event, studentId: number) => {
    try {
      return await service.calculatePerformanceImprovements(studentId);
    } catch (error) {
      throw new Error(`Failed to get improvement: ${error.message}`);
    }
  });
}