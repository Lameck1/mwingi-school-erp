/// <reference types="vite/client" />

interface Window {
    electronAPI: {
        // Auth
        login: (username: string, password: string) => Promise<{ success: boolean; user?: any; error?: string }>
        changePassword: (userId: number, oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>

        // Settings
        getSettings: () => Promise<any>
        updateSettings: (data: any) => Promise<{ success: boolean }>

        // Academic Year & Terms
        getAcademicYears: () => Promise<any[]>
        getCurrentAcademicYear: () => Promise<any>
        createAcademicYear: (data: any) => Promise<{ success: boolean; id: number }>
        getTermsByYear: (yearId: number) => Promise<any[]>
        getCurrentTerm: () => Promise<any>

        // Streams
        getStreams: () => Promise<any[]>

        // Fee Categories
        getFeeCategories: () => Promise<any[]>
        createFeeCategory: (name: string, description: string) => Promise<any>

        // Fee Structure
        getFeeStructure: (academicYearId: number, termId: number) => Promise<any[]>
        saveFeeStructure: (data: any[], academicYearId: number, termId: number) => Promise<any>
        generateBatchInvoices: (academicYearId: number, termId: number, userId: number) => Promise<any>
        getInvoices: (filters?: any) => Promise<any[]>

        // Students
        getStudents: (filters?: any) => Promise<any[]>
        getStudentById: (id: number) => Promise<any>
        createStudent: (data: any) => Promise<{ success: boolean; id: number }>
        updateStudent: (id: number, data: any) => Promise<{ success: boolean }>
        getStudentBalance: (studentId: number) => Promise<number>

        // Payments
        recordPayment: (data: any, userId: number) => Promise<{ success: boolean; transactionRef: string; receiptNumber: string }>
        getPaymentsByStudent: (studentId: number) => Promise<any[]>

        // Transactions (General)
        getTransactionCategories: () => Promise<any[]>
        createTransactionCategory: (name: string, type: string) => Promise<any>
        createTransaction: (data: any, userId: number) => Promise<any>
        getTransactions: (filters?: any) => Promise<any[]>
        getTransactionSummary: (startDate: string, endDate: string) => Promise<any[]>

        // Invoices
        createInvoice: (data: any, items: any[], userId: number) => Promise<{ success: boolean; invoiceNumber: string; id: number }>
        getInvoicesByStudent: (studentId: number) => Promise<any[]>
        getInvoiceItems: (invoiceId: number) => Promise<any[]>

        // Staff
        getStaff: (activeOnly?: boolean) => Promise<any[]>
        createStaff: (data: any) => Promise<{ success: boolean; id: number }>

        // Payroll
        runPayroll: (month: number, year: number, userId: number) => Promise<{ success: boolean; results?: any[]; error?: string }>
        getPayrollHistory: () => Promise<any[]>
        getPayrollDetails: (periodId: number) => Promise<any>

        // Inventory
        getInventory: () => Promise<any[]>
        getLowStockItems: () => Promise<any[]>
        getInventoryCategories: () => Promise<any[]>
        createInventoryItem: (data: any) => Promise<{ success: boolean; id: number }>
        updateInventoryItem: (id: number, data: any) => Promise<{ success: boolean }>
        recordStockMovement: (data: any, userId: number) => Promise<{ success: boolean }>

        // Reports
        getFeeCollectionReport: (startDate: string, endDate: string) => Promise<any[]>
        getDefaultersReport: (termId?: number) => Promise<any[]>
        getDashboardData: () => Promise<{
            totalStudents: number
            totalStaff: number
            feeCollected: number
            outstandingBalance: number
        }>

        // Backup
        createBackup: () => Promise<{ success: boolean; path?: string; cancelled?: boolean }>
        restoreBackup: () => Promise<{ success: boolean; message?: string; cancelled?: boolean }>

        // Users
        getUsers: () => Promise<any[]>
        createUser: (data: any) => Promise<{ success: boolean; id: number }>
        updateUser: (id: number, data: any) => Promise<{ success: boolean }>
        toggleUserStatus: (id: number, isActive: boolean) => Promise<{ success: boolean }>
        resetUserPassword: (id: number, password: string) => Promise<{ success: boolean }>

        // Audit
        getAuditLog: (limit?: number) => Promise<any[]>
    }
}
