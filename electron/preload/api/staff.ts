import { ipcRenderer } from 'electron'

import type { StaffData } from '../types'

export function createStaffAPI() {
  return {
    getStaff: (activeOnly?: boolean) => ipcRenderer.invoke('staff:getAll', activeOnly),
    getStaffById: (id: number) => ipcRenderer.invoke('staff:getById', id),
    createStaff: (data: Partial<StaffData>) => ipcRenderer.invoke('staff:create', data),
    updateStaff: (id: number, data: Partial<StaffData>) => ipcRenderer.invoke('staff:update', id, data),
    setStaffActive: (id: number, isActive: boolean) => ipcRenderer.invoke('staff:setActive', id, isActive),
    getStaffAllowances: (staffId: number) => ipcRenderer.invoke('staff:getAllowances', staffId),
    addStaffAllowance: (staffId: number, allowanceName: string, amount: number) => ipcRenderer.invoke('staff:addAllowance', staffId, allowanceName, amount),
    deleteStaffAllowance: (allowanceId: number) => ipcRenderer.invoke('staff:deleteAllowance', allowanceId),

    // Payroll
    getPayrollHistory: () => ipcRenderer.invoke('payroll:getHistory'),
    getPayrollDetails: (periodId: number) => ipcRenderer.invoke('payroll:getDetails', periodId),
    runPayroll: (month: number, year: number, userId: number) => ipcRenderer.invoke('payroll:run', month, year, userId),
    confirmPayroll: (periodId: number, userId: number) => ipcRenderer.invoke('payroll:confirm', periodId, userId),
    markPayrollPaid: (periodId: number, userId: number) => ipcRenderer.invoke('payroll:markPaid', periodId, userId),
    revertPayrollToDraft: (periodId: number, userId: number) => ipcRenderer.invoke('payroll:revertToDraft', periodId, userId),
    deletePayroll: (periodId: number, userId: number) => ipcRenderer.invoke('payroll:delete', periodId, userId),
    recalculatePayroll: (periodId: number, userId: number) => ipcRenderer.invoke('payroll:recalculate', periodId, userId),
  }
}
