# Security and Architecture Audit Report

Date: 2026-02-16
Repository: `mwingi-school-erp`
Scope: Electron main/preload, React renderer, IPC contracts, finance/operations services, student statement and payment logic normalization, academic/staff analytics and promotion/payroll hardening, untouched non-finance IPC security sweep, regression coverage.

## Baseline (Pre-Remediation)

Executed baseline commands and captured status before final remediation pass:

- `npm ci`: passed
- `npx tsc --noEmit`: passed
- `npm run lint:eslint`: failed (blocking issues in `src/components/ErrorBoundary.tsx`, reconciliation/depreciation UI logic)
- `npm run lint:architecture`: passed (`no dependency violations found`)
- `npm test -- --run`: initially passed before code changes, then failed after security hardening until tests were updated
- `npm audit --audit-level=high`: passed (`found 0 vulnerabilities`)

## Feature and File Inventory

| Feature Area | Owner Modules | Status | Criticality | Required Remediation | Final State |
|---|---|---|---|---|---|
| Authentication and session | `electron/main/ipc/auth`, `electron/main/security/session`, `electron/preload/api/auth.ts`, `src/stores` | Risky | High | Enforce session actor identity for privileged operations | Remediated: session identity enforced in privileged flows |
| IPC security wrappers | `electron/main/ipc/ipc-result.ts` | Risky | Critical | Add actor context, reject renderer actor mismatch, normalize roles | Remediated |
| Finance IPC and writes | `electron/main/ipc/finance/*`, `electron/main/services/finance/*` | Risky | Critical | Remove trust in renderer `userId`, role-guard writes, validate input | Remediated with regression tests |
| Bank reconciliation | `electron/main/ipc/finance/bank-handlers.ts`, `src/pages/Finance/Reconciliation/*` | Incomplete | High | Replace prompt flow, complete CSV import, add strict validation | Remediated |
| Approval workflows | `electron/main/ipc/finance/approval-handlers.ts`, `src/pages/Approvals/index.tsx` | Risky | High | Role and actor enforcement, secure approve/reject actor source | Remediated |
| Budget and GL controls | `electron/main/ipc/finance/budget-handlers.ts`, `gl-account-handlers.ts`, `period-handlers.ts` | Risky | High | Guard mutating channels, derive actor from session | Remediated |
| Fixed assets and depreciation | `electron/main/ipc/finance/fixed-asset-handlers.ts`, `src/pages/Finance/FixedAssets/Depreciation.tsx` | Incomplete | Medium | Remove dummy period behavior and blocking prompts | Remediated |
| CBC finance linkage | `electron/main/ipc/academic/cbc-handlers.ts`, `electron/main/services/cbc/CBCStrandService.ts` | Risky | Medium | Actor enforcement and SQL correctness | Remediated |
| Grant tracking and compliance | `electron/main/services/operations/GrantTrackingService.ts`, `electron/main/ipc/operations/cbc-operations-handlers.ts` | Incomplete | High | Replace mock compliance logic, enforce actor identity | Remediated |
| Backup retention | `electron/main/services/BackupService.ts` | Incomplete | High | Implement strict retention policy | Remediated |
| System maintenance | `electron/main/services/SystemMaintenanceService.ts`, `electron/main/ipc/settings/settings-handlers.ts` | Risky | High | Remove debug throw paths, guard destructive operations with actor checks | Remediated |
| Update mechanism channels | `electron/main/updates/autoUpdater.ts`, `electron/main/index.ts`, `electron/preload/api/system.ts` | Drift | High | Register required update channels in all modes | Remediated |
| Preload exposure model | `electron/preload/index.ts`, `electron/preload/roleFilter.ts`, `electron/preload/api/*` | Risky | Critical | Replace ADMIN flattening with runtime role-aware filtering | Remediated |
| IPC contract parity | `electron/main/ipc/__tests__/ipc-contract-parity.test.ts`, `electron/preload/api/*` | Drift | High | Detect invoke-vs-register drift automatically | Remediated with test |
| Renderer reliability | `src/components/ErrorBoundary.tsx`, `src/components/ui/*`, `src/pages/*` | Risky | Medium | Fix floating promise and React 19 typing/runtime issues | Remediated |
| Reports, payroll, operations UI | `src/pages/Reports`, `src/pages/Payroll`, `src/pages/Operations` | Stable | Medium | Maintain compatibility under React 19 | Verified by lint/tsc/tests |
| Academic analytics (merit/performance/exam) | `electron/main/services/academic/*AnalysisService.ts`, `MeritListService.ts` | Risky | High | Remove stale student schema assumptions and enforce enrollment-based stream scoping | Remediated with tests |
| Promotion workflow | `electron/main/services/academic/PromotionService.ts`, `electron/main/ipc/academic/promotion-handlers.ts` | Risky | High | Prevent silent success/no-op promotions and enforce session actor + role checks | Remediated |
| Payroll actor + date integrity | `electron/main/ipc/payroll/payroll-handlers.ts` | Risky | High | Remove renderer-trusted actor IDs and UTC date skew in period/payment dates | Remediated with tests |

