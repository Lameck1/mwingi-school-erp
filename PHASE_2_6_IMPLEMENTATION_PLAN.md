# Phase 2-6 Implementation Plan

## Overview
This document provides a detailed, actionable plan to complete all pending deliverables from the financial system audit improvements.

**Current Status:** Phase 1 - 70% complete (Foundation implemented)
**Target:** Complete Phases 2-6 to achieve audit score of 8.5/10 (Production-Ready)

---

## PRIORITY 1: SERVICE INTEGRATION (Critical - Week 1-2)

### 1.1 Update Payment Flow to Use Double-Entry Accounting
**Files to modify:**
- `electron/main/services/finance/PaymentService.ts`
- `electron/main/ipc/finance/finance-handlers.ts`

**Changes:**
1. Import and inject `DoubleEntryJournalService`
2. Replace direct `ledger_transaction` inserts with journal entries
3. Create journal entry: Debit Bank/Cash, Credit Accounts Receivable
4. Maintain backward compatibility during transition

**Expected Outcome:**
- All new payments create balanced journal entries
- Old payment flow still works for historical data
- Trial Balance reflects all new payments

---

### 1.2 Update Invoice Creation to Generate Journal Entries
**Files to modify:**
- `electron/main/ipc/finance/finance-handlers.ts` (createInvoice handler)

**Changes:**
1. When invoice is created, generate journal entry
2. Debit: Accounts Receivable (1100)
3. Credit: Revenue account based on fee category (4010-4050)
4. Link journal entry to invoice record

**Expected Outcome:**
- Invoices automatically create revenue recognition entries
- Balance Sheet shows accurate receivables
- Revenue appears in GL immediately

---

### 1.3 Create Payroll Journal Service
**New file:**
- `electron/main/services/finance/PayrollJournalService.ts`

**Features:**
1. `postSalaryExpense(payrollId)` - Creates journal entry for gross salary
   - Debit: Salary Expense (5010/5020)
   - Credit: Salary Payable (2100)

2. `postStatutoryDeductions(payrollId)` - Creates entries for PAYE, NSSF, NHIF
   - Debit: Salary Payable (2100)
   - Credit: PAYE Payable (2110), NSSF Payable (2120), NHIF Payable (2130)

3. `postSalaryPayment(payrollId)` - Records actual bank payment
   - Debit: Salary Payable (2100)
   - Credit: Bank Account (1020)

**Integration point:**
- `electron/main/ipc/payroll/payroll-handlers.ts` - Call after payroll run approved

---

### 1.4 Data Migration Service
**New file:**
- `electron/main/services/accounting/DataMigrationService.ts`

**Features:**
1. `migrateHistoricalTransactions()` - Convert old ledger_transaction records
   - Read from `ledger_transaction` table
   - Create equivalent journal entries
   - Mark as migrated (add `is_migrated` flag)
   - Dry-run mode for testing

2. `validateMigration()` - Verify migration accuracy
   - Compare old total debits/credits
   - Compare new trial balance
   - Report discrepancies

**Expected Outcome:**
- All historical transactions available in new format
- Trial Balance includes complete history
- Old table preserved for reference

---

## PRIORITY 2: FINANCIAL REPORTS UI (Week 3-4)

### 2.1 Balance Sheet Page
**New file:**
- `src/pages/Finance/Reports/BalanceSheet.tsx`

**Features:**
- Date picker (As of Date)
- Asset section (1000-1999)
- Liability section (2000-2999)
- Equity section (3000-3999)
- Verification indicator: Assets = Liabilities + Equity
- PDF export button
- Drill-down to GL account details

**API endpoint:**
- `electron/main/ipc/reports/financial-reports-handlers.ts` - Add getBalanceSheet handler

---

### 2.2 Profit & Loss Statement Page
**New file:**
- `src/pages/Finance/Reports/ProfitAndLoss.tsx`

**New service:**
- `electron/main/services/accounting/ProfitAndLossService.ts`

**Features:**
- Date range picker (Start - End)
- Revenue section (4000-4999) with subtotals
- Expense section (5000-5999) with subtotals
- Net Profit/Loss calculation
- Comparative columns (This Period vs Prior Period)
- PDF export

---

### 2.3 Trial Balance Page
**New file:**
- `src/pages/Finance/Reports/TrialBalance.tsx`

