# Mwingi School ERP - Production Readiness Audit Report

**Date:** 2026-02-06
**Auditor:** Principal Software Architect / Senior Electron–React Engineer
**Scope:** Full codebase audit (Electron + React + build/tests/scripts)
**Readiness Score (current):** 28/100
**Go/No-Go:** NO-GO

---

## Executive Summary

This codebase is not production-ready. The audit found multiple **crash-level integration failures**, **broken IPC contracts**, **type-safety violations that currently fail `tsc`**, **feature stubs exposed to users**, and **missing wiring for application menu and updater flows**. Several critical flows (report cards, financial reports, fixed assets, JSS transition, approvals) are **not functional** due to IPC channel mismatches and missing preload bridges. Additionally, **strict TypeScript mode currently fails**, indicating the app cannot be built cleanly without fixes.

The existing `docs/AUDIT_REPORT.md` is **not reliable** as a source of truth; it contains claims that do not match the current code (e.g., sandbox flag, router type). This report supersedes it.

---

## Major Risk Categories

- **IPC Contract Breakage:** Renderer uses channels/methods that do not exist in preload or main handlers.
- **Type Safety / Build Failure:** `tsc` output shows numerous compile errors and missing typings.
- **Feature Stubs & Placeholders:** Production UI paths call stub handlers or return mock data.
- **Security & Data Integrity:** Hardcoded user IDs, default credentials in UI, plaintext key storage path assumptions.
- **Electron Lifecycle / Menu Wiring:** App menu sends events not handled in renderer.

---

## Critical Blockers (Launch-Stopping)

1. **IPC channel mismatches for core features** → runtime crashes on user actions.
2. **Missing preload bridges for methods used in UI** → `window.electronAPI.xxx is not a function`.
3. **TypeScript build fails (`tsc_output.txt`)** → build pipeline is broken.
4. **Report card and exam analytics use incorrect IPC channel names** → features non-functional.
5. **Auto-update menu events never reach updater logic** → menu is dead.

---

## Detailed Findings (with Evidence)

### 1) IPC channel mismatch: Fixed Assets

- **Category:** Architecture / Integration
- **Severity:** Critical
- **Problem:** Preload uses `asset:*` channels while main handlers register `assets:*`. Renderer calls fail.
- **Evidence:**
  - Preload uses `asset:getAll`, `asset:create` etc. `electron/preload/index.ts:288-294`
  - Main handlers register `assets:get-all`, `assets:create` etc. `electron/main/ipc/finance/fixed-asset-handlers.ts:5-28`
- **Violation:** Contract mismatch between renderer/preload/main.
- **Impact:** Fixed Assets screens crash when loading or creating assets.

### 2) IPC channel mismatch: Report Cards

- **Category:** Architecture / Integration
- **Severity:** Critical
- **Problem:** Renderer uses `reportcard:*` channels; main registers `report-card:*` channels.
- **Evidence:**
  - Renderer call: `src/pages/Reports/ReportCards.tsx:95-116` (uses `getStudentsForReportCards`, `generateReportCard`)
  - Preload: `electron/preload/index.ts:165-171` invokes `reportcard:*`
  - Main: `electron/main/ipc/academic/reportcard-handlers.ts:12-82` registers `report-card:*`
- **Violation:** IPC channel naming inconsistency.
- **Impact:** Report Card feature fails at runtime.

### 3) IPC channel mismatch: Exam & Performance Analytics

- **Category:** Architecture / Integration
- **Severity:** Critical
- **Problem:** Renderer uses `analytics:*` channels; main registers `exam-analysis:*` and `report-card-analytics:*`.
- **Evidence:**
  - Preload invokes `analytics:getExamAnalytics`, `analytics:getReportCardAnalytics` etc. `electron/preload/index.ts:249-253`
  - Main handlers: `electron/main/ipc/academic/exam-analysis-handlers.ts:6-45` and `electron/main/ipc/academic/report-card-analytics-handlers.ts:4-65`
- **Impact:** Exam analytics screens cannot fetch data.

### 4) Missing Preload Bridges (UI uses methods not exposed)

