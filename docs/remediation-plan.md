# Business Logic Remediation Plan (Session Audit)

Generated: 2026-02-14  
Scope: Desktop app business logic audit across UI -> renderer state -> preload/API -> IPC -> service -> persistence/reporting.

## 1. Feature Inventory Table

| ID | Feature | Expected Behavior | Primary Implementation | Risk |
|---|---|---|---|---|
| FR-01 | Payment recording and voiding | One payment creates consistent ledger, receipt, invoice allocation, journal entry; void reverses all linked artifacts consistently | `electron/main/ipc/finance/finance-handlers.ts`, `electron/main/services/finance/PaymentService.ts`, `electron/main/services/finance/PaymentService.internal.ts`, `electron/main/services/accounting/DoubleEntryJournalService.ts` | Critical |
| FR-02 | Credit-balance payment | Credit payment must follow same accounting/persistence invariants as normal payment | `electron/main/ipc/finance/finance-handlers.ts` (`payment:payWithCredit`) | Critical |
| FR-03 | Invoice settlement lifecycle | Invoice `amount_paid` and `status` must reflect source-of-truth payment/credit allocations only | `electron/main/services/finance/PaymentService.internal.ts`, `electron/main/services/accounting/ReconciliationService.ts` | High |
| FR-04 | Financial reports source-of-truth parity | GL reports, transaction summaries, and reconciliation checks should reconcile without drift | `electron/main/ipc/reports/financial-reports-handlers.ts`, `electron/main/ipc/reports/reports-handlers.ts`, `electron/main/services/accounting/ReconciliationService.ts` | High |
| FR-05 | Bank reconciliation | Statement/account lifecycle should support import, matching, final reconciliation, and reporting parity | `src/pages/Finance/Reconciliation/ReconcileAccount.tsx`, `electron/main/services/finance/BankReconciliationService.ts`, `electron/main/ipc/finance/bank-handlers.ts` | High |
| FR-06 | Budget lifecycle and enforcement | Budget setup, approval, allocation, and transaction enforcement must be deterministic and fail-closed | `electron/main/services/finance/BudgetService.ts`, `electron/main/services/accounting/BudgetEnforcementService.ts`, `electron/main/ipc/finance/budget-handlers.ts`, `electron/main/ipc/finance/reconciliation-budget-handlers.ts` | High |
| FR-07 | Scheduled reports | Schedule create/update/delete should lead to real report execution and delivery, with truthful execution logs | `src/pages/Reports/ScheduledReports.tsx`, `electron/main/services/reports/ReportScheduler.ts`, `electron/main/ipc/reports/scheduler-handlers.ts` | High |
| FR-08 | Backup and restore | UI success should mean durable backup/restore safety with rollback and path safety | `src/pages/Backup/index.tsx`, `electron/main/services/BackupService.ts`, `electron/main/ipc/backup/backup-handlers.ts` | High |
| FR-09 | Attendance marking | Marking should be idempotent per student/day/term, date-safe, and context-valid | `src/pages/Attendance/index.tsx`, `electron/main/ipc/academic/attendance-handlers.ts`, `electron/main/services/academic/AttendanceService.ts`, migration `1008_attendance_and_reconciliation_uniqueness.ts` | Medium |
| FR-10 | Approval workflows | One coherent approval model per domain event; avoid split truth tables and conflicting states | `electron/main/ipc/finance/approval-handlers.ts`, `electron/main/ipc/workflow/approval-handlers.ts`, `electron/main/services/workflow/ApprovalService.ts`, `electron/main/ipc/index.ts` | High |
| FR-11 | Reconciliation diagnostics | Reconciliation checks should query canonical schema and avoid false alarms | `electron/main/services/accounting/ReconciliationService.ts` | High |
| FR-12 | Cash flow/forecast reporting | Cash flow output should not rely on placeholders or ambiguous category heuristics | `electron/main/services/finance/CashFlowService.ts` | Medium |

## 2. Feature-by-Feature Gap Report

### FR-01: Payment Recording and Voiding

Expected behavior: Recording a payment writes ledger transaction, receipt, invoice allocations, student credit deltas, and journal entry atomically; voiding reverses invoice allocations/credit and voids linked journal evidence.

User flows:

