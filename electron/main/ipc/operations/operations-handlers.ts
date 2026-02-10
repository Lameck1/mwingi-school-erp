import { getDatabase } from '../../database'
import { ipcMain } from '../../electron-env'
import { BoardingCostService } from '../../services/operations/BoardingCostService'
import { TransportCostService } from '../../services/operations/TransportCostService'

export const registerOperationsHandlers = () => {
  const db = getDatabase()
  const boardingService = new BoardingCostService(db)
  const transportService = new TransportCostService(db)

  // Boarding Handlers
  ipcMain.handle('operations:boarding:getAllFacilities', () => {
    return boardingService.getAllFacilities()
  })

  ipcMain.handle('operations:boarding:getActiveFacilities', () => {
    return boardingService.getActiveFacilities()
  })

  ipcMain.handle('operations:boarding:recordExpense', (_event, params) => {
    return boardingService.recordBoardingExpense(params)
  })

  ipcMain.handle('operations:boarding:getExpenses', (_event, facilityId, fiscalYear, term) => {
    return boardingService.getFacilityExpenses(facilityId, fiscalYear, term)
  })

  ipcMain.handle('operations:boarding:getExpenseSummary', (_event, facilityId, fiscalYear, term) => {
    return boardingService.getExpenseSummaryByType(facilityId, fiscalYear, term)
  })

  // Transport Handlers
  ipcMain.handle('operations:transport:getAllRoutes', () => {
    return transportService.getAllRoutes()
  })

  ipcMain.handle('operations:transport:getActiveRoutes', () => {
    return transportService.getActiveRoutes()
  })

  ipcMain.handle('operations:transport:createRoute', (_event, params) => {
    return transportService.createRoute(params)
  })

  ipcMain.handle('operations:transport:recordExpense', (_event, params) => {
    return transportService.recordTransportExpense(params)
  })

  ipcMain.handle('operations:transport:getExpenses', (_event, routeId, fiscalYear, term) => {
    return transportService.getRouteExpenses(routeId, fiscalYear, term)
  })

  ipcMain.handle('operations:transport:getExpenseSummary', (_event, routeId, fiscalYear, term) => {
    return transportService.getExpenseSummaryByType(routeId, fiscalYear, term)
  })
}