- **Category:** Architecture / Integration
- **Severity:** Critical
- **Problem:** Renderer uses methods absent in preload.
- **Evidence:**
  - Missing methods used in UI (examples):
    - `getJSSFeeStructure`: `src/pages/Finance/CBC/JSSTransition.tsx:68`
    - `getEligibleStudents`: `src/pages/Finance/CBC/JSSTransition.tsx:54`
    - `bulkTransition`: `src/pages/Finance/CBC/JSSTransition.tsx:109`
    - `generateCertificate`: `src/pages/Academic/MostImproved.tsx:107`
    - `emailParents`: `src/pages/Academic/MostImproved.tsx:130`
  - Preload does not expose these names: `electron/preload/index.ts` (missing methods list)
- **Impact:** Users encounter runtime crashes when using these UI flows.

### 5) TypeScript Build Fails (Strict Mode)

- **Category:** Code Quality / Build
- **Severity:** Critical
- **Problem:** `tsc` currently fails with numerous errors.
- **Evidence:** `tsc_output.txt` shows 100+ errors. Examples:
  - `src/pages/Academic/ReportCardGeneration.tsx(3,24): Cannot find module '../../components/PageHeader'`
  - `src/pages/Finance/Reports/BalanceSheet.tsx(42,25): Record<string, unknown> not assignable to BalanceSheet`
  - `src/pages/Approvals/index.tsx(56,23): Object is of type 'unknown'`
  - Test errors: `src/utils/__tests__/format.test.ts(3,1): Cannot find name 'describe'`
- **Impact:** Production build fails; strict typing is not satisfied.

### 6) Electron Menu Events Not Handled in Renderer

- **Category:** Electron / Integration
- **Severity:** High
- **Problem:** Application menu emits events (`navigate`, `open-import-dialog`, `trigger-print`, `check-for-updates`), but renderer has no listeners.
- **Evidence:**
  - Menu emits events: `electron/main/menu/applicationMenu.ts:30-227`
  - No listener wiring in preload or renderer for these events (no `ipcRenderer.on` bridge in `electron/preload/index.ts`).
- **Impact:** Menu actions do nothing; updater menu is non-functional.

### 7) Auto-Updater UI Contract Broken

- **Category:** Electron / Integration
- **Severity:** High
- **Problem:** Menu sends `check-for-updates` via `webContents.send`, but updater expects `ipcMain.handle('check-for-updates')` invoked by renderer.
- **Evidence:**
  - Menu event: `electron/main/menu/applicationMenu.ts:226-227`
  - Updater expects invoke: `electron/main/updates/autoUpdater.ts:91-94`
- **Impact:** User cannot trigger update check via menu.

### 8) Incomplete Backend Handlers / Placeholders Exposed in UI

- **Category:** Feature Completeness
- **Severity:** High
- **Problem:** Multiple IPC handlers are explicitly stubbed or return mock data.
- **Evidence:**
  - `electron/main/ipc/academic/academic-handlers.ts:95-118` (exam schedule generation returns empty slots)
  - `electron/main/ipc/academic/reportcard-handlers.ts:54-82` (email/merge/download return mock/false)
  - `electron/main/ipc/academic/academic-handlers.ts:84-88` (PDF export stub)
- **Impact:** Features appear in UI but are non-functional.

### 9) Type Definitions Out of Sync with API

- **Category:** Code Quality / Integration
- **Severity:** High
- **Problem:** Renderer uses Electron API methods missing in TypeScript interfaces.
- **Evidence:**
  - Missing in types: `createUser`, `getUsers`, `updateUser`, etc. `src/types/electron-api/*.ts` (no declarations).
  - Used in renderer: `src/pages/Users/index.tsx:32-94`.
- **Impact:** Type safety is broken; strict mode fails.

### 10) Hardcoded User IDs in Critical Transactions

- **Category:** Security / Data Integrity
- **Severity:** High
- **Problem:** UI sends `userId` as hardcoded `1` or fallback `|| 1` in transactions.
- **Evidence:**
  - `src/pages/Finance/FixedAssets/Depreciation.tsx:32-35`
  - `src/pages/Finance/FixedAssets/AssetRegister.tsx:55-58`
  - `src/pages/Reports/index.tsx:147,185`
- **Impact:** Audit trails and approval workflows are incorrect; violates accountability.