- Happy path: fee payment recorded -> receipt shown -> invoice settled -> reports and reconciliation agree.
- Failure path: journal insert fails -> entire payment transaction must rollback; user must see explicit failure.
- Failure path: void requested -> linked ledger/journal/audit all move to consistent void state.

Business invariants:

- Each non-voided `FEE_PAYMENT` has exactly one receipt and deterministic invoice allocation ledger.
- Journal and ledger for same payment are linkable (`source_ledger_txn_id` or equivalent).
- Void cannot leave ledger and journal in conflicting states.

Where implemented:

- `electron/main/services/finance/PaymentService.internal.ts:491-516`
- `electron/main/services/finance/PaymentService.internal.ts:613-705`
- `electron/main/services/accounting/DoubleEntryJournalService.ts:174-200`

Gaps:

- No journal linkage column is written from payment path even though reconciliation checks expect linkage via `source_ledger_txn_id`.
  - Evidence: linkage query `electron/main/services/accounting/ReconciliationService.ts:471-480`
  - Missing write in journal insert `electron/main/services/accounting/DoubleEntryJournalService.ts:183-200`
- Void path does not void linked journal entry; it only writes reversal ledger transaction and void flags legacy record.
  - Evidence: `electron/main/services/finance/PaymentService.internal.ts:631-705`
- Fallback invoice reverse logic can mis-state invoice status (`PAID` path absent).
  - Evidence: `electron/main/services/finance/PaymentService.internal.ts:695-704`

Edge cases:

- Concurrent void + reconciliation run can produce temporary mismatches.
- Legacy rows without allocation table trigger fallback reversal behavior.
- Partial allocations with overpayment credit create non-trivial rollback paths.

Data integrity checks:

- Add deterministic link (`journal_entry.source_ledger_txn_id`) and unique check for one active payment->journal.
- Add transactional void of both ledger and linked journal.
- Add idempotent void guard on already-voided journal+ledger pair.

Risk: Critical

Concrete fix plan:

1. Extend `JournalEntryData` and insert statement to accept/write `source_ledger_txn_id`.
2. Pass ledger transaction id from payment processor into journal creation.
3. In void path, lookup linked journal by `source_ledger_txn_id` and call journal void inside same DB transaction.
4. Fix fallback invoice status logic to preserve `PAID` when remaining paid amount still reaches `total_amount`.
5. Add integration tests for record/void/report parity.

### FR-02: Credit-Balance Payment Path

Expected behavior: Credit-balance payment should be functionally equivalent to payment recording with clear attribution of source funds.

User flows:

- Happy path: credit payment settles invoice and appears in receipts, allocation tables, GL reports, and reconciliation.
- Failure path: insufficient credit or invalid invoice should fail before writes.

Business invariants:

- Credit payment must produce receipt + journal + payment-invoice allocation.
- Credit balance decrement must match applied amount exactly.

Where implemented:

- `electron/main/ipc/finance/finance-handlers.ts:205-301`

Gaps:

- Path bypasses `PaymentService.recordPayment`; no receipt insert, no `payment_invoice_allocation`, no journal write.
  - Evidence: only ledger/invoice/student updates in `electron/main/ipc/finance/finance-handlers.ts:273-293`
- Duplicate guard is payload-time-window based only; not durable idempotency key.
  - Evidence: `electron/main/ipc/finance/finance-handlers.ts:240-263`

Edge cases:

- Double submit outside 15s window can produce duplicate postings.
- UI can report success while downstream reconciliation/report parity drifts.

Data integrity checks:

- Route credit payments through same domain service pipeline as standard payments.
- Persist allocation rows and journal entry for every credit payment.
- Add unique idempotency key per intent.

Risk: Critical

Concrete fix plan:

1. Replace handler internals with a dedicated `PaymentService.recordCreditPayment`.
2. Ensure service emits receipt/journal/allocation and audit trail.
3. Add unique idempotency behavior matching `payment:record`.
4. Add end-to-end test against `report:dailyCollection`, trial balance, and reconciliation checks.

### FR-03: Invoice Settlement Lifecycle

Expected behavior: Invoice `amount_paid` and `status` are derived only from active applied sources (payments and credit applications), excluding voided/cancelled artifacts.

User flows:

- Happy path: payment updates invoice status correctly.
- Failure path: void/reversal recalculates invoice status from source allocations.

Business invariants:

- `amount_paid == sum(active applied allocations + applied credit transactions)`.
- Cancelled invoices never receive new payment application.

Where implemented:

- `electron/main/services/finance/PaymentService.internal.ts:392-463`
- `electron/main/services/finance/PaymentService.internal.ts:549-596`
- `electron/main/services/accounting/ReconciliationService.ts:305-386`

Gaps:

- Pending invoice queries use `status != 'PAID'` and can include `CANCELLED`.
  - Evidence: validator query `electron/main/services/finance/PaymentService.internal.ts:195-199`
  - Evidence: allocation query `electron/main/services/finance/PaymentService.internal.ts:426-431`
- Credit handler invoice lookup has no status gate.
  - Evidence: `electron/main/ipc/finance/finance-handlers.ts:216-231`
- Legacy invoice payment reconciliation query includes all `FEE_PAYMENT` rows regardless of `is_voided`.
  - Evidence: `electron/main/services/accounting/ReconciliationService.ts:258-264`

Edge cases:

- Cancelled invoice accidentally reactivated by new payment.
- Voided legacy payment still counted in reconciliation mismatch checks.

Data integrity checks:

- Enforce payable status set (`PENDING`, `PARTIAL`) in all settlement queries.
- Ensure reconciliation SQL excludes `lt.is_voided = 1`.
- Add check constraint/trigger around invoice status transitions.

Risk: High

Concrete fix plan:

1. Replace `status != 'PAID'` with explicit payable statuses.
2. Block payment application for `CANCELLED` invoices.
3. Update reconciliation SQL to filter non-voided payment rows.
4. Add tests for cancelled/voided invoice edge cases.

### FR-04: Financial Reports Source-of-Truth Parity

Expected behavior: Financial summary, GL statements, and reconciliation diagnostics should agree over the same date range.

User flows:

- Happy path: dashboard totals align with detailed reports.
- Failure path: when drift exists, diagnostics identify true root cause (not false positives).

Business invariants:

- Report sources and filters for voided rows are consistent.
- Journal-ledger linkage checks use actually populated linkage fields.

Where implemented:

- `electron/main/ipc/reports/reports-handlers.ts:92-119`
- `electron/main/ipc/reports/financial-reports-handlers.ts:18-116`
- `electron/main/services/accounting/ReconciliationService.ts:466-506`

Gaps:

- Linkage diagnostic assumes `journal_entry.source_ledger_txn_id` population, but writer path does not set it.
  - Evidence: check `electron/main/services/accounting/ReconciliationService.ts:471-480`
  - Missing writer `electron/main/services/accounting/DoubleEntryJournalService.ts:183-200`
- Transaction summary and GL reports rely on different data paths; no parity contract tests.
  - Evidence: summary from `ledger_transaction` in `electron/main/ipc/reports/reports-handlers.ts:92-119`
  - GL from `journal_entry` via `electron/main/ipc/reports/financial-reports-handlers.ts:18-116`

Edge cases:

- Report drift appears only after void flows or credit-only flows.
- Out-of-order writes under retries create temporary parity mismatch.

Data integrity checks:

- Add reconciliation parity tests between dashboard summary and GL delta.
- Add source mapping table/field checks to block orphan financial rows.

Risk: High

Concrete fix plan:

1. Implement linkage writes and backfill.
2. Add parity test suite on same fixture dataset.
3. Add monthly auto-check comparing ledger and GL report totals.

### FR-05: Bank Reconciliation

Expected behavior: Users can create/import statements, match lines, and finalize statement reconciliation with auditable closure.

User flows:

- Happy path: account -> statement -> statement lines -> match -> mark reconciled.
- Failure path: invalid line amounts/date mismatch or duplicate match should fail with deterministic message.

Business invariants:

- Statement lines must be valid debit/credit records.
- Reconciliation finalization should be reachable in UI and persisted once.
- One ledger transaction can match at most one statement line.

Where implemented:

- UI: `src/pages/Finance/BankAccounts.tsx:22-250`, `src/pages/Finance/Reconciliation/ReconcileAccount.tsx:21-235`
- API/IPC: `electron/preload/api/finance.ts:98-149`, `electron/main/ipc/finance/bank-handlers.ts:61-108`
- Service: `electron/main/services/finance/BankReconciliationService.ts:161-403`
- Schema/migration: `electron/main/database/schema/fragments/010_core_schema_part4.ts:4-48`, `electron/main/database/migrations/incremental/1008_attendance_and_reconciliation_uniqueness.ts:37-63`

Gaps:

- UI has no statement creation/import flow despite reconciliation page depending on statements.
  - Evidence: `src/pages/Finance/BankAccounts.tsx:22-250` has account CRUD only.
- UI does not expose final `markReconciled` action.
  - Evidence: no call in `src/pages/Finance/Reconciliation/ReconcileAccount.tsx:156-235` while handler exists at `electron/main/ipc/finance/bank-handlers.ts:102-108`.
- Statement line insertion lacks validation (date format, one-sided amount, non-negative checks).
  - Evidence: `electron/main/ipc/finance/bank-handlers.ts:61-78` and `electron/main/services/finance/BankReconciliationService.ts:161-182`.
- Base schema has no uniqueness on bank account number / statement identity; duplicates can drift.
  - Evidence: `electron/main/database/schema/fragments/010_core_schema_part4.ts:4-32`

Edge cases:

- Timezone conversion in unmatched date range query from UI month boundaries.
  - Evidence: `src/pages/Finance/Reconciliation/ReconcileAccount.tsx:54-63` (`toISOString()` boundary shift risk).
- Concurrent matching across two windows.

Data integrity checks:

- Add DB unique constraints for account number and statement identity.
- Add CHECK constraints for statement-line debit/credit validity.
- Add UI/IPC guardrails for final reconciliation transition.

Risk: High

Concrete fix plan:

1. Build statement ingestion UI (manual or CSV) and wire `createStatement` + `addStatementLine`.
2. Add `markReconciled` CTA in reconciliation page after all lines matched.
3. Add strict validation in handler/service for statement lines.
4. Add uniqueness migrations for account/statement identity.

### FR-06: Budget Lifecycle and Enforcement

Expected behavior: Budget creation/approval/enforcement blocks overspend deterministically and never fails open.

User flows:

- Happy path: budget created -> approved -> allocations set -> transaction validated against budget.
- Failure path: invalid setup or enforcement error blocks transaction with explicit error.

Business invariants:

- Allocation and validation must reject invalid amounts/accounts/users.
- Enforcement errors must fail-closed for protected transaction types.

Where implemented:

- `electron/main/services/finance/BudgetService.ts:64-293`
- `electron/main/services/accounting/BudgetEnforcementService.ts:132-445`
- `electron/main/ipc/finance/budget-handlers.ts:19-49`
- `electron/main/ipc/finance/reconciliation-budget-handlers.ts:49-131`
- `electron/main/ipc/transactions/transactions-handlers.ts:24-93`

Gaps:

- Budget creation IPC does not validate `userId`.
  - Evidence: `electron/main/ipc/finance/budget-handlers.ts:19-22`.
- Budget enforcement allows transactions when validation throws.
  - Evidence: fail-open return `is_allowed: true` in `electron/main/services/accounting/BudgetEnforcementService.ts:255-261`.
- Transaction creation path does not call budget enforcement at all.
  - Evidence: `electron/main/ipc/transactions/transactions-handlers.ts:24-93`.
- Allocation setter lacks input validation for amount/account/user constraints.
  - Evidence: `electron/main/services/accounting/BudgetEnforcementService.ts:132-193`.

Edge cases:

- Negative or zero allocations silently accepted.
- Missing GL account mapping leads to misleading budget statuses.

Data integrity checks:

- Enforce positive allocation constraints and FK existence checks.
- Integrate mandatory validation call in transaction create flow.
- Add immutable audit fields for allocation changes.

Risk: High

Concrete fix plan:

1. Add `validateId` and `validateAmount` in budget IPC create/allocation calls.
2. Change enforcement error strategy to fail-closed (configurable override for admins only).
3. Call `BudgetEnforcementService.validateTransaction` in transaction creation path before writes.
4. Add tests for blocked overspend and error handling.

### FR-07: Scheduled Reports

