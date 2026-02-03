# FINANCIAL AUDIT REPORT
# Mwingi Adventist School ERP System

**Audit Date:** February 3, 2026
**Auditor:** Principal Software Auditor & Financial Systems Architect
**System Version:** 1.0.0
**Technology Stack:** Electron, TypeScript, SQLite, React

---

## 1. EXECUTIVE VERDICT

**This system is NOT fit for institutional use in its current state.**

The Mwingi School ERP employs single-entry accounting disguised as double-entry through a `debit_credit` column flag. Critical financial operations (payroll, expenses, asset purchases) exist in isolated tables outside the primary ledger, making comprehensive financial reconstruction impossible. The absence of a Chart of Accounts forces the reporting layer to text-match transaction descriptions using LIKE clauses—a fragile approach that will fail the moment a clerk misspells "transport" or uses "matatu" instead of "bus."

While the system demonstrates sophisticated domain modeling for Kenyan CBC education (fee proration, scholarship tracking, period locking), **it fundamentally fails to provide the single source of financial truth required for audit compliance**. An external auditor would reject this system within the first reconciliation attempt upon discovering that:

1. The cash flow statement requires querying 5 separate tables
2. Voiding a transaction does not create offsetting entries but marks a flag
3. Credit balances in the `student` table can drift from `credit_transaction` sums
4. No mechanism exists to verify that total debits equal total credits

The system is suitable for **mid-sized private schools with light financial oversight** but **unsuitable for government-audited institutions, grant-dependent operations, or any organization requiring ISO 9001 certification or bank loan applications**.

---

## 2. CRITICAL FINDINGS (BLOCKING ISSUES)

### **CF-1: Single-Entry Accounting Masquerading as Double-Entry**
**Severity:** 🔴 BLOCKING

**Evidence:**
```typescript
// schema.ts line 74-79
CREATE TABLE ledger_transaction (
  debit_credit TEXT NOT NULL CHECK(debit_credit IN ('DEBIT', 'CREDIT')),
  amount INTEGER NOT NULL,
  ...
)
```

**Issue:** The `debit_credit` column is a presentation flag, not a double-entry mechanism. Every transaction records ONCE with a directional indicator. True double-entry requires TWO postings:
- Debit: Bank Account +5000
- Credit: Tuition Revenue +5000

**Audit Impact:** No mathematical verification that books balance. The fundamental accounting equation (Assets = Liabilities + Equity) cannot be verified because assets/liabilities/equity are not tracked as contra-accounts.

**Real-World Failure:** If a payment is recorded as DEBIT when it should be CREDIT, the system has no built-in check. External auditors will reject financial statements generated from this system.

---

### **CF-2: No Chart of Accounts**
**Severity:** 🔴 BLOCKING

**Evidence:**
```typescript
// SegmentProfitabilityService.ts line 49
SELECT SUM(amount) FROM ledger_transaction
WHERE description LIKE '%transport%' OR description LIKE '%bus%'
```

**Issue:** Expense categorization relies on free-text descriptions being searched with SQL LIKE patterns. No standardized GL account numbering (e.g., 4010-Transport Revenue, 5010-Transport Expenses).

**Audit Impact:**
- Misspellings break reports ("Transport" vs "Transports" vs "Matatu")
- No hierarchical expense control (all Transport costs lumped together)
- Impossible to map to ISS (International School Standards) reporting formats
- No budgeting by GL code

**Real-World Failure:** During NEMIS (National Education Management Information System) reporting season, the system cannot generate the required income/expense breakdown by standardized categories.

---

### **CF-3: Multiple Incompatible Ledger Schemas**
**Severity:** 🔴 BLOCKING

**Evidence:**
```typescript
// CashFlowStatementService.ts line 162
const incomingTransactions = await this.repo.getTransactionsByType(
  startDate, endDate, ['CREDIT', 'PAYMENT']
)

// SegmentProfitabilityService.ts line 48
WHERE description LIKE '%transport%' OR description LIKE '%bus%'

// StudentLedgerService.ts line 97
const openingBalance = 0  // ❌ HARD-CODED!
```

**Issue:** Three different reporting services use three different data models:
1. **CashFlowStatementService**: Queries `ledger_transaction` + `expense_transaction` + `payroll_transaction` + `asset_transaction` (4 tables)
2. **SegmentProfitabilityService**: Text-matches descriptions
3. **StudentLedgerService**: Hard-codes opening balances to zero