## Findings by Severity

### Critical

1. Renderer-trusted actor identity in privileged IPC

- Root cause: handlers accepted `userId` from renderer and used it for audit/privileged writes.
- Fix: introduced actor-context wrappers and `resolveActorId` in `electron/main/ipc/ipc-result.ts`; migrated finance/settings/student/operations/auth handlers to session-derived actor identity.

1. Preload API privilege flattening

- Root cause: preload built role API with hardcoded `ADMIN`, exposing broad privileged methods regardless of active session role.
- Fix: replaced with runtime role-aware API in `electron/preload/roleFilter.ts` and role hydration hooks in `electron/preload/index.ts`.

### High

1. Missing invoke channel registrations (contract drift)

- Root cause: preload invoked channels that were not always registered (especially updater channels in non-packaged mode).
- Fix: idempotent registration and disabled safe handlers in `electron/main/updates/autoUpdater.ts`; wiring in `electron/main/index.ts`.

1. Reconciliation workflow incomplete and prompt-based

- Root cause: UI used blocking prompt/alert patterns and lacked complete CSV statement import path.
- Fix: complete modal-driven import and explicit selection-based matching in `src/pages/Finance/Reconciliation/ReconcileAccount.tsx`; robust parser in `src/pages/Finance/Reconciliation/reconcile.logic.ts`.

1. Strict retention policy absent in backups

- Root cause: retention only count-based and could violate policy expectations.
- Fix: implemented daily+monthly strict retention in `electron/main/services/BackupService.ts` with regression test updates.

1. Student statement and balance drift due inconsistent invoice/status normalization

- Root cause: mixed-case invoice statuses and mixed amount columns (`total_amount` vs `amount_due`/`amount`) were handled inconsistently across payment service, credit payment IPC, integration payment path, and collections reporting.
- Fix: standardized invoice outstanding SQL and case-insensitive status handling across payment/reporting modules; corrected overpayment credit behavior to credit only unapplied remainder; hardened statement extraction to include receipt-linked payments when legacy ledger rows have missing or mismatched `student_id`.

1. Payroll workflow renderer crash and non-deterministic feedback

- Root cause: payroll status rendering assumed configuration lookup was always populated and used native `confirm/alert` patterns that bypassed dependable in-app feedback.
- Fix: added safe status fallback rendering, replaced native dialogs with `ConfirmDialog`, and standardized runtime error/toast handling in `src/pages/Payroll/PayrollRun.tsx`.

1. Academic analytics schema drift and invalid stream filtering

- Root cause: services queried removed columns (`student.name`, `student.stream_id`, `term.name`) and used invalid SQL clause ordering for stream filters.
- Fix: migrated analytics to schema-safe name derivation and enrollment-based stream scoping in `ExamAnalysisService`, `PerformanceAnalysisService`, and `MeritListService`; added regression tests.

1. Promotion and report-card logic correctness defects

- Root cause: promotion path could report success when no source enrollment existed; report-card computations could mix term-only scope across years and CBC class rank was off by one.
- Fix: enforced source enrollment preconditions and conflict checks in `PromotionService`; added year scoping and active-enrollment selection in `ReportCardService`; fixed one-based rank and stored subject mapping in `CBCReportCardService`.

1. Untouched IPC modules lacked role guards and trusted renderer-supplied identity

- Root cause: many academic/staff/ops/backup/report/import handlers remained on `safeHandleRaw` and/or consumed renderer-provided `userId` directly.
- Fix: migrated handlers to `safeHandleRawWithRole`, enforced `resolveActorId` mismatch rejection, and removed renderer-trusted actor source in non-finance modules.

### Medium

1. Mock grant compliance validation

- Root cause: placeholder logic did not validate real domain constraints.
- Fix: implemented rule-based compliance checks in `electron/main/services/operations/GrantTrackingService.ts`; added tests.

1. System maintenance debug throw path