Expected behavior: Saved schedules trigger real report generation and recipient delivery; UI status reflects true execution outcomes.

User flows:

- Happy path: schedule saved -> runs at due time -> report produced/sent -> execution log has output metadata.
- Failure path: invalid schedule update or execution error should surface in UI and log.

Business invariants:

- UI cannot treat failed create/update as success.
- `TERM_END` and `YEAR_END` schedule types must either execute or be disallowed.

Where implemented:

- UI: `src/pages/Reports/ScheduledReports.tsx:70-101`
- IPC: `electron/main/ipc/reports/scheduler-handlers.ts:23-56`
- Service: `electron/main/services/reports/ReportScheduler.ts:63-106`, `electron/main/services/reports/ReportScheduler.ts:221-254`
- Schema: `electron/main/database/schema/fragments/010_core_schema_part2.ts:110-140`

Gaps:

- Execution is simulated only; no real report generation/email path.
  - Evidence: `electron/main/services/reports/ReportScheduler.ts:224-233`.
- `scheduler:update` path skips validation used in create.
  - Evidence: direct pass-through `electron/main/ipc/reports/scheduler-handlers.ts:45-52`.
- UI save path does not inspect backend success payload.
  - Evidence: `src/pages/Reports/ScheduledReports.tsx:79-85`.
- `TERM_END` and `YEAR_END` schedules are allowed by schema but never run.
  - Evidence: check returns false in `electron/main/services/reports/ReportScheduler.ts:99-102`.

Edge cases:

- Invalid `time_of_day` updates can be persisted via update path.
- False success UX on failed save.

Data integrity checks:

- Enforce uniform validation for create and update.
- Store generated file path and recipients_notified count based on actual send results.

Risk: High

Concrete fix plan:

1. Route scheduler execution through real report generation and notification service.
2. Reuse create validations in update IPC/service.
3. Update UI to block modal close when `success !== true`.
4. Implement or disable unsupported schedule types.

### FR-08: Backup and Restore

Expected behavior: Backup/restore must be path-safe, rollback-safe, and user messaging must reflect true durability outcomes.

User flows:

- Happy path: backup completes and verifies; restore performs pre-restore snapshot and restarts safely.
- Failure path: integrity/path/snapshot failures stop restore and report actionable error.

Business invariants:

- Restore source must be inside backup directory.
- Pre-restore snapshot failure must block overwrite.
- Existing user-provided target files should not be deleted before a successful copy.

Where implemented:

- `electron/main/services/BackupService.ts:83-249`
- `electron/main/ipc/backup/backup-handlers.ts:23-26`
- `src/pages/Backup/index.tsx:50-76`

Gaps:

- Possible path traversal in restore filename handling.
  - Evidence: `path.join(this.BACKUP_DIR, filename)` at `electron/main/services/BackupService.ts:201-205` with no basename/normalized guard.
- Pre-restore backup result is ignored; restore continues even if snapshot failed.
  - Evidence: `await this.createBackup('pre-restore')` not checked at `electron/main/services/BackupService.ts:215-216`.
- Export-to-path deletes existing target before validating backup success.
  - Evidence: `fs.unlinkSync(targetPath)` before backup at `electron/main/services/BackupService.ts:94-98`.

Edge cases:

- Restore from crafted filename outside backup dir.
- Crash between target delete and backup copy.

Data integrity checks:

- Strict filename sanitization (`basename`, normalized prefix check).
- Mandatory pre-restore snapshot success condition.
- Write-to-temp then atomic rename for backup target paths.

Risk: High

Concrete fix plan:

1. Add safe-path guard for restore input.
2. Abort restore when pre-restore snapshot fails.
3. Replace delete-then-write with temp file strategy.
4. Add integration tests for restore failure paths.

### FR-09: Attendance Marking

Expected behavior: Marking attendance is one record per student/day/term with valid date context and consistent summary reporting.

User flows:

- Happy path: teacher selects stream/date, marks students, saves once.
- Failure path: invalid date/context/user or duplicate payload should fail with clear errors.

Business invariants:

- Attendance date should be validated against allowed calendar window.
- Payload must include valid stream/year/term and unique student IDs.

Where implemented:

- UI: `src/pages/Attendance/index.tsx:76-201`
- IPC: `electron/main/ipc/academic/attendance-handlers.ts:19-29`
- Service: `electron/main/services/academic/AttendanceService.ts:75-188`
- DB uniqueness: `electron/main/database/migrations/incremental/1008_attendance_and_reconciliation_uniqueness.ts:12-35`

Gaps:

- Handler does not validate attendance date format or policy.
  - Evidence: `electron/main/ipc/academic/attendance-handlers.ts:19-29`.
- Service validates context and payload rows but not date semantics (future or malformed date path).
  - Evidence: `electron/main/services/academic/AttendanceService.ts:75-86`.
- UI date defaults use `toISOString()` and can shift day by timezone.
  - Evidence: `src/pages/Attendance/index.tsx:83`.

Edge cases:

- Marking wrong local day near UTC midnight.
- Future-date attendance submission.

Data integrity checks:

- Apply `validatePastOrTodayDate` or explicit policy in handler/service.
- Add tests for timezone-sensitive date serialization behavior.

Risk: Medium

Concrete fix plan:

1. Validate date at IPC boundary and service boundary.
2. Replace ISO-UTC date default with local date formatting helper.
3. Add tests for date boundary and duplicate upsert paths.

### FR-10: Approval Workflows

Expected behavior: Domain approvals should use one coherent model per feature with consistent queues, transitions, and reporting.

User flows:

- Happy path: item enters queue, reviewer acts, linked domain entity transitions once.
- Failure path: conflicting approval records should not exist for same domain event.

Business invariants:

- A domain event should map to one approval lifecycle source of truth.
- Queue and stats endpoints should be unambiguous.

Where implemented:

- Finance approval path: `electron/main/ipc/finance/approval-handlers.ts:18-185`
- Workflow approval path: `electron/main/ipc/workflow/approval-handlers.ts:6-59`
- Workflow service: `electron/main/services/workflow/ApprovalService.ts:106-267`
- Both registered: `electron/main/ipc/index.ts:41-83`

Gaps:

- Two independent approval systems (`transaction_approval` vs `approval_request`) are active in same app runtime.
- Inconsistent status propagation and reporting risk across dashboards and queues.

Edge cases:

- One action approved in one table but still pending in the other.
- Reporting ambiguity for "pending approvals".

Data integrity checks:

- Define canonical model by domain and migrate others to compatibility adapters.
- Add unique domain-approval key to prevent duplicate lifecycles.

Risk: High

Concrete fix plan:

1. Choose canonical approval model per domain.
2. Build migration/backfill and API compatibility layer.
3. Deprecate duplicate handlers/routes once parity is validated.

### FR-11: Reconciliation Diagnostics

Expected behavior: Reconciliation checks should be accurate, deterministic, and free of known false positives.

User flows:

- Happy path: nightly run identifies only real mismatches.
- Failure path: diagnostics should not fail due to stale schema assumptions.

Business invariants:

- Every check query must align with current lifecycle semantics (`is_voided`, allocation source, linkage fields).

Where implemented:

- `electron/main/services/accounting/ReconciliationService.ts:103-605`

Gaps:

- Invoice payment check includes voided rows in aggregation.
  - Evidence: `electron/main/services/accounting/ReconciliationService.ts:258-264`.
- Linkage check relies on field not populated by current writer path.
  - Evidence: `electron/main/services/accounting/ReconciliationService.ts:471-480`.

Edge cases:

- Post-void periods generate noisy failures.
- Partial migration environments generate warning storms.

Data integrity checks:

- Add explicit non-void filters in all payment sums.
- Gate linkage checks by feature-flag/migration detection.

Risk: High

Concrete fix plan:

1. Patch check SQL filters and migration guards.
2. Add regression fixtures for voided/allocated payments.
3. Wire reconciliation checks into CI smoke test.

### FR-12: Cash Flow and Forecast

Expected behavior: Cash flow statement and forecast should use production-ready accounting definitions and consistent opening/closing balance methods.

User flows:

- Happy path: cash flow totals are trusted for decision-making.
- Failure path: unknown data should not be silently replaced with placeholders.

Business invariants:

- Opening balance cannot be hardcoded.
- Activity classification must be deterministic and not category-name heuristics.

Where implemented:

- `electron/main/services/finance/CashFlowService.ts:28-167`

Gaps:

- Opening balance hardcoded to `0`.
  - Evidence: `electron/main/services/finance/CashFlowService.ts:123-124`.
- Financing activities are placeholders.
  - Evidence: `electron/main/services/finance/CashFlowService.ts:80-83`.
- Asset outflow classification uses name-like heuristic (`LIKE '%Asset%'`).
  - Evidence: `electron/main/services/finance/CashFlowService.ts:69-75`.

Edge cases:

- Report can materially under/over-state cash by period.
- Forecast mixes sparse historic data with simple averages without confidence signaling.

Data integrity checks:

- Persist canonical account classification for cash-flow mapping.
- Derive opening from bank account and posted-cash journal movements.

Risk: Medium

Concrete fix plan:

1. Replace placeholders with implemented financing flows or mark feature beta/disabled.
2. Build deterministic account mapping for operating/investing/financing.
3. Add reconciliation check for cash-flow closing vs bank-ledger combined balance.

## 3. Top 20 Business Logic Bugs (Ranked)

| Rank | Bug ID | Severity | Issue | Evidence |
|---|---|---|---|---|
| 1 | BL-001 | Critical | Credit payment path skips receipt/journal/allocation writes | `electron/main/ipc/finance/finance-handlers.ts:205-301` |
| 2 | BL-002 | Critical | Payment void does not void linked journal entry | `electron/main/services/finance/PaymentService.internal.ts:613-705` |
| 3 | BL-003 | Critical | Journal writer does not populate `source_ledger_txn_id` required by reconciliation linkage checks | `electron/main/services/accounting/DoubleEntryJournalService.ts:183-200`, `electron/main/services/accounting/ReconciliationService.ts:471-480` |
| 4 | BL-004 | High | Invoice settlement queries include cancelled invoices (`status != 'PAID'`) | `electron/main/services/finance/PaymentService.internal.ts:195-199`, `electron/main/services/finance/PaymentService.internal.ts:426-431` |
| 5 | BL-005 | High | Reconciliation invoice payment check includes voided payments | `electron/main/services/accounting/ReconciliationService.ts:258-264` |
| 6 | BL-006 | High | Budget enforcement fails open on runtime errors | `electron/main/services/accounting/BudgetEnforcementService.ts:255-261` |
| 7 | BL-007 | High | Transaction creation bypasses budget enforcement completely | `electron/main/ipc/transactions/transactions-handlers.ts:24-93` |
| 8 | BL-008 | High | Scheduled report execution is simulated only | `electron/main/services/reports/ReportScheduler.ts:224-233` |
| 9 | BL-009 | High | Scheduled report update path skips time/frequency validation | `electron/main/ipc/reports/scheduler-handlers.ts:45-52` |
| 10 | BL-010 | High | Scheduled reports UI ignores backend success/failure payload and closes modal anyway | `src/pages/Reports/ScheduledReports.tsx:79-85` |
| 11 | BL-011 | High | `TERM_END` and `YEAR_END` schedules are accepted but never execute | `electron/main/services/reports/ReportScheduler.ts:99-102`, `electron/main/database/schema/fragments/010_core_schema_part2.ts:115` |
| 12 | BL-012 | High | Restore path may allow path traversal filename input | `electron/main/services/BackupService.ts:201-205` |
| 13 | BL-013 | High | Restore proceeds even if pre-restore safety backup fails | `electron/main/services/BackupService.ts:215-216` |
| 14 | BL-014 | High | Backup-to-path deletes target before successful backup write | `electron/main/services/BackupService.ts:94-98` |
| 15 | BL-015 | High | Bank statement line ingestion has no strict validation | `electron/main/ipc/finance/bank-handlers.ts:61-78`, `electron/main/services/finance/BankReconciliationService.ts:161-182` |
| 16 | BL-016 | High | Reconciliation UI has no finalization (`markReconciled`) path | `src/pages/Finance/Reconciliation/ReconcileAccount.tsx:156-235`, `electron/main/ipc/finance/bank-handlers.ts:102-108` |
| 17 | BL-017 | High | Dual approval systems active simultaneously (`approval_request` and `transaction_approval`) | `electron/main/ipc/index.ts:41-83`, `electron/main/ipc/finance/approval-handlers.ts:18-185`, `electron/main/ipc/workflow/approval-handlers.ts:6-59` |
| 18 | BL-018 | Medium | Attendance date policy validation is missing at IPC/service boundaries | `electron/main/ipc/academic/attendance-handlers.ts:19-29`, `electron/main/services/academic/AttendanceService.ts:75-86` |
| 19 | BL-019 | Medium | Attendance UI date default uses UTC ISO conversion and can shift local day | `src/pages/Attendance/index.tsx:83` |
| 20 | BL-020 | Medium | Cash flow output relies on placeholders/heuristics (opening=0, financing=0, asset category name match) | `electron/main/services/finance/CashFlowService.ts:69-75`, `electron/main/services/finance/CashFlowService.ts:80-83`, `electron/main/services/finance/CashFlowService.ts:123-124` |