**Features:**
- Date range picker
- All GL accounts with debit/credit totals
- Total row showing sum of debits and credits
- Balance indicator (✓ Balanced / ✗ Out of Balance)
- Drill-down to account transactions
- Export to Excel

---

### 2.4 General Ledger Report
**New file:**
- `src/pages/Finance/Reports/GeneralLedger.tsx`

**New service:**
- `electron/main/services/accounting/GeneralLedgerService.ts`

**Features:**
- GL account selector
- Date range picker
- Transaction list with running balance
- Opening/closing balance
- Filter by transaction type
- PDF/Excel export

---

## PRIORITY 3: GL ACCOUNT MANAGEMENT UI (Week 5)

### 3.1 Chart of Accounts Page
**New file:**
- `src/pages/Finance/Settings/ChartOfAccounts.tsx`

**Features:**
- List all GL accounts grouped by type
- Add new account (with parent account selection)
- Edit account (name, description, active status)
- Cannot delete system accounts
- Cannot modify account codes (immutable)
- Search/filter by code or name

**API endpoints:**
- `electron/main/ipc/finance/gl-account-handlers.ts`
  - listGLAccounts()
  - createGLAccount()
  - updateGLAccount()
  - deactivateGLAccount()

---

### 3.2 Expense Category Mapping
**Modify file:**
- `electron/main/database/migrations/011_chart_of_accounts.ts`

**Add table:**
```sql
CREATE TABLE expense_category_mapping (
  id INTEGER PRIMARY KEY,
  expense_category TEXT NOT NULL,
  gl_account_id INTEGER NOT NULL,
  FOREIGN KEY (gl_account_id) REFERENCES gl_account(id)
);
```

**Seed default mappings:**
- Transport → 5200 (Transport - Fuel & Maintenance)
- Utilities → 5300 (Utilities - Electricity)
- Supplies → 5400 (Supplies - Stationery)
- etc.

**Update SegmentProfitabilityService:**
- Replace `description LIKE '%transport%'` with GL account queries

---

## PRIORITY 4: APPROVAL WORKFLOW UI (Week 6)

### 4.1 Approval Queue Page
**New file:**
- `src/pages/Finance/Approvals/ApprovalQueue.tsx`

**Features:**
- List pending approvals
- Filter by type (Void, Payment, Refund)
- View journal entry details
- Approve/Reject with notes
- Approval history log

**API endpoints:**
- `electron/main/ipc/finance/approval-handlers.ts`
  - getApprovalQueue(userId, role)
  - approveTransaction(approvalId, notes)
  - rejectTransaction(approvalId, reason)

---

### 4.2 Notifications for Pending Approvals
**Modify file:**
- `electron/main/services/notifications/NotificationService.ts`

**Add method:**
```typescript
async notifyApprovalRequired(
  approvalRequest: TransactionApproval,
  approverRole: string
): Promise<void>
```

**Integration:**
- Call when approval request created
- Send email/SMS to users with approver role
- Include approval link/reference

---

## PRIORITY 5: RECONCILIATION & DATA INTEGRITY (Week 7-8)

### 5.1 Credit Balance Reconciliation Job
**New file:**
- `electron/main/services/jobs/ReconciliationJob.ts`

**Features:**
1. `reconcileStudentCreditBalances()` - Nightly job
   - Calculate: `SUM(credit_transaction)` per student
   - Compare with `student.credit_balance`
   - Log discrepancies > Kes 1,000
   - Send alert email

2. `reconcileGLAccounts()` - Monthly job
   - Verify trial balance is balanced
   - Compare GL balances with subsidiary ledgers
   - Generate reconciliation report

**Scheduler:**
- Use existing scheduler or add cron-style job scheduler
- Run at 2:00 AM daily

---

### 5.2 Opening Balance Import UI
**New file:**
- `src/pages/Finance/Settings/ImportOpeningBalances.tsx`

**Features:**
- CSV/Excel file upload
- Template download (with sample data)
- Preview imported data
- Validation (debits = credits)
- Bulk import with progress indicator
- Error report for invalid entries

**CSV Format:**
```csv
student_id,admission_number,student_name,opening_balance,balance_type
101,ADM001,John Doe,12000,DEBIT
102,ADM002,Jane Smith,5000,CREDIT
```

---

