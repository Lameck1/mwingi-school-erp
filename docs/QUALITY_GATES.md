# Quality Gates for Business Logic Remediation

Generated: 2026-02-14  
Companion docs: `docs/remediation-plan.md`, `docs/remediation-checklist.md`

## Gate G0: Baseline Integrity

Pass criteria:

- `remediation-plan.md` and `remediation-checklist.md` exist and reference BL-001..BL-020.
- Every high/critical bug has an assigned owner and target phase.
- Migration strategy exists for any schema-affecting fixes.

Evidence required:

- Updated docs committed.
- Bug-to-checklist traceability table complete.

## Gate G1: Financial Write Consistency (P0)

Pass criteria:

- Credit payment path writes receipt, allocation, journal, and ledger consistently.
- Payment void updates ledger + journal + invoice state atomically.
- `source_ledger_txn_id` linkage present for all new payment journal entries.

Evidence required:

- Integration test: normal payment flow.
- Integration test: credit payment flow.
- Integration test: void flow with reconciliation check.

## Gate G2: Reconciliation and Reporting Parity (P1)

Pass criteria:

- Reconciliation checks exclude voided payments and no longer emit false-positive invoice drift for test fixtures.
- Dashboard transaction summary and GL reports pass parity tests for same period.
- Bank reconciliation finalization is reachable from UI and persists expected statement status transitions.

Evidence required:

- Reconciliation test outputs.
- Report parity test outputs.
- UI-to-DB test for bank `markReconciled`.

## Gate G3: Operational Safety (P1)

Pass criteria:

- Scheduler runs real execution path or unsupported schedule types are disabled by policy.
- Backup restore path is sanitized and pre-restore safety backup failure blocks overwrite.
- Backup-to-path uses safe write strategy (temp + atomic move).

Evidence required:

- Scheduler execution logs with generated output metadata.
- Negative tests for restore path traversal and failed pre-restore backup.
- Negative test for interrupted backup-to-path write.

## Gate G4: Policy and UX Correctness (P2)

Pass criteria:

- Attendance date validation enforced at IPC and service layers.
- Attendance UI date defaults use local calendar-safe formatting.
- Budget enforcement no longer fails open and transaction create path enforces budget checks.

Evidence required:

- Attendance timezone/date-boundary tests.
- Budget enforcement tests including forced over-budget path auditing.

## Gate G5: Production Readiness Sign-off

Pass criteria:

- All checklist items CHK-001..CHK-406 are complete.
- All bug IDs BL-001..BL-020 are marked fixed or intentionally deferred with explicit risk acceptance.
- No open Critical/High findings without mitigation.

Evidence required:

- `docs/remediation-closeout.md` completed.
- QA sign-off and product sign-off recorded.

## Current Session Status (2026-02-14)

| Gate | Status |
|---|---|
| G0 Baseline Integrity | Pass |
| G1 Financial Write Consistency | Pass |
| G2 Reconciliation and Reporting Parity | Pass |
| G3 Operational Safety | Pass |
| G4 Policy and UX Correctness | Pass |
| G5 Production Readiness Sign-off | In Progress (external product/QA sign-off pending) |
