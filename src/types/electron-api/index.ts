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

import type { OperationsAPI } from './OperationsAPI'
import type { ReportsAPI } from './ReportsAPI'
import type { UserAPI } from './UserAPI'

export * from './OperationsAPI'
export * from './JSSAPI'

// Combined interface for backward compatibility
export interface ElectronAPI
  extends AuthAPI,
  SettingsAPI,
  AcademicAPI,
  FinanceAPI,
  StudentAPI,
  StaffAPI,
  PayrollAPI,
  InventoryAPI,
  ReportsAPI,
  BackupAPI,
  UserAPI,
  AuditAPI,
  BudgetAPI,
  MessagingAPI,
  FixedAssetAPI,
  BankReconciliationAPI,
  GLAccountAPI,
  OpeningBalanceAPI,
  HireAPI,
  ExemptionAPI,
  ApprovalAPI,
  NotificationAPI,
  OperationsAPI,
  JSSAPI,
  UpdateAPI,
  MenuEventAPI {
  // Data Import/Export (General)
  downloadImportTemplate: (entityType: string) => Promise<{ success: boolean; filePath: string }>
  getImportTemplate: (entityType: string) => Promise<{ columns: { name: string; required: boolean }[] }>
  importData: (filePath: string, config: unknown, userId: number) => Promise<{ success: boolean; totalRows: number; imported: number; skipped: number; errors: Array<{ row: number; message: string }> }>
}
