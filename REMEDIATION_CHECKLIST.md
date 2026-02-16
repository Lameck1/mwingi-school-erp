# Remediation Checklist

Date: 2026-02-16
Repository: `mwingi-school-erp`
Status: Completed

## 1. Baseline and Inventory

- [x] Ran baseline install and quality gates.
- [x] Built feature ownership inventory (main/preload/renderer/services/db) and documented in `AUDIT_REPORT.md`.

Evidence:

- `npm ci` -> passed
- `npx tsc --noEmit` -> passed
- `npm run lint:eslint` -> initially failed, remediated to pass (0 errors, 0 warnings)
- `npm run lint:architecture` -> passed
- `npm test -- --run` -> passed after remediations
- `npm audit --audit-level=high` -> passed (0 vulnerabilities)

## 2. Security-First Remediation

### Trust Boundary / Authorization

- [x] Session actor context added in IPC wrappers (`electron/main/ipc/ipc-result.ts`).
- [x] Renderer-supplied legacy `userId` now validated and rejected on mismatch with authenticated actor.
- [x] Privileged handlers migrated to session-derived actor IDs across finance/settings/student/auth/operations/academic.
- [x] Untouched non-finance handlers migrated from raw/unscoped IPC to role-aware wrappers with actor mismatch rejection across academic/staff/inventory/backup/import/reports.
- [x] Promotion and payroll privileged actions now derive actor IDs from session and reject renderer mismatch:
  - `electron/main/ipc/academic/promotion-handlers.ts`
  - `electron/main/ipc/payroll/payroll-handlers.ts`

### Least Privilege / Role Guards

- [x] Role guards enforced on mutating channels in:
  - `electron/main/ipc/finance/budget-handlers.ts`
  - `electron/main/ipc/finance/bank-handlers.ts`
  - `electron/main/ipc/finance/gl-account-handlers.ts`
  - `electron/main/ipc/finance/fixed-asset-handlers.ts`
  - `electron/main/ipc/finance/opening-balance-handlers.ts`
  - `electron/main/ipc/finance/period-handlers.ts`
  - `electron/main/ipc/finance/approval-handlers.ts`
  - `electron/main/ipc/settings/settings-handlers.ts`
  - `electron/main/ipc/student/student-handlers.ts`
  - `electron/main/ipc/auth/auth-handlers.ts`
  - `electron/main/ipc/academic/academic-system-handlers.ts`
  - `electron/main/ipc/academic/attendance-handlers.ts`
  - `electron/main/ipc/academic/awards-handlers.ts`
  - `electron/main/ipc/academic/merit-list-handlers.ts`
  - `electron/main/ipc/inventory/inventory-handlers.ts`
  - `electron/main/ipc/notifications/notification-handlers.ts`
  - `electron/main/ipc/messaging/message-handlers.ts`
  - `electron/main/ipc/exemption/exemption-handlers.ts`
  - `electron/main/ipc/hire/hire-handlers.ts`
  - `electron/main/ipc/workflow/approval-handlers.ts`
  - `electron/main/ipc/backup/backup-handlers.ts`
  - `electron/main/ipc/operations/operations-handlers.ts`
  - `electron/main/ipc/data/import-handlers.ts`
  - `electron/main/ipc/reports/reports-handlers.ts`
  - `electron/main/ipc/reports/scheduler-handlers.ts`
  - `electron/main/ipc/reports/financial-reports-handlers.ts`

### Preload Surface

- [x] Removed hardcoded ADMIN role flattening.
- [x] Added runtime role-aware API filtering and session-role hydration:
  - `electron/preload/roleFilter.ts`
  - `electron/preload/index.ts`

### Electron Update Channel Security/Drift

- [x] Registered updater channels for both packaged and non-packaged modes in fail-closed style:
  - `electron/main/updates/autoUpdater.ts`
  - `electron/main/index.ts`

## 3. SOLID and Architecture Remediation

- [x] Extracted actor-resolution logic to centralized helper (`resolveActorId`) to remove duplicated insecure checks.
- [x] Normalized role constants to schema-valid roles and removed stale role names.
- [x] Added dedicated IPC contract parity regression test to prevent boundary drift.

## 4. React and Frontend Quality

