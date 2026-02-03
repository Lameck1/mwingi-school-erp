# Double-Entry Accounting System - Implementation Guide

## Overview

This document describes the new double-entry accounting system implemented to address critical financial audit findings in the Mwingi School ERP. The system replaces the previous single-entry approach with a true double-entry bookkeeping system that follows international accounting standards.

---

## 1. ARCHITECTURE IMPROVEMENTS

### **Before (Single-Entry)**
```
ledger_transaction:
  - amount: 5000
  - debit_credit: 'CREDIT'  ❌ Flag only, not true double-entry
```

### **After (Double-Entry)**
```
journal_entry:
  - entry_ref: 'FEE-1234567890'
  - description: 'Fee payment received'

journal_entry_line (Line 1):
  - gl_account_code: '1020'  (Bank Account)
  - debit_amount: 5000
  - credit_amount: 0

journal_entry_line (Line 2):
  - gl_account_code: '1100'  (Student Receivable)
  - debit_amount: 0
  - credit_amount: 5000
```

**Benefits:**
- ✅ Mathematical verification: Total Debits = Total Credits
- ✅ Balance Sheet balancing: Assets = Liabilities + Equity
- ✅ Audit trail: Every transaction has dual entries
- ✅ Reporting: Single source of truth for all financial reports

---

## 2. CHART OF ACCOUNTS

The system implements a standardized Kenyan school Chart of Accounts with 50+ accounts organized by type:

### **Account Structure**

| Range | Account Type | Description |
|-------|--------------|-------------|
| 1000-1999 | **ASSETS** | Cash, Bank, Receivables, Fixed Assets |
| 2000-2999 | **LIABILITIES** | Payables, Student Credits, Statutory Deductions |
| 3000-3999 | **EQUITY** | Capital, Retained Earnings |
| 4000-4999 | **REVENUE** | Tuition, Boarding, Transport, Grants |
| 5000-5999 | **EXPENSES** | Salaries, Utilities, Supplies, Depreciation |

### **Key Accounts**

#### Assets
- `1010` - Cash on Hand
- `1020` - Bank Account - KCB
- `1030` - Bank Account - Equity Bank
- `1100` - Accounts Receivable - Students
- `1200` - Inventory - Supplies
- `1300` - Fixed Assets - Buildings
- `1310` - Fixed Assets - Vehicles
- `1390` - Accumulated Depreciation

#### Liabilities
- `2010` - Accounts Payable
- `2020` - Student Credit Balances
- `2100` - Salary Payable
- `2110` - PAYE Payable
- `2120` - NSSF Payable
- `2130` - NHIF/SHIF Payable
- `2140` - Housing Levy Payable

#### Equity
- `3010` - Capital
- `3020` - Retained Earnings
- `3030` - Current Year Surplus/Deficit

#### Revenue
- `4010` - Tuition Fees ✅ **NEW: Separated from generic fees**
- `4020` - Boarding Fees
- `4030` - Transport Fees
- `4040` - Activity Fees
- `4050` - Exam Fees
- `4100` - Government Grants - Capitation
- `4200` - Donations

#### Expenses
- `5010` - Salaries - Teaching Staff
- `5020` - Salaries - Non-Teaching Staff
- `5030` - Statutory Deductions - NSSF
- `5040` - Statutory Deductions - NHIF/SHIF
- `5050` - Statutory Deductions - Housing Levy
- `5100` - Food & Catering - Boarding
- `5200` - Transport - Fuel & Maintenance
- `5210` - Transport - Driver Salaries ✅ **NEW: Separated for profitability analysis**
- `5300` - Utilities - Electricity
- `5310` - Utilities - Water
- `5600` - Depreciation Expense

---

## 3. JOURNAL ENTRY SYSTEM

### **Creating a Journal Entry**

```typescript
import { DoubleEntryJournalService } from './services/accounting/DoubleEntryJournalService';

const journalService = new DoubleEntryJournalService();

// Example: Record a fee payment
const result = await journalService.createJournalEntry({
  entry_date: '2026-02-03',
  entry_type: 'FEE_PAYMENT',
  description: 'Fee payment from John Doe - M-Pesa',
  student_id: 123,
  created_by_user_id: 1,
  lines: [
    {
      gl_account_code: '1020',  // Bank Account
      debit_amount: 25000,      // Kes 250.00 (stored in cents)
      credit_amount: 0,
      description: 'M-Pesa payment received'
    },
    {
      gl_account_code: '1100',  // Accounts Receivable - Students
      debit_amount: 0,
      credit_amount: 25000,
      description: 'Applied to student account'
    }
  ]
});

if (result.success) {
  console.log(`Journal entry posted: ${result.entry_id}`);
}
```

### **Validation Rules**

The system automatically validates:

1. **At least 2 lines required** (debit + credit)
2. **Debits = Credits** (exact match)
3. **GL accounts must exist** and be active
4. **Each line must be debit OR credit** (not both)
5. **Approval required** for high-value or aged transactions