## PRIORITY 6: BUDGET ENFORCEMENT (Week 9)

### 6.1 Budget vs Actual Validation
**Modify file:**
- `electron/main/services/finance/BudgetService.ts`

**Add method:**
```typescript
async validateExpenseAgainstBudget(
  glAccountCode: string,
  amount: number,
  periodId: number
): Promise<{
  allowed: boolean;
  budgetRemaining: number;
  utilizationPercentage: number;
}>
```

**Integration:**
- Call before creating expense journal entries
- If budget exceeded, require approval or reject

---

### 6.2 Budget Alerts
**New service:**
- `electron/main/services/finance/BudgetAlertService.ts`

**Features:**
- Monitor budget utilization
- Send alert at 80% utilization
- Send alert at 100% utilization
- Weekly budget summary report

---

## PRIORITY 7: TESTING (Week 10)

### 7.1 Unit Tests
**New test files:**
- `electron/main/services/accounting/__tests__/DoubleEntryJournalService.test.ts`
- `electron/main/services/accounting/__tests__/OpeningBalanceService.test.ts`
- `electron/main/services/finance/__tests__/PayrollJournalService.test.ts`

**Test coverage:**
- Journal entry creation (balanced/unbalanced)
- Approval workflow triggering
- Opening balance verification
- Trial balance calculation
- Balance sheet generation

---

### 7.2 Integration Tests
**New test file:**
- `electron/main/services/__tests__/accounting.integration.test.ts`

**Test scenarios:**
1. Payment flow: Payment → Journal Entry → Receipt → Trial Balance
2. Invoice flow: Invoice → Journal Entry → Payment → GL Balance
3. Payroll flow: Payroll Run → Journal Entry → Bank Payment
4. Void flow: Void Request → Approval → Reversal Entry

---

## IMPLEMENTATION SEQUENCE

### Week 1: Core Service Integration
- [ ] Day 1-2: Update PaymentService
- [ ] Day 3-4: Update Invoice creation
- [ ] Day 5: Testing and validation

### Week 2: Payroll & Migration
- [ ] Day 1-2: Create PayrollJournalService
- [ ] Day 3-4: Create DataMigrationService
- [ ] Day 5: Test migration with sample data

### Week 3-4: Financial Reports UI
- [ ] Week 3: Balance Sheet + Trial Balance pages
- [ ] Week 4: P&L Statement + General Ledger pages

### Week 5-6: Management & Approvals
- [ ] Week 5: Chart of Accounts UI + Expense mapping
- [ ] Week 6: Approval Queue UI + Notifications

### Week 7-8: Reconciliation
- [ ] Week 7: Credit balance reconciliation + Jobs
- [ ] Week 8: Opening balance import UI

### Week 9: Budget Enforcement
- [ ] Day 1-3: Budget validation logic
- [ ] Day 4-5: Budget alerts

### Week 10: Testing & Documentation
- [ ] Day 1-3: Unit tests
- [ ] Day 4-5: Integration tests

---

## SUCCESS CRITERIA

### Phase 2 Complete When:
- ✅ All payments create journal entries
- ✅ All invoices create journal entries
- ✅ Payroll creates journal entries
- ✅ Historical data migrated
- ✅ Financial reports accessible via UI
- ✅ Trial Balance consistently balanced

### Phase 3-6 Complete When:
- ✅ Chart of Accounts manageable via UI
- ✅ Approval queue functional
- ✅ Reconciliation jobs running
- ✅ Budget enforcement active
- ✅ All tests passing
- ✅ Audit score ≥ 8.5/10

---

## RISK MITIGATION

1. **Parallel Running**
   - Run old and new systems side-by-side for 1 term
   - Compare outputs daily
   - Fix discrepancies immediately

2. **Data Migration Testing**
   - Test migration on copy of production database
   - Verify trial balance before/after
   - Rollback plan if issues found

3. **User Training**
   - 2-day training for finance staff
   - 1-day training for managers (approvals)
   - User documentation and video tutorials

4. **Performance Monitoring**
   - Monitor journal entry creation time
   - Optimize slow queries
   - Add database indexes as needed

---

**Next Action:** Begin Week 1 implementation (Payment Service integration)
**Estimated Completion:** 10 weeks from start
**Target Audit Score:** 8.5/10 (Production-Ready)
