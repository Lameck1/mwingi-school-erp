# Mwingi School ERP - Production Readiness Audit Report

**Date:** 2026-02-06
**Auditor:** Principal Software Architect
**Scope:** Full codebase audit (Electron + React)
**Overall Readiness Score:** 35/100
**Go/No-Go:** NO-GO

---

## Executive Summary

This Electron + React school ERP application has a substantial feature surface (~30 modules), but
suffers from **critical integration gaps, security vulnerabilities, dead code, and architectural
anti-patterns** that prevent production deployment. The most urgent issues are:

1. **SQL injection vulnerability** in database encryption key handling
2. **12+ IPC handler modules exist but are never registered** (dead backend code)
3. **20+ preload API methods are missing** (UI calls functions that don't exist in preload)
4. **Duplicate ToastProvider** wrapping causes double-rendering
5. **Debug file-system logging in production code** (writes `sql_debug.log` from BaseService)
6. **Multiple UI pages use mock data instead of real IPC calls**
7. **Duplicate route definition** in App.tsx
8. **Pages exist with no route** (orphaned components)
9. **`sandbox: false`** in BrowserWindow weakens Electron security
10. **`finance/approval-handlers.ts` registers IPC at module load** (not via function export)

---

## PHASE 1: CRITICAL BLOCKERS

### 1.1 SQL Injection in Database Encryption (CRITICAL / Security)

**File:** `electron/main/database/index.ts:49-53`
**Issue:** Encryption key is interpolated directly into a SQL pragma string:
```ts
d.pragma(`key='${k}'`)
```
And also at lines 93, 121. If the key contained a single quote, this would break or be exploitable.

**Violation:** OWASP Injection Prevention. The key is hex-generated so low immediate risk, but the
pattern is dangerous and must be parameterized or escaped.

**Fix:** Use the raw key API that `better-sqlite3-multiple-ciphers` provides, or hex-prefix the key.

---

### 1.2 Twelve IPC Handler Modules Never Registered (CRITICAL / Feature Gap)

**File:** `electron/main/ipc/index.ts`
**Issue:** `registerAllIpcHandlers()` registers 28 handler modules. However, the following handler
files exist in `electron/main/ipc/` but are **never imported or called**:

| # | Handler File | Export Function |
|---|-------------|-----------------|
| 1 | `finance/gl-account-handlers.ts` | `registerGLAccountHandlers` |
| 2 | `finance/opening-balance-handlers.ts` | `registerOpeningBalanceHandlers` |
| 3 | `finance/reconciliation-budget-handlers.ts` | `registerReconciliationAndBudgetHandlers` |
| 4 | `finance/approval-handlers.ts` | None (auto-registers at import) |
| 5 | `reports/financial-reports-handlers.ts` | None (auto-registers at import) |
| 6 | `academic/exam-analysis-handlers.ts` | `registerExamAnalysisHandlers` |
| 7 | `academic/performance-analysis-handlers.ts` | `registerPerformanceAnalysisHandlers` |
| 8 | `academic/report-card-analytics-handlers.ts` | `registerReportCardAnalyticsHandlers` |
| 9 | `academic/cbc-handlers.ts` | `registerCBCHandlers` |
| 10 | `academic/jss-handlers.ts` | `registerJSSHandlers` |
| 11 | `operations/operations-handlers.ts` | `registerOperationsHandlers` |
| 12 | `operations/cbc-operations-handlers.ts` | `registerCbcOperationsHandlers` |

**Impact:** Every UI page that calls these IPC channels will get an unhandled rejection error.
This means: Balance Sheet, P&L, Trial Balance, GL Accounts, Opening Balances, Reconciliation,
Budget Enforcement, Exam Analysis, CBC Strands, JSS Transitions, Operations (Boarding/Transport),
Grant Tracking, Student Cost Analysis are ALL non-functional.

---

### 1.3 Missing Preload Bridge Methods (CRITICAL / Feature Gap)

**File:** `electron/preload/index.ts`
**Issue:** The preload script exposes ~100 methods. However, the `ElectronAPI` TypeScript interface
and UI pages reference ~30+ methods that are **not exposed in the preload script**:

| Missing Method | Used In |
|---------------|---------|
| `getBalanceSheet` | `Finance/Reports/BalanceSheet.tsx:39` |
| `getProfitAndLoss` | `Finance/Reports/ProfitAndLoss.tsx:41` |
| `getTrialBalance` | `Finance/Reports/TrialBalance.tsx:39` |
| `getApprovalQueue` | `Finance/Approvals/ApprovalQueue.tsx:32` |
| `approveTransaction` | `Finance/Approvals/ApprovalQueue.tsx:52` |
| `rejectTransaction` | `Finance/Approvals/ApprovalQueue.tsx:76` |
| `getAssets` | `Finance/FixedAssets/AssetRegister.tsx:39` |
| `createAsset` | `Finance/FixedAssets/AssetRegister.tsx:55` |
| `runDepreciation` | `Finance/FixedAssets/Depreciation.tsx:34` |
| `getAccounts` | `Finance/Reconciliation/ReconcileAccount.tsx:26` |
| `getStatements` | `Finance/Reconciliation/ReconcileAccount.tsx:36` |
| `matchTransaction` | `Finance/Reconciliation/ReconcileAccount.tsx:93` |
| `getTransportRoutes` | `Operations/Transport.tsx:60` |
| `createTransportRoute` | `Operations/Transport.tsx:85` |
| `recordTransportExpense` | `Operations/Transport.tsx:104` |
| `getBoardingFacilities` | `Operations/Boarding.tsx:48` |
| `recordBoardingExpense` | `Operations/Boarding.tsx:76` |
| `getPerformanceSummary` | `Academic/ExamAnalytics.tsx:87` |
| `getGradeDistribution` | `Academic/ExamAnalytics.tsx:91` |
| `getSubjectPerformance` | `Academic/ExamAnalytics.tsx:95` |
| `getStrugglingStudents` | `Academic/ExamAnalytics.tsx:99` |
| `exportAnalyticsToPDF` | `Academic/ExamAnalytics.tsx:125` |
| `getTermComparison` | `Academic/ReportCardAnalytics.tsx:97` |
| `exportReportCardAnalyticsToPDF` | `Academic/ReportCardAnalytics.tsx:122` |
| `getSubjectDifficulty` | `Academic/SubjectMeritLists.tsx:68` |
| `generateCertificate` | `Academic/MostImproved.tsx:107` |
| `emailParents` | `Academic/MostImproved.tsx:130` |
| `calculateStudentCost` | `Finance/StudentCost.tsx:36` |
| `getStudentCostVsRevenue` | `Finance/StudentCost.tsx:39` |
| `getGrantsByStatus` | `Finance/Grants/GrantTracking.tsx:55` |
| `createGrant` | `Finance/Grants/GrantTracking.tsx:72` |
| `recordGrantUtilization` | `Finance/Grants/GrantTracking.tsx:90` |
| `generateNEMISExport` | `Finance/Grants/GrantTracking.tsx:115` |

**Impact:** These pages will crash at runtime with `window.electronAPI.xxx is not a function`.

---

### 1.4 Debug File Logging in Production BaseService (HIGH / Security + Performance)

**File:** `electron/main/services/base/BaseService.ts:56-67`
**Issue:** Every `findById` call writes to `sql_debug.log` via `fs.appendFileSync`. This:
- Writes sensitive SQL queries to disk in plaintext
- Creates a synchronous I/O bottleneck on every read operation
- Will grow unbounded in production
- Leaks table/column names and query structure

---

### 1.5 Duplicate ToastProvider (HIGH / React Anti-pattern)

**File:** `src/main.tsx:9` and `src/App.tsx:60`
**Issue:** `ToastProvider` wraps the app in BOTH `main.tsx` AND inside `App.tsx`. This creates
duplicate context providers and may cause toast messages to fire twice or route to the wrong
provider.

---

### 1.6 Duplicate Route Definition (MEDIUM / Bug)

**File:** `src/App.tsx:97-98`
```tsx
<Route path="budget/:id" element={<BudgetDetails />} />
<Route path="budget/:id" element={<BudgetDetails />} />
```
Exact duplicate route. Only the first will match; the second is dead code.

---

### 1.7 Orphaned Pages (No Route in App.tsx) (MEDIUM / Dead Code)

These page components exist but have **no route** in `App.tsx`:

| Component | File |
|-----------|------|
| `ReportCardGeneration` | `src/pages/Academic/ReportCardGeneration.tsx` |
| `GLAccountManagement` | `src/pages/Finance/Settings/GLAccountManagement.tsx` |
| `OpeningBalanceImport` | `src/pages/Finance/Settings/OpeningBalanceImport.tsx` |
| `BoardingProfitability` | `src/pages/Operations/Boarding/BoardingProfitability.tsx` |
| `TransportRouteManagement` | `src/pages/Operations/Transport/TransportRouteManagement.tsx` |
| `StudentCostAnalysis` | `src/pages/Finance/StudentCost/StudentCostAnalysis.tsx` |
| `GrantTracking` | `src/pages/Finance/Grants/GrantTracking.tsx` |
| `ReconcileAccount` | `src/pages/Finance/Reconciliation/ReconcileAccount.tsx` |
| `ApprovalQueue` | `src/pages/Finance/Approvals/ApprovalQueue.tsx` |
| `AssetRegister` | `src/pages/Finance/FixedAssets/AssetRegister.tsx` |
| `Depreciation` | `src/pages/Finance/FixedAssets/Depreciation.tsx` |
| `BalanceSheet` | `src/pages/Finance/Reports/BalanceSheet.tsx` |
| `ProfitAndLoss` | `src/pages/Finance/Reports/ProfitAndLoss.tsx` |
| `TrialBalance` | `src/pages/Finance/Reports/TrialBalance.tsx` |
| `CBCStrandManagement` | `src/pages/Finance/CBC/CBCStrandManagement.tsx` |
| `JSSTransition` | `src/pages/Finance/CBC/JSSTransition.tsx` |
| `Integrations` | `src/pages/Settings/Integrations.tsx` |
| `MessageTemplates` | `src/pages/Settings/MessageTemplates.tsx` |

---

### 1.8 GLAccountManagement Uses Mock Data (MEDIUM / Incomplete)

**File:** `src/pages/Finance/Settings/GLAccountManagement.tsx:35-36`
```ts
// TODO: Replace with actual IPC call
const mockAccounts: GLAccount[] = [
```
This page renders hardcoded mock data instead of calling the backend.

### 1.9 OpeningBalanceImport Uses Mock Data (MEDIUM / Incomplete)

**File:** `src/pages/Finance/Settings/OpeningBalanceImport.tsx:37-38`
```ts
// TODO: Parse CSV/Excel file
// For now, mock data
```

---

### 1.10 Electron Security: sandbox disabled (HIGH / Security)

**File:** `electron/main/index.ts:43`
```ts
sandbox: false,
```
While `contextIsolation: true` and `nodeIntegration: false` are correctly set, `sandbox: false`
weakens the security model. The preload script can access Node.js APIs that a sandboxed preload
cannot.

---

### 1.11 finance/approval-handlers.ts Auto-registers at Import (HIGH / Architecture)

**File:** `electron/main/ipc/finance/approval-handlers.ts:9-15`
```ts
const db = getDatabase();
ipcMain.handle('approvals:getQueue', async (...) => { ... });
```
This file registers IPC handlers at **module load time** (top-level side effects) rather than
inside an exported registration function. This means:
- The handlers would register if the module is ever imported (even for testing)
- They call `getDatabase()` at module scope, which will throw if DB isn't initialized yet
- They're not called from `registerAllIpcHandlers()` so they're currently dead code

The same pattern applies to `reports/financial-reports-handlers.ts`.

---

### 1.12 BrowserRouter in Electron (MEDIUM / Architecture)

**File:** `src/App.tsx:62`
```tsx
<BrowserRouter>
```
In an Electron app, `BrowserRouter` relies on the History API which doesn't work with `file://`
protocol used in production builds. Should use `HashRouter` instead for packaged builds.

---

## PHASE 1 CONTINUED: Additional Findings

### 1.13 electron-env.ts Bundles bcrypt into Electron Module Proxy (LOW / Architecture)

**File:** `electron/main/electron-env.ts:8`
```ts
export const bcrypt = require('bcryptjs')
```
`bcryptjs` has nothing to do with Electron environment. This file is an Electron module proxy but
incorrectly bundles an authentication library.

### 1.14 Missing Error Boundaries (MEDIUM / React)

No `ErrorBoundary` component exists anywhere in the codebase. If any page throws during render,
the entire app will white-screen.

### 1.15 ServiceContainer Only Registers 5 of 30+ Services (MEDIUM / Architecture)

**File:** `electron/main/services/base/ServiceContainer.ts:75-81`
Only `StudentService`, `BudgetService`, `InventoryService`, `FixedAssetService`, and
`SystemMaintenanceService` are registered. The remaining ~25 services are instantiated directly
in IPC handlers, bypassing the DI container entirely.

### 1.16 Auth State Persisted in localStorage (HIGH / Security)

**File:** `src/stores/index.ts:14-26`
The auth store uses `zustand/persist` which stores `user` (including role, username) in
`localStorage`. In an Electron app, this persists across sessions without protection.
There is no session expiry, no token rotation, and no logout-on-idle.

### 1.17 Windows-Only Build Configuration (MEDIUM / Build)

**File:** `package.json:100-124`
The `build` config only defines `win` targets. No `mac` or `linux` targets are specified.

### 1.18 Google Fonts External Dependency (LOW / Offline)

**File:** `index.html:9-11`
The app loads Google Fonts from CDN. In an offline Electron desktop app, fonts will fail to load.

---

## PHASE 2: REMEDIATION PLAN (Prioritized)

### Priority 1: Critical Fixes (Must fix before any deployment)

| # | Fix | Effort | Type |
|---|-----|--------|------|
| 1 | Register all 12 missing IPC handler modules in `ipc/index.ts` | 30 min | Integration |
| 2 | Add all ~30 missing preload bridge methods in `preload/index.ts` | 1 hr | Integration |
| 3 | Remove `sql_debug.log` writing from `BaseService.ts` | 10 min | Removal |
| 4 | Fix SQL injection pattern in `database/index.ts` pragma calls | 20 min | Security |
| 5 | Remove duplicate `ToastProvider` from `main.tsx` | 5 min | Fix |
| 6 | Remove duplicate route in `App.tsx` | 5 min | Fix |
| 7 | Switch `BrowserRouter` to `HashRouter` for Electron compatibility | 10 min | Fix |

### Priority 2: High-Impact Fixes

| # | Fix | Effort | Type |
|---|-----|--------|------|
| 8 | Convert auto-registering IPC handlers to function exports | 30 min | Refactor |
| 9 | Add routes for all orphaned pages | 30 min | Integration |
| 10 | Add `ErrorBoundary` component | 30 min | Feature |
| 11 | Move `bcrypt` out of `electron-env.ts` | 10 min | Refactor |
| 12 | Add session expiry to auth store | 30 min | Security |

### Priority 3: Quality Improvements

| # | Fix | Effort | Type |
|---|-----|--------|------|
| 13 | Replace mock data in GL Account and Opening Balance pages | 1 hr | Integration |
| 14 | Bundle fonts locally instead of Google CDN | 20 min | Offline |
| 15 | Add Linux/Mac build targets | 20 min | Build |
| 16 | Expand ServiceContainer registration | 1 hr | Refactor |

---

## PHASE 3: Implementation Plan

Based on the remediation plan, I will implement Priority 1 fixes (items 1-7) as these are the
critical blockers that prevent basic functionality. These are the minimum changes needed to move
the readiness score from 35% toward ~65%.