---

## 4. APPROVAL WORKFLOWS

### **Default Approval Rules**

| Rule Name | Condition | Required Approver |
|-----------|-----------|-------------------|
| High Value Void | Amount ≥ Kes 50,000 | FINANCE_MANAGER |
| Aged Transaction Void | >7 days old | FINANCE_MANAGER |
| Large Payment | Amount ≥ Kes 100,000 | FINANCE_MANAGER |
| All Refunds | Any refund | FINANCE_MANAGER |

### **Approval Workflow Example**

```typescript
// Void a transaction
const voidResult = await journalService.voidJournalEntry(
  entryId: 456,
  voidReason: 'Duplicate payment',
  userId: 2
);

// If approval required:
// voidResult.message = 'Void request submitted for approval'
// voidResult.requires_approval = true

// Manager approves:
await approvalService.approveTransaction({
  journal_entry_id: 456,
  approval_status: 'APPROVED',
  review_notes: 'Verified duplicate payment',
  reviewer_user_id: 5  // Finance Manager
});
```

---

## 5. OPENING BALANCES

### **Importing Student Opening Balances**

```typescript
import { OpeningBalanceService } from './services/accounting/OpeningBalanceService';

const obService = new OpeningBalanceService();

const studentBalances = [
  {
    student_id: 101,
    admission_number: 'ADM001',
    student_name: 'John Doe',
    opening_balance: 12000,  // Kes 120.00 (owes money)
    balance_type: 'DEBIT'
  },
  {
    student_id: 102,
    admission_number: 'ADM002',
    student_name: 'Jane Smith',
    opening_balance: 5000,   // Kes 50.00 (overpayment/credit)
    balance_type: 'CREDIT'
  }
];

const result = await obService.importStudentOpeningBalances(
  studentBalances,
  academicYearId: 1,
  importSource: 'Excel Migration 2025',
  userId: 1
);

// Verify balances
const verification = await obService.verifyOpeningBalances(
  academicYearId: 1,
  userId: 1
);

if (verification.is_balanced) {
  console.log('Opening balances verified: Debits = Credits');
}
```

### **Opening Balance Journal Entries**

When importing, the system automatically creates journal entries:

**For student owing money (DEBIT balance):**
```
Debit: 1100 (Accounts Receivable - Students)    Kes 12,000
Credit: 3020 (Retained Earnings)                Kes 12,000
```

**For student with overpayment (CREDIT balance):**
```
Debit: 3020 (Retained Earnings)                 Kes 5,000
Credit: 2020 (Student Credit Balances)          Kes 5,000
```

---

## 6. FINANCIAL REPORTS

### **Trial Balance**

Verifies that total debits = total credits across all accounts.

```typescript
const trialBalance = await journalService.getTrialBalance(
  startDate: '2026-01-01',
  endDate: '2026-02-28'
);

console.log(`Total Debits: ${trialBalance.total_debits}`);
console.log(`Total Credits: ${trialBalance.total_credits}`);
console.log(`Balanced: ${trialBalance.is_balanced}`);
```

### **Balance Sheet**

Shows financial position: Assets = Liabilities + Equity

```typescript
const balanceSheet = await journalService.getBalanceSheet(
  asOfDate: '2026-02-28'
);

console.log(`Total Assets: ${balanceSheet.total_assets}`);
console.log(`Total Liabilities: ${balanceSheet.total_liabilities}`);
console.log(`Total Equity: ${balanceSheet.total_equity}`);
console.log(`Balanced: ${balanceSheet.is_balanced}`);
```

### **Student Ledger with Opening Balance**

```typescript
const studentLedger = await obService.getStudentLedger(
  studentId: 123,
  academicYearId: 1,
  startDate: '2026-01-01',
  endDate: '2026-02-28'
);

console.log(`Opening Balance: ${studentLedger.opening_balance}`);
console.log(`Closing Balance: ${studentLedger.closing_balance}`);
```

---

## 7. MIGRATION FROM OLD SYSTEM

### **Step-by-Step Migration**

1. **Backup existing database**
   ```bash
   cp school.db school_backup_20260203.db
   ```

2. **Run migration 011**
   - Migration will create new tables (gl_account, journal_entry, etc.)
   - Migration will seed standard Chart of Accounts
   - Migration will seed default approval rules
   - Existing ledger_transaction data remains intact

3. **Import opening balances**
   ```typescript
   // Extract student balances from old system
   const oldBalances = db.prepare(`
     SELECT
       student_id,
       admission_number,
       first_name || ' ' || last_name as student_name,
       credit_balance as opening_balance,
       CASE WHEN credit_balance >= 0 THEN 'CREDIT' ELSE 'DEBIT' END as balance_type
     FROM student
   `).all();

   // Import to new system
   await obService.importStudentOpeningBalances(oldBalances, ...);
   ```