- [x] Upgraded React stack to 19.x:
  - `package.json`
  - `package-lock.json`
- [x] Fixed React 19 typing regressions in:
  - `src/components/ErrorBoundary.tsx`
  - `src/components/ui/ImportDialog.tsx`
  - `src/components/ui/Tooltip.tsx`
  - `src/pages/Approvals/index.tsx`
  - `src/pages/Finance/FeeStructure.tsx`
  - `src/pages/Settings/index.tsx`
- [x] Replaced blocking prompt-based reconciliation flow with explicit selection and modal workflows:
  - `src/pages/Finance/Reconciliation/ReconcileAccount.tsx`
- [x] Replaced remaining blocking native confirmation/alert flows in launch-critical renderer paths:
  - `src/pages/Payroll/PayrollRun.tsx`
  - `src/pages/Students/Promotions.tsx`
  - `src/pages/Academic/CBC/JSSTransition.tsx`
  - `src/components/ui/ImportDialog.tsx`

## 5. Incomplete / Orphaned Implementations

- [x] Depreciation dummy period behavior removed and replaced with unlocked-period selection:
  - `src/pages/Finance/FixedAssets/Depreciation.tsx`
- [x] Backup retention policy made strict (daily + monthly preservation):
  - `electron/main/services/BackupService.ts`
- [x] Grant compliance logic replaced with real rule checks:
  - `electron/main/services/operations/GrantTrackingService.ts`
- [x] System maintenance debug throw path removed:
  - `electron/main/services/SystemMaintenanceService.ts`
- [x] Reconciliation CSV import path completed:
  - `src/pages/Finance/Reconciliation/ReconcileAccount.tsx`
  - `src/pages/Finance/Reconciliation/reconcile.logic.ts`
- [x] Consolidated duplicate CBC implementations under finance routes to canonical academic modules:
  - `src/pages/Finance/CBC/JSSTransition.tsx`
  - `src/pages/Finance/CBC/CBCStrandManagement.tsx`

## 6. API / IPC Contract Consistency

Mandatory channels reconciled:

- [x] `cbc:linkFeeCategory`
- [x] `check-for-updates`
- [x] `download-update`
- [x] `get-update-status`
- [x] `install-update`
- [x] `reconciliation:getHistory`
- [x] `reconciliation:runAll`
- [x] `reports:getComparativeProfitAndLoss`

Automation:

- [x] Added parity test: `electron/main/ipc/__tests__/ipc-contract-parity.test.ts`

## 7. Mandatory Hotspots

- [x] `electron/main/ipc/finance/finance-handlers.ts` trust-boundary hardening and regression-safe behavior updates.
- [x] Student payment and statement normalization across:
  - `electron/main/services/finance/PaymentService.internal.ts`
  - `electron/main/services/finance/PaymentService.ts`
  - `electron/main/services/finance/PaymentIntegrationService.ts`
  - `electron/main/services/reports/AgedReceivablesService.ts`
  - `electron/main/services/reports/StudentLedgerService.ts`
  - `electron/main/services/reports/SegmentProfitabilityService.ts`
  - `electron/main/services/accounting/OpeningBalanceService.ts`
- [x] `electron/main/services/SystemMaintenanceService.ts` debug throw removal and coverage.
- [x] `electron/main/services/BackupService.ts` retention strictness.
- [x] `electron/main/services/operations/GrantTrackingService.ts` compliance logic completion.
- [x] `src/pages/Finance/FixedAssets/Depreciation.tsx` dummy behavior removal.
- [x] `src/pages/Finance/Reconciliation/ReconcileAccount.tsx` prompt-flow removal and CSV completion.
- [x] `src/components/ErrorBoundary.tsx` floating promise lint blocker fix.
- [x] Academic analytics schema/logic drift remediated:
  - `electron/main/services/academic/ExamAnalysisService.ts`
  - `electron/main/services/academic/PerformanceAnalysisService.ts`
  - `electron/main/services/academic/MeritListService.ts`
- [x] Report-card and promotion correctness fixes:
  - `electron/main/services/academic/ReportCardService.ts`
  - `electron/main/services/academic/CBCReportCardService.ts`
  - `electron/main/services/academic/PromotionService.ts`