**Audit Impact:** Reports cannot be cross-verified. A student ledger showing balance X may not match cash flow reports showing cash received Y.

**Real-World Failure:** During year-end audit, the accountant reconciles total student receivables to Kes 500,000, but cash flow statement shows only Kes 450,000 in fee collections. The discrepancy cannot be explained because the two reports use different data sources.

---

### **CF-4: Payroll Isolated from General Ledger**
**Severity:** 🔴 BLOCKING

**Evidence:**
```typescript
// payroll-handlers.ts line 19-123
// Calculates PAYE, NSSF, NHIF correctly
// But line 98:
INSERT INTO payroll_transaction (period_id, staff_id, ...)
// ❌ NOT inserted into ledger_transaction!
```

**Issue:** Payroll transactions exist in a separate `payroll_transaction` table, never posted to `ledger_transaction`. This means:
- Cash flow statements must manually query payroll table
- Salary expenses not part of the general ledger
- Bank reconciliation cannot match salary payments to ledger

**Audit Impact:** Auditors expect ALL financial transactions in ONE ledger with GL posting references. This system treats payroll as a side module.

**Real-World Failure:** Bank statement shows Kes 300,000 salary payment. Ledger shows Kes 0 for salaries (because they're in a different table). Auditor flags as "Missing Expense Recognition."

---

### **CF-5: Transaction Voiding Without Approval Workflow**
**Severity:** 🔴 BLOCKING

**Evidence:**
```typescript
// PaymentService.ts line 336-385
async voidPayment(data: VoidPaymentData): Promise<PaymentResult> {
  // Creates reversal transaction
  // ❌ No approval check for high-value voids
  // ❌ No time-based locking (can void 6-month-old transactions)
}
```

**Issue:** Any user with void permission can reverse ANY transaction at ANY time without:
- Manager approval
- Time-based restrictions (e.g., cannot void after 7 days)
- Amount thresholds (e.g., requires approval if >Kes 50,000)

**Audit Impact:** Opens door to fraud. A clerk can void a legitimate Kes 100,000 payment, pocket cash, and record it as "Customer refund."

**Real-World Failure:** During audit, 15 high-value payments are found voided by the same clerk over 2 months with reason "Customer requested refund." No supporting documentation. Auditor suspects embezzlement.

---

### **CF-6: Credit Balance Drift Risk**
**Severity:** 🟡 HIGH

**Evidence:**
```typescript
// schema.ts line 49
student (
  credit_balance INTEGER DEFAULT 0,
  ...
)

// Separate table:
credit_transaction (
  student_id, transaction_type, amount, ...
)
```

**Issue:** Student credit balance stored in TWO places:
1. `student.credit_balance` (cached field)
2. `SUM(credit_transaction.amount WHERE student_id = X)` (calculated)

If any code updates one without the other, balances diverge.

**Audit Impact:** Student shows Kes 5,000 credit in UI but credit_transaction table shows Kes 3,000. Which is correct?

**Real-World Failure:** Student graduates, finance office processes refund based on `student.credit_balance` = Kes 10,000. Audit reveals actual credits totaled Kes 8,000. School loses Kes 2,000.

---

### **CF-7: No Opening Balances for Students**
**Severity:** 🟡 HIGH

**Evidence:**
```typescript
// StudentLedgerService.ts line 97
const openingBalance = 0  // ❌ HARD-CODED!
```

**Issue:** When a student's ledger is generated, the opening balance is always zero. If school has historical balances from a previous system, they cannot be imported.

**Audit Impact:** Year 1 students from 2025 have carried-forward debts from 2024, but the system shows zero opening balance. Historical receivables are invisible.

**Real-World Failure:** Principal reviews defaulters report. Shows 10 students owing Kes 50,000 total. Bursar manually confirms actual outstanding is Kes 120,000 (includes 2024 balances). Reports are unreliable.

---

### **CF-8: No Budget Enforcement**
**Severity:** 🟡 HIGH

**Evidence:**
```typescript
// BudgetService.ts exists but transactions are never validated against budgets
// No code checks: "Does this expense exceed departmental budget?"
```

**Issue:** Budget table exists for planning but is not enforced. Expenses can exceed budgeted amounts without warning.

**Audit Impact:** School budgets Kes 100,000 for transport fuel. Actual spending: Kes 150,000. System never flagged the overrun.

**Real-World Failure:** Board of Directors discovers at year-end that 5 departments exceeded budgets by 30% average. CFO blames "poor system controls."

---

## 3. HIGH-RISK FINANCIAL GAPS

### **HRG-1: Hard-Coded Boarding Occupancy Rate**
**Code:** `SegmentProfitabilityService.ts line 501`
```typescript
const occupancyRate = 85  // ❌ ASSUMES 85% occupancy
```
**Impact:** Boarding profitability reports are fabricated. If actual occupancy is 60%, reports show incorrect profit margins.

---

### **HRG-2: Missing Tuition Revenue Segment**
**Code:** `SegmentProfitabilityService.ts line 643`
```typescript
const transport = await this.calculateTransportProfitability()
const boarding = await this.calculateBoardingProfitability()
// ❌ No tuition segment!
```
**Impact:** Cannot answer: "What is our profit margin on tuition fees alone?"

---

### **HRG-3: Hard-Coded KES Currency Thresholds**
**Code:** `AgedReceivablesService.ts line 211`
```typescript
return daysOverdue > 90 || inv.amount > 100000  // ❌ Hard-coded KES
```
**Impact:** If school switches to USD or installs in Tanzania (TZS), thresholds are wrong.

---

### **HRG-4: No Cash vs. Accrual Distinction**
**Issue:** Reports mix cash-basis (payment_method = 'CASH') with accrual-basis (invoice created).

**Impact:** CFO cannot answer: "What is our cash position vs. accrual profit?"

---

### **HRG-5: Fee Proration Logic Not Auditable**
**Code:** `FeeProrationService.ts`
```typescript
const dailyRate = feeAmount / totalDaysInTerm
const proratedAmount = dailyRate * daysEnrolled
```

**Good:** Calculation is correct.
**Problem:** `pro_ration_log` table exists but no report shows proration audit trail.

**Impact:** Auditor asks: "Why did Student X pay Kes 18,000 instead of Kes 25,000?" Finance clerk must manually dig through logs.

---

### **HRG-6: Refund Handling Unclear**
**Code:** `PaymentService.ts voidPayment()` creates reversal transaction but does not track refund issuance.

**Gap:** System records "payment voided" but not:
- Was cash refunded?
- Was it applied to future term?
- Was a cheque issued?

**Impact:** Bank reconciliation cannot match refunds to bank outflows.

---

### **HRG-7: No Multi-Currency Support**
**Evidence:** All amounts stored as INTEGER (Kenyan shillings in cents)
```typescript
amount INTEGER NOT NULL
```

**Impact:** Cannot operate in USD, EUR, or other currencies. If school has international students paying in USD, manual conversion required.

---

### **HRG-8: Partial Payment Application Order Not Configurable**
**Code:** `CreditAutoApplicationService.ts`
```typescript
// FIFO: oldest invoice first
ORDER BY due_date ASC
```

**Problem:** Always applies FIFO. Some schools prioritize:
- Highest amount first
- Current term fees before past terms
- Specific fee categories (e.g., exam fees before boarding)

**Impact:** Parent pays Kes 10,000. System applies to oldest 2023 balance. Parent expected payment to cover 2026 term fees. Confusion and complaints.

---

## 4. DOMAIN MODEL GAPS (CBC/CBE)

### **DMG-1: No CBC Activity Fee Categorization**
**Kenyan Reality:** CBC requires schools to offer Performing Arts, Sports & Physical Education, Home Science, Agriculture, etc.

**System Reality:** Generic `fee_category` table with no CBC-specific categories.

**Missing:**
- Activity fee per CBC strand
- Co-curricular fee tracking
- Equipment/material fees for practical subjects

---

### **DMG-2: No Junior Secondary School Transition Tracking**
**Kenyan Reality:** Students transition from Grade 6 (Primary) to Grade 7 (JSS - Junior Secondary School). Different fee structures, boarding status may change.

**System Reality:** `stream` table has `is_junior_secondary` flag but:
- No automatic fee structure change on Grade 7 transition
- No migration of outstanding primary balances to JSS

**Impact:** Manual work required every year during JSS transition.

---

### **DMG-3: No Government Grant/Capitation Tracking**
**Kenyan Reality:** Government provides per-student capitation (e.g., Kes 1,420 per term for primary, Kes 22,244 per year for secondary).

**System Reality:** Generic `GRANT` transaction type but:
- No per-student allocation
- No tracking against expected capitation
- No variance reporting (expected vs. received)

---

### **DMG-4: No NEMIS Export for Statutory Reporting**
**Kenyan Reality:** Schools must submit enrollment, attendance, and financial data to NEMIS quarterly.

**System Reality:** `NEMISExportService.ts` exists but only exports:
- Student enrollment
- Attendance
- ❌ Missing: Income/expense breakdown by category

**Impact:** Manual Excel work required for financial NEMIS submissions.

---

### **DMG-5: No Bursary/HELB Loan Tracking**
**Kenyan Reality:** Students receive bursaries (county, CDF) and HELB loans (secondary/tertiary).

**System Reality:** Scholarship table exists but:
- No bursary provider tracking (e.g., "County Government Bursary")
- No HELB loan disbursement tracking
- No reporting of total bursary funding received per term

---

### **DMG-6: No Boarding Cost Attribution Per Student**
**Kenyan Reality:** Boarding costs vary by student (special diets, medical needs, bed space location).

**System Reality:** Boarding fee is flat amount per student_type = 'BOARDER'.

**Missing:**
- Per-student boarding cost tracking
- Meal plan variations (vegetarian, diabetic)
- Laundry service tracking

---

### **DMG-7: No Transport Route Management**
**Kenyan Reality:** School buses operate on fixed routes (Nairobi-Mwingi, Kitui-Mwingi). Students pay based on route distance.

**System Reality:** Transport fee is generic amount. No:
- Route definitions
- Pick-up/drop-off points
- Distance-based pricing
- Bus capacity vs. bookings

**Impact:** Cannot answer: "Is the Nairobi route profitable?"

---

## 5. REPORTING RELIABILITY SCORE: 4/10

### **Scoring Breakdown:**

| Report Type | Score | Justification |
|-------------|-------|---------------|
| **Cash Flow Statement** | 7/10 | Works but requires 5 separate tables; not reconstructable from ledger alone |
| **Segment Profitability** | 5/10 | Transport/Boarding OK; Tuition missing; Hard-coded occupancy; Text-matched descriptions |
| **Student Ledger** | 6/10 | Good reconciliation logic but hard-coded zero opening balances |
| **Aged Receivables** | 7/10 | Accurate aging but hard-coded KES thresholds |
| **Payroll Reports** | 9/10 | Correct statutory calculations but isolated from GL |
| **Profit & Loss** | 2/10 | Does not exist; must be manually compiled from segment reports |
| **Balance Sheet** | 0/10 | Does not exist; no asset/liability/equity tracking |
| **Budget vs. Actual** | 3/10 | Budget table exists but no variance reports |

### **Why Management Cannot Make Data-Driven Decisions:**

**Question:** "Is the school bus operating at a profit or loss?"
**Answer:** ✅ YES - `SegmentProfitabilityService` can answer this.
**But:** Only if descriptions contain "transport" or "bus" (fragile).

**Question:** "Can we separate revenue by Tuition, Boarding, Transport?"
**Answer:** ⚠️ PARTIAL - Transport/Boarding YES, Tuition NO (lumped as "other income").

**Question:** "What is our cash position?"
**Answer:** ❌ NO - Cash flow statement shows collections but does not track actual bank balances. Bank reconciliation service exists but not integrated with reporting.

**Question:** "Can we recreate last year's financial statements from raw data?"
**Answer:** ❌ NO - Requires 5+ tables, no single ledger source of truth.

**Question:** "Which students have outstanding balances >30 days?"
**Answer:** ✅ YES - `AgedReceivablesService` provides this.

**Question:** "What is our year-to-date profit?"
**Answer:** ❌ NO - No consolidated Profit & Loss statement exists.

---

## 6. EXAMPLE FAILURE SCENARIOS

### **Scenario 1: Bus Expense Misclassification**
**Setup:**
- School spends Kes 80,000 on bus fuel
- Accounts clerk enters expense with description "Petrol for matatu"
- (Uses Kenyan slang "matatu" instead of "bus")

**Failure:**
```typescript
// SegmentProfitabilityService.ts
WHERE description LIKE '%transport%' OR description LIKE '%bus%'
// ❌ Does NOT match "matatu"
```

**Result:** Transport profitability report shows Kes 0 fuel expense. Management thinks transport is profitable when it's actually losing money.

**Audit Finding:** "Transport segment P&L report materially misstated due to expense omission."

---

### **Scenario 2: Voided Payment Fraud**
**Setup:**
- Student pays Kes 50,000 tuition in cash
- Accounts Clerk A records payment (creates receipt #12345)
- Next day, Clerk A voids the transaction with reason "Duplicate entry"
- Clerk A pockets the Kes 50,000 cash

**Failure:**
```typescript
// PaymentService.ts line 336 - No approval required
async voidPayment(data: VoidPaymentData): Promise<PaymentResult> {
  // ❌ No check: if (amount > 50000) requireApproval()
  // ❌ No check: if (daysSinceTransaction > 7) requireApproval()
}
```

**Result:** Student's account shows zero payment. Parent complains. Finance office checks records, sees "voided duplicate." Clerk claims it was an error. Without approval trail, fraud is undetectable.

**Audit Finding:** "Inadequate internal controls over transaction reversal. High fraud risk."

---

### **Scenario 3: Credit Balance Drift**
**Setup:**
- Student pays Kes 30,000 (invoice total Kes 25,000)
- System creates credit_transaction: +Kes 5,000
- System updates student.credit_balance = 5,000
- Next term, clerk applies Kes 3,000 credit to new invoice
- Clerk updates student.credit_balance = 2,000
- ❌ But forgets to create offsetting credit_transaction

**Failure:**
```typescript
// Result:
student.credit_balance = 2,000
SUM(credit_transaction WHERE student_id = X) = 5,000
// ❌ MISMATCH!
```

**Result:** During year-end audit, total student credit balances = Kes 100,000 (from student table). Total credit transactions = Kes 150,000. Discrepancy of Kes 50,000 unexplained.

**Audit Finding:** "Student credit liability understated by Kes 50,000. Material misstatement."

---

### **Scenario 4: Missing Opening Balances**
**Setup:**
- School migrates from Excel to this ERP in 2025
- Student X has outstanding balance of Kes 12,000 from 2024
- During migration, opening balances are not imported
- StudentLedgerService hard-codes opening_balance = 0

**Failure:**
```typescript
// StudentLedgerService.ts line 97
const openingBalance = 0  // ❌
```

**Result:** Student ledger shows:
```
2025-01-05: Opening Balance = Kes 0
2025-02-01: Invoice = Kes 25,000
Total Outstanding = Kes 25,000
```

**Reality:** Student owes Kes 37,000 (12,000 from 2024 + 25,000 from 2025).

**Audit Finding:** "Student receivables materially understated. System does not support opening balance migration."

---

### **Scenario 5: Payroll Not in Ledger**
**Setup:**
- School pays staff salaries totaling Kes 500,000 in January
- `payroll_transaction` table records this
- ❌ But `ledger_transaction` does NOT include payroll entries

**Failure:**
```typescript
// CashFlowStatementService.ts must query separately:
const salaries = await this.repo.getFromPayrollTable()  // Not in ledger!
```

**Result:** Bank reconciliation shows:
- Bank statement: -Kes 500,000 (salary payment)
- Ledger transaction sum: Kes 0 (because payroll not in ledger)
- Manual journal entry required to "match" them

**Audit Finding:** "Payroll expenses not integrated with general ledger. Violates accounting standards (IAS 1)."

---

### **Scenario 6: Budget Overrun Goes Unnoticed**
**Setup:**
- Transport department budgeted Kes 200,000 for Q1
- Actual spending: Kes 250,000
- System allows all expenses (no validation)

**Failure:**
```typescript
// BudgetService.ts - Budget table exists but never enforced
// No code prevents overspending
```

**Result:** At year-end board meeting:
- Board: "Why did we spend Kes 250,000 when budget was Kes 200,000?"
- CFO: "The system didn't alert us."
- Board: "Why not?"

**Audit Finding:** "No budgetary controls. Management oversight compromised."

---

## 7. PAYROLL & STATUTORY RISK: PRODUCTION-SAFE WITH CAVEATS

### **Assessment: ✅ PRODUCTION-SAFE (Calculations Only)**

**Strengths:**
1. ✅ Correct PAYE calculation (2024 tax bands)
2. ✅ Correct NSSF Tier I + Tier II calculation
3. ✅ Correct SHIF (formerly NHIF) 2.75% rate
4. ✅ Correct Housing Levy 1.5%
5. ✅ Personal Relief Kes 2,400 applied correctly
6. ✅ Reads rates from database (configurable, not hard-coded)
7. ✅ Stores deduction breakdown (audit trail)

**Weaknesses:**
1. ❌ Not integrated with general ledger (salary expenses isolated)
2. ❌ No salary advance/loan deduction tracking
3. ❌ No pension/CPF calculation (if school offers pension)
4. ❌ No Leave Without Pay handling
5. ❌ No arrears calculation (if salary delayed)
6. ❌ No payslip generation (PDF/email)
7. ⚠️ No PAYE submission file export (KRA iTax format)

### **Risk Level: 🟡 MEDIUM**

**Safe for:** Internal payroll calculation.
**Risky for:** KRA statutory filing (requires iTax export), pension fund remittances, detailed variance analysis.

**Recommendation:** Add KRA iTax P10 export, integrate with GL, add pension support before scaling.

---

## 8. AUDIT TRAIL & DATA INTEGRITY

### **Assessment: ⚠️ PARTIAL COMPLIANCE**

**Strengths:**
1. ✅ `audit_log` table captures all actions (user_id, action_type, table_name, record_id, old_values, new_values)
2. ✅ Soft deletes (is_voided flag, not hard deletes)
3. ✅ `void_audit` table tracks voided transactions
4. ✅ Period locking via `financial_period` table (prevents retroactive edits)

**Weaknesses:**
1. ❌ No cryptographic signing (void reasons are text, not verified)
2. ❌ Audit log can be manually edited (no write-once protection)
3. ❌ No tamper-evident hashing (e.g., blockchain-style chain of custody)
4. ❌ Void reasons not standardized (free text: "mistake", "error", "refund requested")
5. ❌ No approval workflow for high-value transactions
6. ❌ No time-based transaction locking (can void 6-month-old transactions)

### **Can an Auditor Trust This System?**
**Answer:** ⚠️ WITH RESERVATIONS

**Trustworthy:**
- Transaction history is retained (soft deletes)
- Who-did-what-when is logged
- Period locking prevents retroactive edits after term closure

**Untrustworthy:**
- Voiding lacks cryptographic proof of authorization
- Audit log can be edited by database administrator
- No checksums or hashes to detect tampering

**Can Fraud Be Detected or Concealed?**
**Answer:** ⚠️ PARTIALLY

**Detectable:**
- Unusual void patterns (same clerk voids 10 transactions in 1 week)
- Duplicate transaction references
- Out-of-sequence transaction IDs

**Concealable:**
- Clerk can void payment, claim "duplicate," pocket cash
- DBA can edit audit_log table directly (no hash verification)
- Credit balance drift can hide missing funds

---

## 9. FAILURE MODES & EDGE CASES

### **FM-1: Partial Data Entry Corruption**
**Scenario:** Clerk enters payment but power cuts before transaction commits.

**Result:**
- `ledger_transaction` created (COMMIT successful)
- `receipt` not created (power cut)
- Student has payment in ledger but no receipt

**Impact:** Student cannot prove payment. Finance office must manually issue receipt.

**Mitigation:** Wrap all payment operations in database transaction with rollback.

---

### **FM-2: Concurrent Payment Processing**
**Scenario:** Two clerks simultaneously process payments for same student.

**Result:**
- Both read student.credit_balance = 0
- Both add Kes 5,000
- Both write student.credit_balance = 5,000
- ❌ Lost update! Should be Kes 10,000

**Impact:** One payment is "lost" from credit balance calculation.

**Mitigation:** Use row-level locking or database transactions.

---

### **FM-3: Invoices Generated Mid-Term**
**Scenario:** School changes fee structure mid-term (e.g., adds new lunch program fee).

**Result:**
- Existing invoices DO NOT include new fee
- New students get new fee structure
- Same class, different fee amounts
- Parent complaints

**Impact:** Revenue tracking becomes inconsistent.

**Mitigation:** Add "fee structure change" workflow with retroactive invoice adjustment option.

---

### **FM-4: Student Transfers Mid-Term**
**Scenario:** Student transfers from Day Scholar to Boarder mid-term.

**Result:**
- System does not automatically prorate fees
- Clerk must manually create exemption for day scholar fee
- Clerk must manually invoice boarding fee (prorated)
- High error risk

**Impact:** Revenue leakage or overcharging.

**Mitigation:** Add "student status change" workflow with automatic proration.

---

### **FM-5: Receipt Reprinting Fraud**
**Scenario:** Student pays Kes 10,000. Clerk prints receipt. Next day, student's friend "loses" their receipt. Clerk reprints student's receipt, alters date/amount, gives to friend.

**Result:**
- Friend shows receipt to parent as "proof of payment"
- `receipt.printed_count` increments but no audit trail of WHO reprinted

**Impact:** Two students claim same payment.

**Mitigation:** Require manager approval for reprints, log user_id in reprint audit.

---

### **FM-6: Negative Balance Students**
**Scenario:** Student graduates with Kes 5,000 credit balance. Finance office processes refund. Clerk accidentally issues Kes 8,000 refund.

**Result:**
- Student receives Kes 3,000 overpayment
- student.credit_balance = -3,000
- System allows negative balances

**Impact:** School loses money.

**Mitigation:** Add validation: `if (refund_amount > credit_balance) reject()`.

---

## 10. CODE QUALITY & MAINTAINABILITY

### **Assessment: 🟢 ABOVE AVERAGE**

**Strengths:**
1. ✅ SOLID principles applied (PaymentService is well-structured)
2. ✅ Repository pattern used consistently
3. ✅ TypeScript types defined
4. ✅ Interface segregation (IPaymentRecorder, IPaymentVoidProcessor)
5. ✅ Audit logging wrapped in utility function
6. ✅ Comprehensive test coverage for key services

**Code Smells:**
1. ❌ Hard-coded values (occupancy rate = 85)
2. ❌ Magic numbers (threshold = 100000)
3. ❌ God objects (`SegmentProfitabilityService` is 643 lines)
4. ❌ Duplicated SQL (multiple services query ledger_transaction differently)
5. ❌ Unclear naming (`credit_balance` vs. `credit_transaction` confusion)

**Kenyan Assumptions Hard-Coded:**
1. ❌ School name: "Mwingi Adventist School" (seed data)
2. ❌ Currency: INTEGER storage assumes Kenyan shillings in cents
3. ❌ KES threshold: Kes 100,000 for collections reminders
4. ❌ Statutory rates: 2024 rates for PAYE/NSSF/SHIF
5. ❌ CBC curriculum: Hard-coded in migration

**Unhandled Exceptions:**
1. ⚠️ Database connection failures (SQLite locked file)
2. ⚠️ Concurrent transaction conflicts
3. ⚠️ Disk full errors (during backup)
4. ⚠️ Invalid date formats (user input)

---

## 11. RECOMMENDATIONS (HIGH-LEVEL ONLY)

### **Immediate (Before Production Deployment):**

1. **Implement True Double-Entry Ledger**
   - Create `gl_account` table (Assets, Liabilities, Equity, Revenue, Expenses)
   - Replace single `ledger_transaction` entry with dual posting
   - Add GL account codes to all transactions
   - Verify debit = credit invariant on every transaction

2. **Add Chart of Accounts**
   - Import standard Kenyan school chart (or ISS standard)
   - Map fee categories to GL codes (4010-Tuition, 4020-Transport, 4030-Boarding)
   - Replace description LIKE clauses with GL account queries

3. **Consolidate All Transactions into Single Ledger**
   - Migrate `payroll_transaction`, `expense_transaction`, `asset_transaction` into `ledger_transaction`
   - Use GL codes to differentiate (5010-Salaries, 5020-Utilities, etc.)
   - Make ledger the single source of truth

4. **Implement Transaction Approval Workflow**
   - Require manager approval for voids >Kes 10,000 or >7 days old
   - Add approval_request table
   - Send notifications for pending approvals

5. **Add Opening Balance Import**
   - Allow bulk import of student opening balances
   - Validate imported balances against external records
   - Log import audit trail

6. **Enforce Budget vs. Actual**
   - Validate expenses against budget before recording
   - Send alerts when department nears 80% of budget
   - Generate variance reports

7. **Add Comprehensive Financial Statements**
   - Profit & Loss (by period, by segment)
   - Balance Sheet (assets, liabilities, equity)
   - Cash Flow (from ledger, not multiple tables)

8. **Fix Credit Balance Synchronization**
   - Remove `student.credit_balance` denormalized field
   - Always calculate from `SUM(credit_transaction)`
   - Or use database triggers to maintain consistency

---

### **Short-Term (First 3 Months of Operation):**

9. **Add Transaction Locking**
   - Prevent edits after 30 days without admin override
   - Implement write-once audit log with cryptographic hashing

10. **Add CBC-Specific Features**
    - Activity fee categories mapped to CBC strands
    - Government capitation tracking (expected vs. received)
    - NEMIS financial data export

11. **Add Transport Route Management**
    - Define routes with pick-up points
    - Distance-based pricing
    - Bus capacity vs. bookings

12. **Add Multi-Currency Support**
    - Store amounts as DECIMAL with currency code
    - Exchange rate tracking
    - Multi-currency financial statements

13. **Add Payroll Integration**
    - Post salary expenses to GL automatically
    - Add KRA iTax P10 export
    - Add pension/CPF calculations

14. **Add Boarding Cost Attribution**
    - Per-student boarding cost tracking
    - Meal plan variations
    - Special diet handling

---

### **Long-Term (Year 1):**

15. **Add Bank Reconciliation Automation**
    - Import bank statements (CSV, OFX)
    - Auto-match transactions
    - Highlight unmatched entries

16. **Add Forecasting**
    - Cash flow forecasting (3-month rolling)
    - Enrollment-based revenue projection
    - Seasonal expense patterns

17. **Add External Audit Support**
    - Export trial balance
    - Export general ledger (PDF, Excel)
    - Export student receivables aging

18. **Add Mobile Payment Integration**
    - M-Pesa Paybill auto-reconciliation
    - SMS payment confirmations
    - Online payment portal

---

## 12. SECURITY CONCERNS

### **SEC-1: No Transaction Signing**
**Risk:** Void reasons are text, not cryptographically signed.
**Mitigation:** Implement digital signatures for transaction modifications.

### **SEC-2: Direct Database Access**
**Risk:** DBA can edit audit_log table directly.
**Mitigation:** Use append-only audit log or blockchain-style hashing.

### **SEC-3: No Role-Based Amount Limits**
**Risk:** Accounts Clerk can record Kes 1,000,000 payment without approval.
**Mitigation:** Add role-based transaction amount limits.

### **SEC-4: Password Storage**
**Note:** Uses bcryptjs (✅ SECURE). No issues found.

### **SEC-5: SQL Injection Risk**
**Status:** Uses prepared statements (✅ SECURE). No issues found.

### **SEC-6: File Upload Validation**
**Risk:** No validation on student photo uploads (could be malware).
**Mitigation:** Validate file types, scan for malware.

---

## 13. FINAL CONCLUSION

This system demonstrates **sophisticated domain understanding** of Kenyan CBC education and **competent software engineering** (SOLID principles, TypeScript, testing). However, it fundamentally fails as a financial accounting system due to:

1. **Single-entry accounting** disguised as double-entry
2. **No Chart of Accounts** (text-matched descriptions)
3. **Fragmented ledger** (5+ separate transaction tables)
4. **No approval workflows** for high-risk operations
5. **Insufficient audit controls** (no cryptographic signatures)

**Verdict:** Suitable for small to mid-sized private schools with light financial oversight. **Unsuitable for:**
- Government-audited institutions
- Grant-dependent schools (Constituency Development Fund, etc.)
- Organizations seeking bank loans (require audited statements)
- Schools pursuing ISO 9001 certification
- Any institution with external audit requirements

**Recommended Path Forward:**
1. Implement recommendations #1-8 (Immediate category) before launch
2. Pilot with 1-2 non-critical departments
3. Run parallel with existing system for 1 term
4. Full migration only after audit sign-off

**Final Score: 4.5/10** (Functional but Financially Unreliable)

---

**Report Date:** February 3, 2026
**Next Review:** After implementation of critical recommendations
**Auditor Signature:** [Principal Software Auditor & Financial Systems Architect]
