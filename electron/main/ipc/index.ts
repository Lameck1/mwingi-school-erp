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
import { registerBudgetHandlers } from './finance/budget-handlers'
import { registerBankReconciliationHandlers } from './finance/bank-handlers'
import { registerApprovalHandlers } from './workflow/approval-handlers'
import { registerPromotionHandlers } from './academic/promotion-handlers'
import { registerAttendanceHandlers } from './academic/attendance-handlers'
import { registerReportCardHandlers } from './academic/reportcard-handlers'
import { registerAcademicSystemHandlers } from './academic/academic-system-handlers'
import { registerNotificationHandlers } from './notifications/notification-handlers'
import { registerReportSchedulerHandlers } from './reports/scheduler-handlers'
import { registerDataImportHandlers } from './data/import-handlers'
import { registerFixedAssetHandlers } from './finance/fixed-asset-handlers'
import { registerHireHandlers } from './hire/hire-handlers'
import { registerExemptionHandlers } from './exemption/exemption-handlers'
import { registerMeritListHandlers } from './academic/merit-list-handlers'
import { registerAwardsHandlers } from './academic/awards-handlers'

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
    registerBudgetHandlers()
    registerBankReconciliationHandlers()
    registerApprovalHandlers()
    registerPromotionHandlers()
    registerAttendanceHandlers()
    registerAcademicSystemHandlers()
    registerReportCardHandlers()
    registerNotificationHandlers()
    registerReportSchedulerHandlers()
    registerDataImportHandlers()
    registerFixedAssetHandlers()
    registerHireHandlers()
    registerExemptionHandlers()
    registerMeritListHandlers()
    registerAwardsHandlers()
}


