# Remediation Execution Checklist

Generated: 2026-02-14  
Companion: `docs/remediation-plan.md`  
Coverage target: BL-001 through BL-020 (100%).

## 1. Governance and Quality Gates

- [x] CHK-001: Freeze schema contract for finance core tables (`ledger_transaction`, `journal_entry`, `fee_invoice`, `payment_invoice_allocation`, `bank_statement_line`, `approval_request`, `transaction_approval`).
- [x] CHK-002: Define canonical source-of-truth per report type (ledger-based vs journal-based) and document parity assertions.
- [x] CHK-003: Add regression test suite mapping each bug ID to at least one failing-then-passing test.
- [x] CHK-004: Require DB migration dry-run + rollback plan for all schema changes.
- [x] CHK-005: Require seeded end-to-end smoke run: payment -> void -> reports -> reconciliation.

## 2. P0 Checklist (Critical Consistency)

- [x] CHK-101 (BL-001): Replace `payment:payWithCredit` inline implementation with service-backed pipeline.  
  Files: `electron/main/ipc/finance/finance-handlers.ts:205-301`, `electron/main/services/finance/PaymentService.internal.ts`
- [x] CHK-102 (BL-001): Ensure credit payments create receipt rows.  
  Files: `electron/main/services/finance/PaymentService.internal.ts:357-377`
- [x] CHK-103 (BL-001): Ensure credit payments write `payment_invoice_allocation`.  
  Files: `electron/main/services/finance/PaymentService.internal.ts:379-390`
- [x] CHK-104 (BL-001): Ensure credit payments create journal entries with same behavior as regular payments.  
  Files: `electron/main/services/finance/PaymentService.internal.ts:501-513`
- [x] CHK-105 (BL-003): Extend journal entry write path to persist `source_ledger_txn_id`.  
  Files: `electron/main/services/accounting/DoubleEntryJournalService.ts:20-30`, `electron/main/services/accounting/DoubleEntryJournalService.ts:183-200`
- [x] CHK-106 (BL-003): Pass ledger transaction ID into journal creation from payment processor.  
  Files: `electron/main/services/finance/PaymentService.internal.ts:491-515`
- [x] CHK-107 (BL-002): On void, locate and void linked journal in same transaction as ledger void.  
  Files: `electron/main/services/finance/PaymentService.internal.ts:613-705`
- [x] CHK-108 (BL-002): Verify invoice status rollback logic supports `PAID` state in fallback path.  
  Files: `electron/main/services/finance/PaymentService.internal.ts:695-704`
- [x] CHK-109 (BL-001/002/003): Add integration tests for record payment, credit payment, and void parity across ledger/journal/reports.  
  Files: `electron/main/services/finance/__tests__/PaymentService.test.ts`, `electron/main/services/accounting/__tests__/ReconciliationService.test.ts`

## 3. P1 Checklist (High Risk)

- [x] CHK-201 (BL-004): Replace `status != 'PAID'` invoice filters with explicit payable statuses.
- [x] CHK-202 (BL-004): Block payment application to `CANCELLED` invoices in both regular and credit flows.
- [x] CHK-203 (BL-005): Exclude `is_voided = 1` rows from invoice payment reconciliation check.
- [x] CHK-204 (BL-006): Convert budget enforcement error path from fail-open to fail-closed.
- [x] CHK-205 (BL-007): Wire budget validation into transaction create flow before inserts.
- [x] CHK-206 (BL-007): Add override mechanism for admins with explicit audit event when forcing over-budget transactions.
- [x] CHK-207 (BL-009): Apply create-time validation logic to scheduler update path.
- [x] CHK-208 (BL-008): Replace scheduler simulation with actual report generation and send path.
- [x] CHK-209 (BL-010): Update Scheduled Reports UI to respect `success`/`errors` payload and keep modal open on failure.
- [x] CHK-210 (BL-011): Implement or disable `TERM_END` and `YEAR_END` schedule types.
- [x] CHK-211 (BL-012): Sanitize restore filename/path to enforce backup-dir confinement.
- [x] CHK-212 (BL-013): Abort restore if safety backup fails.
- [x] CHK-213 (BL-014): Replace delete-then-backup write with temp-file atomic swap.
- [x] CHK-214 (BL-015): Add strict bank statement line validation (date, amount sign, debit/credit exclusivity, required description).
- [x] CHK-215 (BL-016): Add UI action and workflow for `markReconciled` with status feedback.
- [x] CHK-216 (BL-016): Add uniqueness and integrity constraints for bank account and statement identity.
- [x] CHK-217 (BL-017): Select canonical approval model and map each domain event to one approval table.
- [x] CHK-218 (BL-017): Add migration/backfill to reconcile duplicate approval states.