### 11) Default Credentials Displayed in UI

- **Category:** Security
- **Severity:** Medium
- **Problem:** Login screen shows default credentials to any user.
- **Evidence:** `src/pages/Login.tsx:124-127`
- **Impact:** Encourages insecure operation in production.

### 12) Offline Indicator Has Unimplemented Error Listener

- **Category:** UX / Reliability
- **Severity:** Medium
- **Problem:** Placeholder TODO for DB error notifications; never wired.
- **Evidence:** `src/components/feedback/OfflineIndicator.tsx:16-21`
- **Impact:** No visible feedback for DB failures.

### 13) Services Container Not Used Consistently

- **Category:** Architecture
- **Severity:** Medium
- **Problem:** Many handlers instantiate services directly or use DB directly instead of DI container.
- **Evidence:**
  - Direct DB access: `electron/main/ipc/academic/academic-handlers.ts:12-63`
  - DI used inconsistently: `electron/main/ipc/finance/fixed-asset-handlers.ts:7-28`
- **Impact:** Violates SOLID (Dependency Inversion), inconsistent lifecycle.

### 14) No Global `window.electronAPI` Type Declaration

- **Category:** Code Quality
- **Severity:** Medium
- **Problem:** No `*.d.ts` to type `window.electronAPI`, contributing to `unknown` usage.
- **Evidence:** `rg --files -g "*.d.ts"` returns none.
- **Impact:** Widespread `unknown` typing and `tsc` failures.

### 15) Tests Not Configured for TypeScript

- **Category:** Build / Quality
- **Severity:** Medium
- **Problem:** Jest/Vitest globals not in TS types; test files fail `tsc`.
- **Evidence:** `tsc_output.txt` errors for `describe/it/expect` in `src/utils/__tests__/format.test.ts` and `utilities.test.ts`.
- **Impact:** Build/test pipeline broken.

---

## Feature Coverage Matrix (Summary)

**Legend:** Backend (B), UI (U), Integration (I)

- **Auth/Login**: B=YES, U=YES, I=PARTIAL (TS errors, default credentials)
- **Students**: B=YES, U=YES, I=PARTIAL (typing errors)
- **Fee Payments/Invoices**: B=YES, U=YES, I=PARTIAL (typing errors)
- **Report Cards**: B=PARTIAL, U=YES, I=NO (IPC mismatch)
- **Exam Analytics**: B=YES, U=YES, I=NO (IPC mismatch)
- **Fixed Assets**: B=YES, U=YES, I=NO (IPC mismatch)
- **Financial Reports (Balance Sheet/P&L/Trial)**: B=YES, U=YES, I=YES (but types are broken)
- **CBC/JSS**: B=YES, U=YES, I=NO (missing preload methods)
- **Operations (Transport/Boarding)**: B=YES, U=YES, I=PARTIAL (type errors / unknowns)
- **Messaging**: B=PARTIAL (SMS stub), U=YES, I=PARTIAL
- **Backups**: B=YES, U=YES, I=PARTIAL (menu event not wired)

---

## Configuration & Build Pipeline Findings

- **`tsc` currently fails** (see `tsc_output.txt`).
- **No `*.d.ts` for preload API**: strict typing is broken in renderer.
- **Electron build targets exist for win/mac/linux** (in `package.json`) but update channels / signing not configured.
- **Google Fonts in `index.html`** imply external dependency in offline desktop app (risk). `index.html:9-11`

---

## File Coverage (Reviewed)

This audit reviewed all tracked source/config/test/script files listed by `rg --files` at the project root. See `docs/README.md` and `docs/getting-started.md` for functional descriptions only; the audit is based on code inspection.

## Appendix A: File Inventory

