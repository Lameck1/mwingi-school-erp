import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Auth
    login: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),
    changePassword: (userId: number, oldPassword: string, newPassword: string) =>
        ipcRenderer.invoke('auth:changePassword', userId, oldPassword, newPassword),

    // Settings
    getSettings: () => ipcRenderer.invoke('settings:get'),
    updateSettings: (data: any) => ipcRenderer.invoke('settings:update', data),

    // Academic Year & Terms
    getAcademicYears: () => ipcRenderer.invoke('academicYear:getAll'),
    getCurrentAcademicYear: () => ipcRenderer.invoke('academicYear:getCurrent'),
    createAcademicYear: (data: any) => ipcRenderer.invoke('academicYear:create', data),
    getTermsByYear: (yearId: number) => ipcRenderer.invoke('term:getByYear', yearId),
    getCurrentTerm: () => ipcRenderer.invoke('term:getCurrent'),

    // Streams
    getStreams: () => ipcRenderer.invoke('stream:getAll'),

    // Fee Categories
    getFeeCategories: () => ipcRenderer.invoke('feeCategory:getAll'),

    // Students
    getStudents: (filters?: any) => ipcRenderer.invoke('student:getAll', filters),
    getStudentById: (id: number) => ipcRenderer.invoke('student:getById', id),
    createStudent: (data: any) => ipcRenderer.invoke('student:create', data),
    updateStudent: (id: number, data: any) => ipcRenderer.invoke('student:update', id, data),
    getStudentBalance: (studentId: number) => ipcRenderer.invoke('student:getBalance', studentId),

    // Payments
    recordPayment: (data: any, userId: number) => ipcRenderer.invoke('payment:record', data, userId),
    getPaymentsByStudent: (studentId: number) => ipcRenderer.invoke('payment:getByStudent', studentId),

    // Invoices
    createInvoice: (data: any, items: any[], userId: number) => ipcRenderer.invoke('invoice:create', data, items, userId),
    getInvoicesByStudent: (studentId: number) => ipcRenderer.invoke('invoice:getByStudent', studentId),

    // Staff
    getStaff: (activeOnly?: boolean) => ipcRenderer.invoke('staff:getAll', activeOnly),
    createStaff: (data: any) => ipcRenderer.invoke('staff:create', data),

    // Payroll
    runPayroll: (month: number, year: number, userId: number) => ipcRenderer.invoke('payroll:run', month, year, userId),
    getPayrollHistory: () => ipcRenderer.invoke('payroll:getHistory'),

    // Inventory
    getInventory: () => ipcRenderer.invoke('inventory:getAll'),
    getLowStockItems: () => ipcRenderer.invoke('inventory:getLowStock'),
    getInventoryCategories: () => ipcRenderer.invoke('inventory:getCategories'),
    createInventoryItem: (data: any) => ipcRenderer.invoke('inventory:createItem', data),
    updateInventoryItem: (id: number, data: any) => ipcRenderer.invoke('inventory:updateItem', id, data),
    recordStockMovement: (data: any, userId: number) => ipcRenderer.invoke('inventory:recordMovement', data, userId),

    // Reports
    getFeeCollectionReport: (startDate: string, endDate: string) =>
        ipcRenderer.invoke('report:feeCollection', startDate, endDate),
    getDefaultersReport: (termId?: number) => ipcRenderer.invoke('report:defaulters', termId),
    getDashboardData: () => ipcRenderer.invoke('report:dashboard'),

    // Backup
    createBackup: () => ipcRenderer.invoke('backup:create'),
    restoreBackup: () => ipcRenderer.invoke('backup:restore'),

    // Users
    getUsers: () => ipcRenderer.invoke('user:getAll'),
    createUser: (data: any) => ipcRenderer.invoke('user:create', data),

    // Audit
    getAuditLog: (limit?: number) => ipcRenderer.invoke('audit:getAll', limit),
})

// Type definitions for the renderer process
declare global {
    interface Window {
        electronAPI: {
            login: (username: string, password: string) => Promise<any>
            changePassword: (userId: number, oldPassword: string, newPassword: string) => Promise<any>
            getSettings: () => Promise<any>
            updateSettings: (data: any) => Promise<any>
            getAcademicYears: () => Promise<any[]>
            getCurrentAcademicYear: () => Promise<any>
            createAcademicYear: (data: any) => Promise<any>
            getTermsByYear: (yearId: number) => Promise<any[]>
            getCurrentTerm: () => Promise<any>
            getStreams: () => Promise<any[]>
            getFeeCategories: () => Promise<any[]>
            getStudents: (filters?: any) => Promise<any[]>
            getStudentById: (id: number) => Promise<any>
            createStudent: (data: any) => Promise<any>
            updateStudent: (id: number, data: any) => Promise<any>
            getStudentBalance: (studentId: number) => Promise<number>
            recordPayment: (data: any, userId: number) => Promise<any>
            getPaymentsByStudent: (studentId: number) => Promise<any[]>
            createInvoice: (data: any, items: any[], userId: number) => Promise<any>
            getInvoicesByStudent: (studentId: number) => Promise<any[]>
            getStaff: (activeOnly?: boolean) => Promise<any[]>
            createStaff: (data: any) => Promise<any>
            runPayroll: (month: number, year: number, userId: number) => Promise<any>
            getPayrollHistory: () => Promise<any[]>
            getInventory: () => Promise<any[]>
            getLowStockItems: () => Promise<any[]>
            getInventoryCategories: () => Promise<any[]>
            createInventoryItem: (data: any) => Promise<any>
            updateInventoryItem: (id: number, data: any) => Promise<any>
            recordStockMovement: (data: any, userId: number) => Promise<any>
            getFeeCollectionReport: (startDate: string, endDate: string) => Promise<any[]>
            getDefaultersReport: (termId?: number) => Promise<any[]>
            getDashboardData: () => Promise<any>
            createBackup: () => Promise<any>
            restoreBackup: () => Promise<any>
            getUsers: () => Promise<any[]>
            createUser: (data: any) => Promise<any>
            updateUser: (id: number, data: any) => Promise<any>
            toggleUserStatus: (id: number, isActive: boolean) => Promise<any>
            resetUserPassword: (id: number, password: string) => Promise<any>
            getAuditLog: (limit?: number) => Promise<any[]>
        }
    }
}
