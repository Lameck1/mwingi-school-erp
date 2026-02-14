import type { SettingsAPI } from './SettingsAPI'
import type { AcademicAPI } from './AcademicAPI'
import type { StudentAPI } from './StudentAPI'
import type { StaffAPI } from './StaffAPI'
import type { PayrollAPI } from './PayrollAPI'
import type { ApprovalAPI } from './ApprovalAPI'
import type { AuditAPI } from './AuditAPI'
import type { AuthAPI } from './AuthAPI'
import type { BackupAPI } from './BackupAPI'
import type { BankReconciliationAPI } from './BankReconciliationAPI'
import type { BudgetAPI } from './BudgetAPI'
import type { ExemptionAPI } from './ExemptionAPI'
import type { FinanceAPI } from './FinanceAPI'
import type { FixedAssetAPI } from './FixedAssetAPI'
import type { UpdateAPI } from './UpdateAPI'
import type { GLAccountAPI } from './GLAccountAPI'
import type { HireAPI } from './HireAPI'
import type { InventoryAPI } from './InventoryAPI'
import type { JSSAPI } from './JSSAPI'
import type { MenuEventAPI } from './MenuEventAPI'
import type { MessagingAPI } from './MessagingAPI'
import type { NotificationAPI } from './NotificationAPI'
import type { OpeningBalanceAPI } from './OpeningBalanceAPI'

export type { AuthAPI, AuthSession, User as AuthUser } from './AuthAPI'
export * from './SettingsAPI'
export * from './AcademicAPI'
export * from './FinanceAPI'
export * from './StudentAPI'
export * from './StaffAPI'
export * from './PayrollAPI'
export * from './InventoryAPI'
export * from './BackupAPI'
// Export specific types to avoid conflicts
export type { User, CreateUserData, UpdateUserData } from './UserAPI'
export type { AuditLogEntry } from './AuditAPI'
export type {
  FeeCollectionItem,
  ScheduledReport,
  BalanceSheetReport,
  ProfitAndLossReport,
  TrialBalanceReport,
  ReportCardStudentEntry,
  ReportCardData
} from './ReportsAPI'
export * from './BudgetAPI'
export * from './MessagingAPI'
export * from './FixedAssetAPI'
export * from './BankReconciliationAPI'
export * from './GLAccountAPI'
export * from './OpeningBalanceAPI'
export * from './HireAPI'
export * from './ExemptionAPI'
export * from './ApprovalAPI'
export * from './NotificationAPI'
export * from './UpdateAPI'
export * from './MenuEventAPI'

import type { DataImportAPI } from './DataImportAPI'
import type { OperationsAPI } from './OperationsAPI'
import type { ReportsAPI } from './ReportsAPI'
import type { UserAPI } from './UserAPI'

export * from './DataImportAPI'
export * from './OperationsAPI'
export * from './JSSAPI'

// Namespaced API interface — all access via domain sub-objects
export interface ElectronAPI {
  auth: AuthAPI
  settings: SettingsAPI
  academic: AcademicAPI & JSSAPI
    & Pick<StudentAPI, 'getStudentsForAttendance' | 'getAttendanceByDate' | 'markAttendance' | 'getStudentsForReportCards'>
    & Pick<OperationsAPI, 'getCBCStrands' | 'getActiveCBCStrands' | 'linkFeeCategoryToStrand'>
    & Pick<ReportsAPI, 'generateReportCard'>
  finance: FinanceAPI & BudgetAPI & BankReconciliationAPI & GLAccountAPI & OpeningBalanceAPI & FixedAssetAPI & ExemptionAPI
    & Pick<ReportsAPI, 'getBalanceSheet' | 'getProfitAndLoss' | 'getTrialBalance' | 'getComparativeProfitAndLoss'>
    & Pick<AcademicAPI, 'exportToPDF'>
  students: StudentAPI
  staff: StaffAPI & PayrollAPI
  operations: OperationsAPI & InventoryAPI & HireAPI
  reports: ReportsAPI & AuditAPI
  communications: MessagingAPI & NotificationAPI
  system: BackupAPI & UserAPI & UpdateAPI & ApprovalAPI & DataImportAPI
  menuEvents: MenuEventAPI
}