```
.git/FETCH_HEAD
.git/HEAD
.git/config
.git/description
.git/hooks/applypatch-msg.sample
.git/hooks/commit-msg.sample
.git/hooks/fsmonitor-watchman.sample
.git/hooks/post-update.sample
.git/hooks/pre-applypatch.sample
.git/hooks/pre-commit.sample
.git/hooks/pre-merge-commit.sample
.git/hooks/pre-push.sample
.git/hooks/pre-rebase.sample
.git/hooks/pre-receive.sample
.git/hooks/prepare-commit-msg.sample
.git/hooks/push-to-checkout.sample
.git/hooks/sendemail-validate.sample
.git/hooks/update.sample
.git/index
.git/info/exclude
.git/logs/HEAD
.git/logs/refs/heads/fix/production-readiness-audit
.git/logs/refs/heads/main
.git/logs/refs/remotes/origin/HEAD
.git/objects/pack/pack-ef7af4a1d0559d4db8872b1caeae422dec692c3f.idx
.git/objects/pack/pack-ef7af4a1d0559d4db8872b1caeae422dec692c3f.pack
.git/objects/pack/pack-ef7af4a1d0559d4db8872b1caeae422dec692c3f.rev
.git/packed-refs
.git/refs/heads/fix/production-readiness-audit
.git/refs/heads/main
.git/refs/remotes/origin/HEAD
.github/workflows/build.yml
.gitignore
.husky/pre-commit
.lintstagedrc.json
.markdownlint.json
CODING_STANDARDS.md
__mocks__/fileMock.js
docs/AUDIT_REPORT.md
docs/README.md
docs/developer-guide/architecture.md
docs/getting-started.md
electron/main/__tests__/integration/workflows.integration.test.ts
electron/main/__tests__/ipc-handlers.test.ts
electron/main/__tests__/modular-ipc.test.ts
electron/main/__tests__/security.test.ts
electron/main/backup-service.ts
electron/main/database/index.ts
electron/main/database/migrations/001_schema.ts
electron/main/database/migrations/002_seed_data.ts
electron/main/database/migrations/003_academic_updates.ts
electron/main/database/migrations/archive/002_enhanced_schema.ts
electron/main/database/migrations/archive/003_academic_reporting.ts
electron/main/database/migrations/archive/003_phase3_credit_proration_scholarships_nemis.sql
electron/main/database/migrations/archive/004_reporting_infrastructure.ts
electron/main/database/migrations/archive/005_notification_fix.ts
electron/main/database/migrations/archive/006_report_fixes.ts
electron/main/database/migrations/archive/007_attendance_schema.ts
electron/main/database/migrations/archive/008_asset_hire_exemptions.ts
electron/main/database/migrations/archive/010_approval_workflows.ts
electron/main/database/migrations/archive/011_chart_of_accounts.ts
electron/main/database/migrations/archive/012_cbc_features.ts
electron/main/database/migrations/archive/013_reseed_fees.ts
electron/main/database/migrations/archive/014_correct_fee_structure.ts
electron/main/database/migrations/archive/015_add_fee_conditions.ts
electron/main/database/migrations/archive/016_fix_fees_final.ts
electron/main/database/migrations/archive/017_exam_management.ts
electron/main/database/migrations/archive/018_merit_lists_and_awards.ts
electron/main/database/migrations/archive/demo-data.ts
electron/main/database/migrations/archive/schema.ts
electron/main/database/migrations/archive/seed-data.ts
electron/main/database/migrations/index.ts
electron/main/database/security.ts
electron/main/database/utils/audit.ts
electron/main/database/utils/migration-runner.ts
electron/main/database/verify_migrations.ts
electron/main/electron-env.ts
electron/main/index.ts
electron/main/ipc/academic/academic-handlers.ts
electron/main/ipc/academic/academic-system-handlers.ts
electron/main/ipc/academic/attendance-handlers.ts
electron/main/ipc/academic/awards-handlers.ts
electron/main/ipc/academic/cbc-handlers.ts
electron/main/ipc/academic/exam-analysis-handlers.ts
electron/main/ipc/academic/jss-handlers.ts
electron/main/ipc/academic/merit-list-handlers.ts
electron/main/ipc/academic/performance-analysis-handlers.ts
electron/main/ipc/academic/promotion-handlers.ts
electron/main/ipc/academic/report-card-analytics-handlers.ts
electron/main/ipc/academic/reportcard-handlers.ts
electron/main/ipc/audit/audit-handlers.ts
electron/main/ipc/auth/auth-handlers.ts
electron/main/ipc/backup/backup-handlers.ts
electron/main/ipc/data/import-handlers.ts
electron/main/ipc/exemption/exemption-handlers.ts
electron/main/ipc/finance/approval-handlers.ts
electron/main/ipc/finance/bank-handlers.ts
electron/main/ipc/finance/budget-handlers.ts
electron/main/ipc/finance/finance-handlers.ts
electron/main/ipc/finance/fixed-asset-handlers.ts
electron/main/ipc/finance/gl-account-handlers.ts
electron/main/ipc/finance/opening-balance-handlers.ts
electron/main/ipc/finance/reconciliation-budget-handlers.ts
electron/main/ipc/finance/types.ts
electron/main/ipc/hire/hire-handlers.ts
electron/main/ipc/index.ts
electron/main/ipc/inventory/inventory-handlers.ts
electron/main/ipc/inventory/types.ts
electron/main/ipc/messaging/message-handlers.ts
electron/main/ipc/notifications/notification-handlers.ts
electron/main/ipc/operations/cbc-operations-handlers.ts
electron/main/ipc/operations/operations-handlers.ts
electron/main/ipc/payroll/payroll-handlers.ts
electron/main/ipc/payroll/types.ts
electron/main/ipc/reports/financial-reports-handlers.ts
electron/main/ipc/reports/reports-handlers.ts
electron/main/ipc/reports/scheduler-handlers.ts
electron/main/ipc/settings/settings-handlers.ts
electron/main/ipc/staff/staff-handlers.ts
electron/main/ipc/student/student-handlers.ts
electron/main/ipc/transactions/transactions-handlers.ts
electron/main/ipc/workflow/approval-handlers.ts
electron/main/menu/applicationMenu.ts
electron/main/services/BackupService.ts
electron/main/services/ConfigService.ts
electron/main/services/SystemMaintenanceService.ts
electron/main/services/__tests__/workflows.integration.test.ts
electron/main/services/academic/AcademicSystemService.ts
electron/main/services/academic/AttendanceService.ts
electron/main/services/academic/CBCReportCardService.ts
electron/main/services/academic/ExamAnalysisService.ts
electron/main/services/academic/ExamSchedulerService.ts
electron/main/services/academic/MeritListService.ts
electron/main/services/academic/PerformanceAnalysisService.ts
electron/main/services/academic/PromotionService.ts
electron/main/services/academic/ReportCardAnalyticsService.ts
electron/main/services/academic/ReportCardService.ts
electron/main/services/academic/StudentService.ts
electron/main/services/academic/__tests__/ExamSchedulerService.test.ts
electron/main/services/accounting/BudgetEnforcementService.ts
electron/main/services/accounting/DataMigrationService.ts
electron/main/services/accounting/DoubleEntryJournalService.ts
electron/main/services/accounting/OpeningBalanceService.ts
electron/main/services/accounting/ProfitAndLossService.ts
electron/main/services/accounting/ReconciliationService.ts
electron/main/services/accounting/__tests__/CashFlowStatementService.test.ts
electron/main/services/accounting/__tests__/StudentLedgerService.test.ts
electron/main/services/approval/__tests__/ApprovalWorkflowService.test.ts
electron/main/services/base/BaseService.ts
electron/main/services/base/ServiceContainer.ts
electron/main/services/base/interfaces/IService.ts
electron/main/services/cbc/CBCStrandService.ts
electron/main/services/cbc/JSSTransitionService.ts
electron/main/services/data/DataImportService.ts
electron/main/services/finance/BankReconciliationService.ts
electron/main/services/finance/BudgetService.ts
electron/main/services/finance/CashFlowService.ts
electron/main/services/finance/CreditAutoApplicationService.ts
electron/main/services/finance/ExemptionService.ts
electron/main/services/finance/FeeProrationService.ts
electron/main/services/finance/FixedAssetService.ts
electron/main/services/finance/GLAccountService.ts
electron/main/services/finance/HireService.ts
electron/main/services/finance/PaymentIntegrationService.ts
electron/main/services/finance/PaymentService.ts
electron/main/services/finance/PayrollIntegrationService.ts
electron/main/services/finance/PayrollJournalService.ts
electron/main/services/finance/PeriodLockingService.ts
electron/main/services/finance/ScholarshipService.ts
electron/main/services/finance/__tests__/CreditAutoApplicationService.test.ts
electron/main/services/finance/__tests__/FeeProrationService.test.ts
electron/main/services/finance/__tests__/PaymentService.test.ts
electron/main/services/finance/__tests__/PeriodLockingService.test.ts
electron/main/services/finance/__tests__/ScholarshipService.test.ts
electron/main/services/inventory/InventoryService.ts
electron/main/services/nemis/__tests__/NEMISExportService.test.ts
electron/main/services/notifications/NotificationService.ts
electron/main/services/operations/BoardingCostService.ts
electron/main/services/operations/GrantTrackingService.ts
electron/main/services/operations/StudentCostService.ts
electron/main/services/operations/TransportCostService.ts
electron/main/services/reports/AgedReceivablesService.ts
electron/main/services/reports/CashFlowStatementService.ts
electron/main/services/reports/NEMISExportService.ts
electron/main/services/reports/ReportScheduler.ts
electron/main/services/reports/SegmentProfitabilityService.ts
electron/main/services/reports/StudentLedgerService.ts
electron/main/services/reports/__tests__/AgedReceivablesService.test.ts
electron/main/services/reports/__tests__/CashFlowStatementService.test.ts
electron/main/services/reports/__tests__/NEMISExportService.test.ts
electron/main/services/reports/__tests__/SegmentProfitabilityService.test.ts
electron/main/services/reports/__tests__/StudentLedgerService.test.ts
electron/main/services/workflow/ApprovalService.ts
electron/main/services/workflow/ApprovalWorkflowService.ts
electron/main/services/workflow/__tests__/ApprovalWorkflowService.test.ts
electron/main/tax/TaxStrategy.ts
electron/main/updates/autoUpdater.ts
electron/main/utils/validation.ts
electron/main/utils/windowState.ts
electron/preload/index.ts
eslint.config.js
full_git_status.txt
index.html
jest.config.js
jest.setup.cjs
package-lock.json
package.json
playwright.config.ts
postcss.config.js
reseed_fees.js
scripts/check-user-1.cjs
scripts/check-users.cjs
scripts/parse_lint.cjs
scripts/parse_lint.js
scripts/test-invoice-generation.cjs
scripts/verify-encryption.ts
src/App.tsx
src/components/ErrorBoundary.tsx
src/components/Layout.tsx
src/components/feedback/OfflineIndicator.tsx
src/components/patterns/CommandPalette.tsx
src/components/patterns/InstitutionalHeader.tsx
src/components/patterns/PageHeader.tsx
src/components/patterns/StatCard.tsx
src/components/ui/Badge.tsx
src/components/ui/Dropdown.tsx
src/components/ui/EmptyState.tsx
src/components/ui/ImportDialog.tsx
src/components/ui/Input.tsx
src/components/ui/Modal.tsx
src/components/ui/Select.tsx
src/components/ui/Skeleton.tsx
src/components/ui/Table/DataTable.tsx
src/components/ui/Toast.tsx
src/components/ui/Tooltip.tsx
src/contexts/ThemeContext.tsx
src/contexts/ToastContext.tsx
src/hooks/useNetworkStatus.ts
src/index.css
src/main.tsx
src/pages/Academic/AwardsManagement.tsx
src/pages/Academic/ExamAnalytics.tsx
src/pages/Academic/ExamManagement.tsx
src/pages/Academic/ExamScheduler.tsx
src/pages/Academic/MarksEntry.tsx
src/pages/Academic/MeritLists.tsx
src/pages/Academic/MostImproved.tsx
src/pages/Academic/ReportCardAnalytics.tsx
src/pages/Academic/ReportCardGeneration.tsx
src/pages/Academic/SubjectMeritLists.tsx
src/pages/Academic/TeacherAllocation.tsx
src/pages/Approvals/index.tsx
src/pages/Attendance/index.tsx
src/pages/AuditLog/index.tsx
src/pages/Backup/index.tsx
src/pages/Communications/CommunicationLog.tsx
src/pages/Dashboard.tsx
src/pages/Finance/Approvals/ApprovalQueue.tsx
src/pages/Finance/AssetHire.tsx
src/pages/Finance/BankAccounts.tsx
src/pages/Finance/Budget/BudgetDetails.tsx
src/pages/Finance/Budget/CreateBudget.tsx
src/pages/Finance/Budget/index.tsx
src/pages/Finance/CBC/CBCStrandManagement.tsx
src/pages/Finance/CBC/JSSTransition.tsx
src/pages/Finance/CashFlow/index.tsx
src/pages/Finance/FeeExemptions.tsx
src/pages/Finance/FeePayment.tsx
src/pages/Finance/FeeStructure.tsx
src/pages/Finance/FinancialReports.tsx
src/pages/Finance/FixedAssets/AssetRegister.tsx
src/pages/Finance/FixedAssets/Depreciation.tsx
src/pages/Finance/Grants/GrantTracking.tsx
src/pages/Finance/Invoices.tsx
src/pages/Finance/Reconciliation/ReconcileAccount.tsx
src/pages/Finance/RecordExpense.tsx
src/pages/Finance/RecordIncome.tsx
src/pages/Finance/Reports/BalanceSheet.tsx
src/pages/Finance/Reports/ProfitAndLoss.tsx
src/pages/Finance/Reports/TrialBalance.tsx
src/pages/Finance/Settings/GLAccountManagement.tsx
src/pages/Finance/Settings/OpeningBalanceImport.tsx
src/pages/Finance/StudentCost/StudentCostAnalysis.tsx
src/pages/Finance/Transactions.tsx
src/pages/Finance/components/LedgerHistory.tsx
src/pages/Finance/components/PaymentEntryForm.tsx
src/pages/Finance/components/StudentLedgerSearch.tsx
src/pages/Inventory/index.tsx
src/pages/Login.tsx
src/pages/Operations/Boarding/BoardingProfitability.tsx
src/pages/Operations/Transport/TransportRouteManagement.tsx
src/pages/Payroll/PayrollRun.tsx
src/pages/Payroll/Staff.tsx
src/pages/Reports/ReportCards.tsx
src/pages/Reports/ScheduledReports.tsx
src/pages/Reports/index.tsx
src/pages/Settings/Integrations.tsx
src/pages/Settings/MessageTemplates.tsx
src/pages/Settings/index.tsx
src/pages/Students/Promotions.tsx
src/pages/Students/StudentForm.tsx
src/pages/Students/index.tsx
src/pages/Users/index.tsx
src/stores/index.ts
src/types/InvoiceItem.ts
src/types/TransactionCategory.ts
src/types/electron-api/AcademicAPI.ts
src/types/electron-api/AccountingAPI.ts
src/types/electron-api/ApprovalAPI.ts
src/types/electron-api/AuditAPI.ts
src/types/electron-api/AuthAPI.ts
src/types/electron-api/BackupAPI.ts
src/types/electron-api/BankReconciliationAPI.ts
src/types/electron-api/BudgetAPI.ts
src/types/electron-api/ExemptionAPI.ts
src/types/electron-api/FinanceAPI.ts
src/types/electron-api/FixedAssetAPI.ts
src/types/electron-api/GLAccountAPI.ts
src/types/electron-api/HireAPI.ts
src/types/electron-api/InventoryAPI.ts
src/types/electron-api/JSSAPI.ts
src/types/electron-api/MessagingAPI.ts
src/types/electron-api/NotificationAPI.ts
src/types/electron-api/OpeningBalanceAPI.ts
src/types/electron-api/OperationsAPI.ts
src/types/electron-api/PayrollAPI.ts
src/types/electron-api/ReportsAPI.ts
src/types/electron-api/SettingsAPI.ts
src/types/electron-api/StaffAPI.ts
src/types/electron-api/StudentAPI.ts
src/types/electron-api/UserAPI.ts
src/types/electron-api/index.ts
src/utils/__tests__/format.test.ts
src/utils/__tests__/utilities.test.ts
src/utils/__tests__/validation.test.ts
src/utils/cn.ts
src/utils/constants.ts
src/utils/exporters/excelExporter.ts
src/utils/exporters/index.ts
src/utils/exporters/pdfExporter.ts
src/utils/format.ts
src/utils/print.ts
tailwind.config.js
tests/e2e/fee-payment.spec.ts
tests/e2e/main-workflows.spec.ts
tsc_output.txt
tsconfig.json
tsconfig.node.json
verify_credits.js
vite.config.ts
vitest.config.ts
```