## 4. P2 Checklist (Medium Risk)

- [x] CHK-301 (BL-018): Add date validation policy at attendance IPC boundary.
- [x] CHK-302 (BL-018): Add date validation policy inside `AttendanceService.markAttendance`.
- [x] CHK-303 (BL-019): Replace UTC ISO default date generation in attendance UI with local-date helper.
- [x] CHK-304 (BL-020): Replace hardcoded opening balance and financing placeholders in cash flow.
- [x] CHK-305 (BL-020): Replace category-name heuristic for investing activity classification.

## 5. Evidence Checklist (Verification Artifacts)

- [x] CHK-401: Attach SQL before/after snapshots for payment, receipt, journal, and invoice rows per test scenario.
- [x] CHK-402: Attach reconciliation run output proving no false-positive drift after fixes.
- [x] CHK-403: Attach scheduler execution logs with real generated output and recipient counts.
- [x] CHK-404: Attach backup restore negative tests (bad path, failed pre-restore backup, interrupted write).
- [x] CHK-405: Attach attendance timezone/date-boundary tests.
- [x] CHK-406: Attach approval migration diff showing canonical queue parity.

## 6. Mandatory Gap Category Coverage Matrix

| Mandatory category | Checklist IDs |
|---|---|
| Missing validation | CHK-207, CHK-211, CHK-214, CHK-301, CHK-302 |
| Inconsistent calculations | CHK-201, CHK-203, CHK-304, CHK-305 |
| Incorrect lifecycle handling | CHK-101, CHK-107, CHK-202, CHK-215, CHK-217 |
| Broken reconciliation logic | CHK-105, CHK-106, CHK-203, CHK-215 |
| Incomplete rollback/transaction behavior | CHK-107, CHK-212, CHK-213 |
| Reporting mismatches vs source-of-truth | CHK-104, CHK-109, CHK-208, CHK-304 |
| UI indicates success but persistence fails | CHK-209 |
| Race conditions/out-of-order updates | CHK-109, CHK-214, CHK-215 |
| Orphaned/unreachable features | CHK-210, CHK-215, CHK-217 |

## 7. Bug-to-Checklist Traceability

| Bug ID | Checklist IDs |
|---|---|
| BL-001 | CHK-101, CHK-102, CHK-103, CHK-104, CHK-109 |
| BL-002 | CHK-107, CHK-108, CHK-109 |
| BL-003 | CHK-105, CHK-106, CHK-109 |
| BL-004 | CHK-201, CHK-202 |
| BL-005 | CHK-203 |
| BL-006 | CHK-204 |
| BL-007 | CHK-205, CHK-206 |
| BL-008 | CHK-208 |
| BL-009 | CHK-207 |
| BL-010 | CHK-209 |
| BL-011 | CHK-210 |
| BL-012 | CHK-211 |
| BL-013 | CHK-212 |
| BL-014 | CHK-213 |
| BL-015 | CHK-214 |
| BL-016 | CHK-215, CHK-216 |
| BL-017 | CHK-217, CHK-218 |
| BL-018 | CHK-301, CHK-302 |
| BL-019 | CHK-303 |
| BL-020 | CHK-304, CHK-305 |

## 8. Exit Criteria (100% Completion)

- [x] All checklist items CHK-001 through CHK-406 are complete.
- [x] All bug IDs BL-001 through BL-020 have merged fixes and passing tests.
- [x] No critical/high reconciliation failures in seeded environment after remediation.
- [ ] Product sign-off: payment, bank reconciliation, reports, approvals, backup, and attendance flows validated.
