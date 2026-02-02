import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { container } from '../../services/base/ServiceContainer'
import { BudgetService, BudgetFilters, CreateBudgetData } from '../../services/finance/BudgetService'

export function registerBudgetHandlers(): void {
    ipcMain.handle('budget:getAll', async (_event: IpcMainInvokeEvent, filters: BudgetFilters = {}) => {
        const service = container.resolve<BudgetService>('BudgetService')
        return service.findAll(filters)
    })

    ipcMain.handle('budget:getById', async (_event: IpcMainInvokeEvent, id: number) => {
        const service = container.resolve<BudgetService>('BudgetService')
        return service.getBudgetWithLineItems(id)
    })

    ipcMain.handle('budget:create', async (_event: IpcMainInvokeEvent, data: CreateBudgetData, userId: number) => {
        const service = container.resolve<BudgetService>('BudgetService')
        return service.create(data, userId)
    })

    ipcMain.handle('budget:update', async (_event: IpcMainInvokeEvent, id: number, data: Partial<CreateBudgetData>, userId: number) => {
        const service = container.resolve<BudgetService>('BudgetService')
        return service.update(id, data, userId)
    })

    ipcMain.handle('budget:submit', async (_event: IpcMainInvokeEvent, budgetId: number, userId: number) => {
        const service = container.resolve<BudgetService>('BudgetService')
        return service.submitForApproval(budgetId, userId)
    })

    ipcMain.handle('budget:approve', async (_event: IpcMainInvokeEvent, budgetId: number, userId: number) => {
        const service = container.resolve<BudgetService>('BudgetService')
        return service.approve(budgetId, userId)
    })
}