- Root cause: hardcoded throw behavior when no fee payments existed.
- Fix: replaced with warning and non-fatal flow in `electron/main/services/SystemMaintenanceService.ts`; added test.

1. CBC strand revenue query defect

- Root cause: invalid SQL alias grouping produced fragile behavior.
- Fix: corrected query in `electron/main/services/cbc/CBCStrandService.ts`; added regression test.

1. React 19 compatibility issues

- Root cause: JSX/typing assumptions from React 18 and older types.
- Fix: upgraded `react`/`react-dom` and types to 19.x; adjusted typings in `ErrorBoundary`, `ImportDialog`, `Tooltip`, `Approvals`, `FeeStructure`, and `Settings` pages.

## Exact Implemented Remediations

### Security boundary and authorization

- Session actor resolution and mismatch rejection in `electron/main/ipc/ipc-result.ts`.
- Privileged channel actor enforcement added in:
  - `electron/main/ipc/finance/finance-handlers.ts`
  - `electron/main/ipc/finance/budget-handlers.ts`
  - `electron/main/ipc/finance/bank-handlers.ts`
  - `electron/main/ipc/finance/approval-handlers.ts`
  - `electron/main/ipc/finance/fixed-asset-handlers.ts`
  - `electron/main/ipc/finance/gl-account-handlers.ts`
  - `electron/main/ipc/finance/opening-balance-handlers.ts`
  - `electron/main/ipc/finance/period-handlers.ts`
  - `electron/main/ipc/finance/reconciliation-budget-handlers.ts`
  - `electron/main/ipc/settings/settings-handlers.ts`
  - `electron/main/ipc/student/student-handlers.ts`
  - `electron/main/ipc/auth/auth-handlers.ts`
  - `electron/main/ipc/academic/cbc-handlers.ts`
  - `electron/main/ipc/operations/cbc-operations-handlers.ts`
  - `electron/main/ipc/academic/promotion-handlers.ts`
  - `electron/main/ipc/payroll/payroll-handlers.ts`
  - `electron/main/ipc/academic/academic-handlers.ts`
  - `electron/main/ipc/academic/academic-system-handlers.ts`
  - `electron/main/ipc/academic/attendance-handlers.ts`
  - `electron/main/ipc/academic/awards-handlers.ts`
  - `electron/main/ipc/academic/exam-analysis-handlers.ts`
  - `electron/main/ipc/academic/jss-handlers.ts`
  - `electron/main/ipc/academic/merit-list-handlers.ts`
  - `electron/main/ipc/academic/performance-analysis-handlers.ts`
  - `electron/main/ipc/academic/report-card-analytics-handlers.ts`
  - `electron/main/ipc/academic/reportcard-handlers.ts`
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

### Preload hardening

- Runtime role-aware, least-privilege API filtering in `electron/preload/roleFilter.ts`.
- Session role synchronization on login/session changes in `electron/preload/index.ts`.

### Contract and update channels

- Added invoke/handler parity regression test in `electron/main/ipc/__tests__/ipc-contract-parity.test.ts`.
- Added safe updater fallback handlers for dev/non-packaged mode in `electron/main/updates/autoUpdater.ts` and registration orchestration in `electron/main/index.ts`.

### Incomplete/orphaned implementation fixes

- Reconciliation import and matching completion: `src/pages/Finance/Reconciliation/ReconcileAccount.tsx`, `src/pages/Finance/Reconciliation/reconcile.logic.ts`.
- Depreciation period logic completion: `src/pages/Finance/FixedAssets/Depreciation.tsx`.
- Removed duplicated CBC renderer implementations by consolidating finance paths to academic canonical modules:
  - `src/pages/Finance/CBC/JSSTransition.tsx`
  - `src/pages/Finance/CBC/CBCStrandManagement.tsx`
- Backup retention strict policy: `electron/main/services/BackupService.ts`.
- Grant compliance logic replacement: `electron/main/services/operations/GrantTrackingService.ts`.
- System maintenance non-fatal journal seed path: `electron/main/services/SystemMaintenanceService.ts`.

### Quality and bug fixes

- Fixed ErrorBoundary floating promise handling in `src/components/ErrorBoundary.tsx`.
- Hardened `payment:record` handler against undefined service returns in `electron/main/ipc/finance/finance-handlers.ts`.
- Corrected CBC strand SQL alias in `electron/main/services/cbc/CBCStrandService.ts`.
- Unified fee invoice amount/status normalization in:
  - `electron/main/services/finance/PaymentService.internal.ts`
  - `electron/main/services/finance/PaymentService.ts`
  - `electron/main/services/finance/PaymentIntegrationService.ts`
  - `electron/main/ipc/finance/finance-handlers.ts`
