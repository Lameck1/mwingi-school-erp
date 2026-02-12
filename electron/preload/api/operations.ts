import { ipcRenderer } from 'electron'

export function createOperationsAPI() {
  return {
    // Inventory
    getInventory: () => ipcRenderer.invoke('inventory:getAll'),
    getLowStockItems: () => ipcRenderer.invoke('inventory:getLowStock'),
    getInventoryCategories: () => ipcRenderer.invoke('inventory:getCategories'),
    createInventoryItem: (data: unknown) => ipcRenderer.invoke('inventory:createItem', data),
    recordStockMovement: (data: unknown, userId: number) => ipcRenderer.invoke('inventory:recordMovement', data, userId),
    getSuppliers: () => ipcRenderer.invoke('inventory:getSuppliers'),

    // Asset Hire
    getHireClients: (filters?: unknown) => ipcRenderer.invoke('hire:getClients', filters),
    getHireClientById: (id: number) => ipcRenderer.invoke('hire:getClientById', id),
    createHireClient: (data: unknown) => ipcRenderer.invoke('hire:createClient', data),
    updateHireClient: (id: number, data: unknown) => ipcRenderer.invoke('hire:updateClient', id, data),
    getHireAssets: (filters?: unknown) => ipcRenderer.invoke('hire:getAssets', filters),
    getHireAssetById: (id: number) => ipcRenderer.invoke('hire:getAssetById', id),
    createHireAsset: (data: unknown) => ipcRenderer.invoke('hire:createAsset', data),
    updateHireAsset: (id: number, data: unknown) => ipcRenderer.invoke('hire:updateAsset', id, data),
    checkHireAvailability: (assetId: number, hireDate: string, returnDate?: string) => ipcRenderer.invoke('hire:checkAvailability', assetId, hireDate, returnDate),
    getHireBookings: (filters?: unknown) => ipcRenderer.invoke('hire:getBookings', filters),
    getHireBookingById: (id: number) => ipcRenderer.invoke('hire:getBookingById', id),
    createHireBooking: (data: unknown, userId: number) => ipcRenderer.invoke('hire:createBooking', data, userId),
    updateHireBookingStatus: (id: number, status: string) => ipcRenderer.invoke('hire:updateBookingStatus', id, status),
    recordHirePayment: (bookingId: number, data: unknown, userId: number) => ipcRenderer.invoke('hire:recordPayment', bookingId, data, userId),
    getHirePaymentsByBooking: (bookingId: number) => ipcRenderer.invoke('hire:getPaymentsByBooking', bookingId),
    getHireStats: () => ipcRenderer.invoke('hire:getStats'),

    // Boarding
    getBoardingFacilities: () => ipcRenderer.invoke('operations:boarding:getAllFacilities'),
    getActiveBoardingFacilities: () => ipcRenderer.invoke('operations:boarding:getActiveFacilities'),
    recordBoardingExpense: (params: unknown) => ipcRenderer.invoke('operations:boarding:recordExpense', params),

    // Transport
    getTransportRoutes: () => ipcRenderer.invoke('operations:transport:getAllRoutes'),
    getActiveTransportRoutes: () => ipcRenderer.invoke('operations:transport:getActiveRoutes'),
    createTransportRoute: (params: unknown) => ipcRenderer.invoke('operations:transport:createRoute', params),
    recordTransportExpense: (params: unknown) => ipcRenderer.invoke('operations:transport:recordExpense', params),

    // Grants
    getGrantsByStatus: (status: string) => ipcRenderer.invoke('operations:grants:getByStatus', status),
    createGrant: (data: unknown, userId: number) => ipcRenderer.invoke('operations:grants:create', data, userId),
    recordGrantUtilization: (payload: {
      grantId: number; amount: number; description: string;
      glAccountCode: string | null; utilizationDate: string; userId: number
    }) => ipcRenderer.invoke('operations:grants:recordUtilization', payload),
    generateNEMISExport: (fiscalYear: number) => ipcRenderer.invoke('operations:grants:generateNEMISExport', fiscalYear),

    // Student Cost Analysis
    calculateStudentCost: (studentId: number, termId: number, academicYearId: number) =>
      ipcRenderer.invoke('operations:studentCost:calculate', studentId, termId, academicYearId),
    getStudentCostVsRevenue: (studentId: number, termId: number) =>
      ipcRenderer.invoke('operations:studentCost:getVsRevenue', studentId, termId),
  }
}
