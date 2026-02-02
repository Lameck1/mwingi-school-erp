import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { reportScheduler, ScheduledReport } from '../../services/reports/ReportScheduler'

// Initialize scheduler
reportScheduler.initialize()

export function registerReportSchedulerHandlers(): void {
    ipcMain.handle('scheduler:getAll', async () => {
        return reportScheduler.getScheduledReports()
    })

    ipcMain.handle('scheduler:create', async (
        _event: IpcMainInvokeEvent,
        data: Omit<ScheduledReport, 'id' | 'last_run_at' | 'next_run_at' | 'created_at'>,
        userId: number
    ) => {
        return reportScheduler.createSchedule(data, userId)
    })

    ipcMain.handle('scheduler:update', async (
        _event: IpcMainInvokeEvent,
        id: number,
        data: Partial<ScheduledReport>,
        userId: number
    ) => {
        return reportScheduler.updateSchedule(id, data, userId)
    })

    ipcMain.handle('scheduler:delete', async (_event: IpcMainInvokeEvent, id: number, userId: number) => {
        return reportScheduler.deleteSchedule(id, userId)
    })
}
