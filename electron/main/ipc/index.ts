import { registerAcademicHandlers } from './academic/academic-handlers'
import { registerAcademicSystemHandlers } from './academic/academic-system-handlers'
import { registerAttendanceHandlers } from './academic/attendance-handlers'
import { registerAwardsHandlers } from './academic/awards-handlers'
// Previously unregistered handler modules (audit fix)
import { registerCBCHandlers } from './academic/cbc-handlers'
import { registerExamAnalysisHandlers } from './academic/exam-analysis-handlers'
import { registerJSSHandlers } from './academic/jss-handlers'
import { registerMeritListHandlers } from './academic/merit-list-handlers'
import { registerPerformanceAnalysisHandlers } from './academic/performance-analysis-handlers'
import { registerPromotionHandlers } from './academic/promotion-handlers'
import { registerReportCardAnalyticsHandlers } from './academic/report-card-analytics-handlers'
import { registerReportCardHandlers } from './academic/reportcard-handlers'
import { registerAuditHandlers } from './audit/audit-handlers'
import { registerAuthHandlers } from './auth/auth-handlers'
import { registerBackupHandlers } from './backup/backup-handlers'
import { registerDataImportHandlers } from './data/import-handlers'
import { registerExemptionHandlers } from './exemption/exemption-handlers'
import { registerFinanceApprovalHandlers } from './finance/approval-handlers'
import { registerBankReconciliationHandlers } from './finance/bank-handlers'
import { registerBudgetHandlers } from './finance/budget-handlers'
import { registerFinanceHandlers } from './finance/finance-handlers'
import { registerFixedAssetHandlers } from './finance/fixed-asset-handlers'
import { registerGLAccountHandlers } from './finance/gl-account-handlers'
import { registerOpeningBalanceHandlers } from './finance/opening-balance-handlers'
import { registerReconciliationAndBudgetHandlers } from './finance/reconciliation-budget-handlers'
import { registerHireHandlers } from './hire/hire-handlers'
import { registerInventoryHandlers } from './inventory/inventory-handlers'
import { registerMessageHandlers } from './messaging/message-handlers'
import { registerNotificationHandlers } from './notifications/notification-handlers'
import { registerCbcOperationsHandlers } from './operations/cbc-operations-handlers'
import { registerOperationsHandlers } from './operations/operations-handlers'
import { registerPayrollHandlers } from './payroll/payroll-handlers'
import { registerFinancialReportsHandlers } from './reports/financial-reports-handlers'
import { registerReportsHandlers } from './reports/reports-handlers'
import { registerReportSchedulerHandlers } from './reports/scheduler-handlers'
import { registerSettingsHandlers } from './settings/settings-handlers'
import { registerStaffHandlers } from './staff/staff-handlers'
import { registerStudentHandlers } from './student/student-handlers'
import { registerTransactionsHandlers } from './transactions/transactions-handlers'
import { registerApprovalHandlers } from './workflow/approval-handlers'

const IPC_HANDLER_REGISTRARS: ReadonlyArray<() => void> = [
    registerAuthHandlers,
    registerAcademicHandlers,
    registerStudentHandlers,
    registerFinanceHandlers,
    registerStaffHandlers,
    registerInventoryHandlers,
    registerReportsHandlers,
    registerSettingsHandlers,
    registerTransactionsHandlers,
    registerPayrollHandlers,
    registerAuditHandlers,
    registerBackupHandlers,
    registerMessageHandlers,
    registerBudgetHandlers,
    registerBankReconciliationHandlers,
    registerApprovalHandlers,
    registerPromotionHandlers,
    registerAttendanceHandlers,
    registerAcademicSystemHandlers,
    registerReportCardHandlers,
    registerNotificationHandlers,
    registerReportSchedulerHandlers,
    registerDataImportHandlers,
    registerFixedAssetHandlers,
    registerHireHandlers,
    registerExemptionHandlers,
    registerMeritListHandlers,
    registerAwardsHandlers,
    registerGLAccountHandlers,
    registerOpeningBalanceHandlers,
    registerReconciliationAndBudgetHandlers,
    registerExamAnalysisHandlers,
    registerPerformanceAnalysisHandlers,
    registerReportCardAnalyticsHandlers,
    registerCBCHandlers,
    registerJSSHandlers,
    registerOperationsHandlers,
    registerCbcOperationsHandlers,
    registerFinanceApprovalHandlers,
    registerFinancialReportsHandlers
]

export function registerAllIpcHandlers(): void {
    for (const registerHandlers of IPC_HANDLER_REGISTRARS) {
        registerHandlers()
    }
}


