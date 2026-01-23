import { registerAuthHandlers } from './auth/auth-handlers'
import { registerAcademicHandlers } from './academic/academic-handlers'
import { registerStudentHandlers } from './student/student-handlers'
import { registerFinanceHandlers } from './finance/finance-handlers'
import { registerStaffHandlers } from './staff/staff-handlers'
import { registerInventoryHandlers } from './inventory/inventory-handlers'
import { registerReportsHandlers } from './reports/reports-handlers'
import { registerSettingsHandlers } from './settings/settings-handlers'
import { registerTransactionsHandlers } from './transactions/transactions-handlers'
import { registerPayrollHandlers } from './payroll/payroll-handlers'
import { registerAuditHandlers } from './audit/audit-handlers'
import { registerBackupHandlers } from './backup/backup-handlers'
import { registerMessageHandlers } from './messaging/message-handlers'

export function registerAllIpcHandlers(): void {
    registerAuthHandlers()
    registerAcademicHandlers()
    registerStudentHandlers()
    registerFinanceHandlers()
    registerStaffHandlers()
    registerInventoryHandlers()
    registerReportsHandlers()
    registerSettingsHandlers()
    registerTransactionsHandlers()
    registerPayrollHandlers()
    registerAuditHandlers()
    registerBackupHandlers()
    registerMessageHandlers()
}


