import { getDatabase } from '../../database'
import { ipcMain } from '../../electron-env'
import { BoardingCostService } from '../../services/operations/BoardingCostService'
import { TransportCostService } from '../../services/operations/TransportCostService'

import type { IpcMainInvokeEvent } from 'electron'

type BoardingExpenseInput = Parameters<BoardingCostService['recordBoardingExpense']>[0]
type TransportRouteInput = Parameters<TransportCostService['createRoute']>[0]
type TransportExpenseInput = Parameters<TransportCostService['recordTransportExpense']>[0]

export const registerOperationsHandlers = () => {
  const db = getDatabase()
  const boardingService = new BoardingCostService(db)
  const transportService = new TransportCostService(db)

  // Boarding Handlers
  ipcMain.handle('operations:boarding:getAllFacilities', (_event: IpcMainInvokeEvent) => {
    return boardingService.getAllFacilities()
  })

  ipcMain.handle('operations:boarding:getActiveFacilities', (_event: IpcMainInvokeEvent) => {
    return boardingService.getActiveFacilities()
  })

  ipcMain.handle('operations:boarding:recordExpense', (_event: IpcMainInvokeEvent, params: BoardingExpenseInput) => {
    return boardingService.recordBoardingExpense(params)
  })

  ipcMain.handle('operations:boarding:getExpenses', (_event: IpcMainInvokeEvent, facilityId: number, fiscalYear: number, term?: number) => {
    return boardingService.getFacilityExpenses(facilityId, fiscalYear, term)
  })

  ipcMain.handle('operations:boarding:getExpenseSummary', (_event: IpcMainInvokeEvent, facilityId: number, fiscalYear: number, term?: number) => {
    return boardingService.getExpenseSummaryByType(facilityId, fiscalYear, term)
  })

  // Transport Handlers
  ipcMain.handle('operations:transport:getAllRoutes', (_event: IpcMainInvokeEvent) => {
    return transportService.getAllRoutes()
  })

  ipcMain.handle('operations:transport:getActiveRoutes', (_event: IpcMainInvokeEvent) => {
    return transportService.getActiveRoutes()
  })

  ipcMain.handle('operations:transport:createRoute', (_event: IpcMainInvokeEvent, params: TransportRouteInput) => {
    return transportService.createRoute(params)
  })

  ipcMain.handle('operations:transport:recordExpense', (_event: IpcMainInvokeEvent, params: TransportExpenseInput) => {
    return transportService.recordTransportExpense(params)
  })

  ipcMain.handle('operations:transport:getExpenses', (_event: IpcMainInvokeEvent, routeId: number, fiscalYear: number, term?: number) => {
    return transportService.getRouteExpenses(routeId, fiscalYear, term)
  })

  ipcMain.handle('operations:transport:getExpenseSummary', (_event: IpcMainInvokeEvent, routeId: number, fiscalYear: number, term?: number) => {
    return transportService.getExpenseSummaryByType(routeId, fiscalYear, term)
  })
}
