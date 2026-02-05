import type { AuthAPI } from './AuthAPI'
import type { SettingsAPI } from './SettingsAPI'
import type { AcademicAPI } from './AcademicAPI'
import type { FinanceAPI } from './FinanceAPI'
import type { StudentAPI } from './StudentAPI'
import type { StaffAPI } from './StaffAPI'
import type { PayrollAPI } from './PayrollAPI'
import type { InventoryAPI } from './InventoryAPI'
import type { ReportsAPI } from './ReportsAPI'
import type { BackupAPI } from './BackupAPI'
import type { UserAPI } from './UserAPI'
import type { AuditAPI } from './AuditAPI'
import type { BudgetAPI } from './BudgetAPI'
import type { MessagingAPI } from './MessagingAPI'
import type { FixedAssetAPI } from './FixedAssetAPI'
import type { BankReconciliationAPI } from './BankReconciliationAPI'
import type { HireAPI } from './HireAPI'
import type { ExemptionAPI } from './ExemptionAPI'
import type { ApprovalAPI } from './ApprovalAPI'
import type { NotificationAPI } from './NotificationAPI'

export * from './AuthAPI'
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
export type { FeeCollectionItem } from './ReportsAPI'
export * from './BudgetAPI'
export * from './MessagingAPI'
export * from './FixedAssetAPI'
export * from './BankReconciliationAPI'
export * from './HireAPI'
export * from './ExemptionAPI'
export * from './ApprovalAPI'
export * from './NotificationAPI'

import type { OperationsAPI } from './OperationsAPI'
export * from './OperationsAPI'

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
  HireAPI,
  HireAPI,
  ExemptionAPI,
  ApprovalAPI,
  NotificationAPI,
  OperationsAPI {
  // Data Import/Export (General)
  downloadImportTemplate: (entityType: string) => Promise<{ success: boolean; filePath: string }>
  getImportTemplate: (entityType: string) => Promise<{ columns: { name: string; required: boolean }[] }>
  importData: (filePath: string, config: unknown, userId: number) => Promise<{ success: boolean; totalRows: number; imported: number; skipped: number; errors: string[] }>
}
