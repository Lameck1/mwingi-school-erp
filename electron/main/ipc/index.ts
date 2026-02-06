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
// Previously unregistered handler modules (audit fix)
import { registerGLAccountHandlers } from './finance/gl-account-handlers'
import { registerOpeningBalanceHandlers } from './finance/opening-balance-handlers'
import { registerReconciliationAndBudgetHandlers } from './finance/reconciliation-budget-handlers'
import { registerExamAnalysisHandlers } from './academic/exam-analysis-handlers'
import { registerPerformanceAnalysisHandlers } from './academic/performance-analysis-handlers'
import { registerReportCardAnalyticsHandlers } from './academic/report-card-analytics-handlers'
import { registerCBCHandlers } from './academic/cbc-handlers'
import { registerJSSHandlers } from './academic/jss-handlers'
import { registerOperationsHandlers } from './operations/operations-handlers'
import { registerCbcOperationsHandlers } from './operations/cbc-operations-handlers'
import { registerFinanceApprovalHandlers } from './finance/approval-handlers'
import { registerFinancialReportsHandlers } from './reports/financial-reports-handlers'

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
    // Previously unregistered handlers (audit fix)
    registerGLAccountHandlers()
    registerOpeningBalanceHandlers()
    registerReconciliationAndBudgetHandlers()
    registerExamAnalysisHandlers()
    registerPerformanceAnalysisHandlers()
    registerReportCardAnalyticsHandlers()
    registerCBCHandlers()
    registerJSSHandlers()
    registerOperationsHandlers()
    registerCbcOperationsHandlers()
    registerFinanceApprovalHandlers()
    registerFinancialReportsHandlers()
}