## 4. Remediation Roadmap (By Feature + Risk)

### Phase 0: Already Remediated In Session

- Fixed `BudgetService` class parse/blocker issue.
  - Evidence: `electron/main/services/finance/BudgetService.ts:274-293`
- Added bank API compatibility aliases needed by reconciliation UI.
  - Evidence: `electron/preload/api/finance.ts:98-149`

### Phase 1: Critical Consistency (P0)

Scope: BL-001, BL-002, BL-003  
Owner: Finance domain backend  
Exit criteria:

- Payment, credit payment, and void flows produce consistent ledger/receipt/allocation/journal artifacts.
- Reconciliation linkage check passes on new payments.

Work items:

1. Refactor `payment:payWithCredit` to service-backed unified pipeline.
2. Add `source_ledger_txn_id` propagation in journal writes.
3. Void linked journal entries in same transaction as payment void.
4. Add integration tests for record -> void -> reports parity.

### Phase 2: High-Risk Drift Prevention (P1)

Scope: BL-004..BL-017  
Owner: Finance + reporting + platform  
Exit criteria:

- Invoice settlement and reconciliation queries agree with lifecycle semantics.
- Scheduler and backup features are truthful and safe.
- Approval model is canonicalized per domain.

Work items:

1. Invoice status filter hardening and void-aware reconciliation SQL.
2. Budget enforcement fail-closed + transaction create integration.
3. Scheduler real execution path, update validation parity, and UI success handling.
4. Backup restore path safety + atomic write strategy.
5. Bank statement validation and reconciliation finalization UI.
6. Approval model consolidation roadmap and migration script.

### Phase 3: Medium-Risk Correctness and Operational Hardening (P2)

Scope: BL-018..BL-020  
Owner: Academic + finance reporting  
Exit criteria:

- Attendance date handling stable across timezones/policies.
- Cash flow report marked production-safe or feature-gated.

Work items:

1. Add attendance date validation in handler/service and local-date UI defaults.
2. Replace cash flow placeholders with deterministic model or hide unsupported sections.

### Phase 4: Verification and Closeout (P3)

Scope: Full  
Owner: QA + product engineering  
Exit criteria:

- All bug IDs mapped to merged PRs and automated tests.
- Reconciliation report clean on seeded fixture.
- Regression suite green for payment/reports/budget/attendance/backup/scheduler.

Verification requirements:

- Unit tests for each bug fix path.
- Integration tests spanning UI-triggered IPC to DB state.
- Data migration/backfill scripts for linkage and approval normalization.

## 5. Mandatory Gap Category Coverage

| Category | Covered Bugs |
|---|---|
| Missing validation | BL-009, BL-012, BL-015, BL-018 |
| Inconsistent calculations | BL-004, BL-005, BL-020 |
| Incorrect lifecycle handling | BL-001, BL-002, BL-004, BL-016, BL-017 |
| Broken reconciliation logic | BL-003, BL-005, BL-016 |
| Incomplete rollback/transaction behavior | BL-002, BL-013, BL-014 |
| Reporting mismatch vs source of truth | BL-003, BL-005, BL-008, BL-020 |
| UI indicates success but persistence fails | BL-010 |
| Race conditions/out-of-order updates | BL-001, BL-002, BL-016 |
| Orphaned/unreachable features | BL-011, BL-016, BL-017 |