4. **Map fee categories to GL accounts**
   ```sql
   UPDATE fee_category
   SET gl_account_id = (SELECT id FROM gl_account WHERE account_code = '4010')
   WHERE category_name = 'Tuition';

   UPDATE fee_category
   SET gl_account_id = (SELECT id FROM gl_account WHERE account_code = '4020')
   WHERE category_name LIKE '%Board%';
   ```

5. **Switch to new payment flow**
   - Update `PaymentService` to use `DoubleEntryJournalService`
   - All new transactions go through journal entries
   - Old transactions remain in `ledger_transaction` for historical reference

---

## 8. BEST PRACTICES

### **DO:**
✅ Always create balanced journal entries (debits = credits)
✅ Use descriptive entry descriptions
✅ Link entries to students/staff where applicable
✅ Review trial balance monthly
✅ Verify opening balances before year-end
✅ Require approval for high-value transactions
✅ Use standard GL account codes (don't create custom accounts unnecessarily)

### **DON'T:**
❌ Create journal entries with unbalanced debits/credits
❌ Post directly to equity accounts (use retained earnings)
❌ Void transactions without valid reasons
❌ Bypass approval workflows
❌ Mix cash-basis and accrual-basis accounting

---

## 9. TROUBLESHOOTING

### **Problem: "Debits must equal Credits"**
**Cause:** Journal entry lines are not balanced.
**Solution:**
```typescript
// Check your lines:
const totalDebits = lines.reduce((sum, l) => sum + l.debit_amount, 0);
const totalCredits = lines.reduce((sum, l) => sum + l.credit_amount, 0);
console.log(`Debits: ${totalDebits}, Credits: ${totalCredits}`);
```

### **Problem: "Invalid GL account code"**
**Cause:** GL account does not exist or is inactive.
**Solution:**
```sql
-- Check if account exists:
SELECT * FROM gl_account WHERE account_code = '1020' AND is_active = 1;
```

### **Problem: "Balance Sheet not balanced"**
**Cause:** Journal entries are not properly balanced, or opening balances are incorrect.
**Solution:**
```typescript
// Run trial balance first:
const tb = await journalService.getTrialBalance('2026-01-01', '2026-02-28');
if (!tb.is_balanced) {
  console.log('Fix trial balance first before generating balance sheet');
}
```

### **Problem: "Opening balances not verified"**
**Cause:** Total opening balance debits ≠ credits.
**Solution:**
```typescript
const verification = await obService.verifyOpeningBalances(1, userId);
console.log(`Variance: ${verification.variance}`);
// Review opening_balance table and fix discrepancies
```

---

## 10. AUDIT COMPLIANCE

### **External Audit Readiness**

The new system provides:

1. **Trial Balance** - Proves books are mathematically balanced
2. **Balance Sheet** - Shows financial position
3. **Profit & Loss** - Shows operational performance
4. **General Ledger** - Complete transaction history
5. **Audit Trail** - Who did what when
6. **Approval Records** - Transaction authorization history
7. **Opening Balance Verification** - Historical accuracy

### **Audit Reports**

```typescript
// Generate audit package
const auditPackage = {
  trialBalance: await journalService.getTrialBalance('2025-01-01', '2025-12-31'),
  balanceSheet: await journalService.getBalanceSheet('2025-12-31'),
  generalLedger: await journalService.getGeneralLedger('2025-01-01', '2025-12-31'),
  voidedTransactions: await journalService.getVoidedTransactions('2025-01-01', '2025-12-31'),
  approvalHistory: await approvalService.getApprovalHistory('2025-01-01', '2025-12-31')
};
```

---

## 11. NEXT STEPS

### **Recommended Enhancements**

1. **Profit & Loss Statement Service** - Consolidate revenue and expenses
2. **Cash Flow Statement** - Integrate with new journal entries
3. **Budget vs Actual Enforcement** - Block expenses exceeding budget
4. **Multi-Currency Support** - Store exchange rates and convert amounts
5. **Automated Bank Reconciliation** - Match bank statements to journal entries
6. **Fixed Asset Depreciation** - Automatic monthly depreciation entries
7. **Payroll GL Integration** - Post salary expenses to journal entries

### **Training Requirements**

- Finance staff: Double-entry bookkeeping basics
- All users: New approval workflow
- IT staff: Chart of Accounts maintenance
- Management: New financial reports interpretation

---

## 12. SUPPORT & REFERENCES

### **Documentation**
- Main Audit Report: `FINANCIAL_AUDIT_REPORT.md`
- Migration File: `electron/main/database/migrations/011_chart_of_accounts.ts`
- Service: `electron/main/services/accounting/DoubleEntryJournalService.ts`

### **Contact**
For questions about the new accounting system, contact the development team or refer to the comprehensive audit report for detailed architectural decisions and rationale.

---

**Last Updated:** February 3, 2026
**Version:** 1.0.0
**Migration Status:** Ready for deployment