- [x] Payroll local date and access-control hardening:
  - `electron/main/ipc/payroll/payroll-handlers.ts`
- [x] Payroll renderer crash and feedback hardening:
  - `src/pages/Payroll/PayrollRun.tsx`

## 8. Regression Tests Added/Updated

- [x] Added `electron/main/ipc/__tests__/ipc-contract-parity.test.ts`
- [x] Added `electron/main/services/cbc/__tests__/CBCStrandService.test.ts`
- [x] Added `electron/main/services/__tests__/SystemMaintenanceService.test.ts`
- [x] Added `electron/main/services/finance/__tests__/PaymentIntegrationService.test.ts`
- [x] Added `electron/main/services/reports/__tests__/AgedReceivablesService.normalization.test.ts`
- [x] Added `electron/main/services/academic/__tests__/PromotionService.test.ts`
- [x] Added `electron/main/services/academic/__tests__/MeritListService.test.ts`
- [x] Added `electron/main/services/academic/__tests__/PerformanceAnalysisService.test.ts`
- [x] Added `electron/main/services/academic/__tests__/ExamAnalysisService.test.ts`
- [x] Added `electron/main/services/academic/__tests__/CBCReportCardService.test.ts`
- [x] Added `electron/main/ipc/academic/__tests__/promotion-handlers.test.ts`
- [x] Added `electron/main/ipc/payroll/__tests__/payroll-handlers.test.ts`
- [x] Added `electron/main/ipc/academic/__tests__/academic-system-handlers.test.ts`
- [x] Added `electron/main/ipc/inventory/__tests__/inventory-handlers.test.ts`
- [x] Added `electron/main/ipc/workflow/__tests__/approval-handlers.test.ts`
- [x] Added `electron/main/ipc/backup/__tests__/backup-handlers.test.ts`
- [x] Added `electron/main/ipc/operations/__tests__/operations-handlers.test.ts`
- [x] Added `electron/main/ipc/data/__tests__/import-handlers.test.ts`
- [x] Added `electron/main/ipc/notifications/__tests__/notification-handlers.test.ts`
- [x] Updated `electron/main/ipc/finance/__tests__/finance-handlers.test.ts`
- [x] Updated `electron/main/ipc/finance/__tests__/approval-handlers.test.ts`
- [x] Updated `electron/main/ipc/finance/__tests__/bank-handlers.test.ts`
- [x] Updated `electron/main/ipc/hire/__tests__/hire-handlers.test.ts`
- [x] Updated `electron/main/ipc/reports/__tests__/scheduler-handlers.test.ts`
- [x] Updated `electron/main/ipc/reports/__tests__/reports-handlers.test.ts`
- [x] Updated `electron/main/ipc/reports/__tests__/financial-reports-handlers.test.ts`
- [x] Updated `electron/main/services/__tests__/BackupService.test.ts`
- [x] Updated `electron/main/services/operations/__tests__/GrantTrackingService.test.ts`
- [x] Updated `src/pages/Finance/Reconciliation/__tests__/reconcile.logic.test.ts`
- [x] Updated `electron/main/services/finance/__tests__/PaymentService.test.ts`
- [x] Updated `electron/main/services/reports/__tests__/SegmentProfitabilityService.test.ts`
- [x] Updated `electron/main/services/reports/__tests__/StudentLedgerService.test.ts`
- [x] Updated `electron/main/services/accounting/__tests__/OpeningBalanceService.test.ts`
- [x] Updated `electron/main/__tests__/integration/financial.integration.test.ts`
- [x] Updated `electron/main/services/academic/__tests__/ReportCardService.test.ts`
- [x] Updated `src/pages/Students/__tests__/promotion-feedback.logic.test.ts`
- [x] Added `src/components/layout/__tests__/nav-utils.test.ts`

## 9. Final Hard Gates

- [x] `npx tsc --noEmit` (pass)
- [x] `npm run lint:eslint` (pass; 0 errors, 0 warnings)
- [x] `npm run lint:architecture` (pass)
- [x] `npm test -- --run` (pass; 72 files / 720 tests)
- [x] `npm audit --audit-level=high` (pass; 0 vulnerabilities)