- Corrected collection/payment transaction-type semantics for reports:
  - `electron/main/services/reports/AgedReceivablesService.ts`
  - `electron/main/services/reports/SegmentProfitabilityService.ts`
  - `electron/main/services/reports/StudentLedgerService.ts`
- Hardened student statement extraction against legacy payment-link drift:
  - `electron/main/services/accounting/OpeningBalanceService.ts`
- Stabilized payroll run UX and crash safety:
  - `src/pages/Payroll/PayrollRun.tsx`
- Fixed academic analytics and ranking logic:
  - `electron/main/services/academic/ExamAnalysisService.ts`
  - `electron/main/services/academic/PerformanceAnalysisService.ts`
  - `electron/main/services/academic/MeritListService.ts`
  - `electron/main/services/academic/ReportCardService.ts`
  - `electron/main/services/academic/CBCReportCardService.ts`
  - `electron/main/services/academic/PromotionService.ts`

## Test Coverage Added/Updated

Added:

- `electron/main/ipc/__tests__/ipc-contract-parity.test.ts`
- `electron/main/services/cbc/__tests__/CBCStrandService.test.ts`
- `electron/main/services/__tests__/SystemMaintenanceService.test.ts`
- `electron/main/services/finance/__tests__/PaymentIntegrationService.test.ts`
- `electron/main/services/reports/__tests__/AgedReceivablesService.normalization.test.ts`
- `electron/main/services/academic/__tests__/PromotionService.test.ts`
- `electron/main/services/academic/__tests__/MeritListService.test.ts`
- `electron/main/services/academic/__tests__/PerformanceAnalysisService.test.ts`
- `electron/main/services/academic/__tests__/ExamAnalysisService.test.ts`
- `electron/main/services/academic/__tests__/CBCReportCardService.test.ts`
- `electron/main/ipc/academic/__tests__/promotion-handlers.test.ts`
- `electron/main/ipc/payroll/__tests__/payroll-handlers.test.ts`
- `electron/main/ipc/academic/__tests__/academic-system-handlers.test.ts`
- `electron/main/ipc/inventory/__tests__/inventory-handlers.test.ts`
- `electron/main/ipc/workflow/__tests__/approval-handlers.test.ts`
- `electron/main/ipc/backup/__tests__/backup-handlers.test.ts`
- `electron/main/ipc/operations/__tests__/operations-handlers.test.ts`
- `electron/main/ipc/data/__tests__/import-handlers.test.ts`
- `electron/main/ipc/notifications/__tests__/notification-handlers.test.ts`

Updated:

- `electron/main/ipc/finance/__tests__/finance-handlers.test.ts`
- `electron/main/ipc/finance/__tests__/approval-handlers.test.ts`
- `electron/main/ipc/finance/__tests__/bank-handlers.test.ts`
- `electron/main/ipc/hire/__tests__/hire-handlers.test.ts`
- `electron/main/ipc/reports/__tests__/scheduler-handlers.test.ts`
- `electron/main/ipc/reports/__tests__/reports-handlers.test.ts`
- `electron/main/ipc/reports/__tests__/financial-reports-handlers.test.ts`
- `electron/main/services/__tests__/BackupService.test.ts`
- `electron/main/services/operations/__tests__/GrantTrackingService.test.ts`
- `src/pages/Finance/Reconciliation/__tests__/reconcile.logic.test.ts`
- `electron/main/services/finance/__tests__/PaymentService.test.ts`
- `electron/main/services/reports/__tests__/SegmentProfitabilityService.test.ts`
- `electron/main/services/reports/__tests__/StudentLedgerService.test.ts`
- `electron/main/services/accounting/__tests__/OpeningBalanceService.test.ts`
- `electron/main/__tests__/integration/financial.integration.test.ts`
- `electron/main/services/academic/__tests__/ReportCardService.test.ts`
- `src/pages/Students/__tests__/promotion-feedback.logic.test.ts`

## Final Gate Verification

- `npx tsc --noEmit`: passed
- `npm run lint:eslint`: passed (0 errors, 0 warnings)
- `npm run lint:architecture`: passed (`no dependency violations found`)
- `npm test -- --run`: passed (`72 files`, `720 passed` tests)
- `npm audit --audit-level=high`: passed (`found 0 vulnerabilities`)

## Residual Risk

- No unresolved high-severity or medium-severity security findings from this remediation pass.
