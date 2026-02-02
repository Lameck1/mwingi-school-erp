# AUDIT REMEDIATION ROADMAP
## Priority-Ordered Action Plan for Production Readiness

**Based On:** CRITICAL_AUDIT_REPORT.md  
**Target:** Production-safe deployment for Kenyan CBC/CBE school  
**Timeline:** 4-6 weeks  

---

## PHASE 1: CRITICAL BLOCKERS (Week 1-2) - MUST FIX

### 1.1 Implement Approval Workflows ⚠️ HIGHEST PRIORITY
**Issue:** Any clerk can process unlimited payments with zero oversight

**Required Changes:**
```typescript
// Create new table: approval_workflow
CREATE TABLE approval_workflow (
  id INTEGER PRIMARY KEY,
  transaction_type TEXT NOT NULL,
  min_amount INTEGER,
  max_amount INTEGER,
  required_approvers INTEGER DEFAULT 1,
  approver_role TEXT NOT NULL
);

// Create new table: approval_request
CREATE TABLE approval_request (
  id INTEGER PRIMARY KEY,
  request_type TEXT NOT NULL,
  reference_id INTEGER NOT NULL,
  amount INTEGER,
  requested_by INTEGER NOT NULL,
  request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'PENDING',
  approved_by INTEGER,
  approved_at DATETIME,
  rejection_reason TEXT
);
```

**Implementation Steps:**
1. Add approval workflow configuration UI
2. Modify payment handler to check approval requirements
3. Create approval request when threshold exceeded
4. Build approval review interface for supervisors
5. Add approval audit trail

**Acceptance Criteria:**
- Payments >100K KES require supervisor approval
- Payments >500K KES require dual authorization (supervisor + principal)
- All refunds require approval regardless of amount
- Approval status visible in transaction list
- Cannot bypass approval via any route

---

### 1.2 Fix Cash Flow Calculations ⚠️ CRITICAL
**Issue:** CashFlowService.getCashFlowStatement() returns empty/broken data

**Required Changes:**
```typescript
// electron/main/services/finance/CashFlowService.ts
export class CashFlowService {
  static getCashFlowStatement(startDate: string, endDate: string) {
    // Operating Activities
    const operatingInflows = this.calculateOperatingInflows(startDate, endDate);
    const operatingOutflows = this.calculateOperatingOutflows(startDate, endDate);
    
    // Investing Activities
    const assetPurchases = this.calculateAssetPurchases(startDate, endDate);
    const assetSales = this.calculateAssetSales(startDate, endDate);
    
    // Financing Activities
    const loanReceipts = this.calculateLoanReceipts(startDate, endDate);
    const loanRepayments = this.calculateLoanRepayments(startDate, endDate);
    
    return {
      operatingActivities: {
        inflows: operatingInflows,
        outflows: operatingOutflows,
        netOperating: operatingInflows - operatingOutflows
      },
      investingActivities: {
        purchases: assetPurchases,
        sales: assetSales,
        netInvesting: assetSales - assetPurchases
      },
      financingActivities: {
        receipts: loanReceipts,
        repayments: loanRepayments,
        netFinancing: loanReceipts - loanRepayments
      },
      netCashFlow: (operatingInflows - operatingOutflows) + 
                   (assetSales - assetPurchases) + 
                   (loanReceipts - loanRepayments)
    };
  }
}
```

**Acceptance Criteria:**
- Cash flow statement shows real numbers
- Operating/Investing/Financing sections populated
- Reconciles with bank balance changes
- Exportable to PDF

---

### 1.3 Enforce Period Locking Everywhere ⚠️ CRITICAL
**Issue:** Period lock only checked in PaymentService, bypassable in other handlers

**Required Changes:**
1. Create centralized lock checker:
```typescript
// electron/main/database/utils/periodLock.ts
export function checkPeriodLock(date: string): boolean {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT is_locked FROM financial_period 
    WHERE ? BETWEEN start_date AND end_date
  `).get(date);
  
  if (row?.is_locked) {
    throw new Error(`Cannot modify transactions in locked period: ${date}`);
  }
  return false;
}
```

2. Add to ALL transaction handlers:
- finance-handlers.ts (payments, refunds)
- transactions-handlers.ts (expenses, income)
- payroll-handlers.ts (salary payments)
- invoice handlers (invoice creation/editing)

**Acceptance Criteria:**
- ALL financial transactions blocked when period locked
- Lock status checked BEFORE db.transaction() starts
- Error message clearly states period is locked
- Only ADMIN can unlock period (with audit log)

---

### 1.4 Complete Bank Reconciliation UI
**Issue:** Backend exists but no frontend interface

**Required Changes:**
1. Create UI page: `src/pages/Finance/Reconciliation/ReconcileAccount.tsx`
2. Features needed:
   - Import bank statement (CSV)
   - Match transactions automatically
   - Manual matching interface
   - Mark as reconciled
   - Show unreconciled items
   - Generate reconciliation report

**Acceptance Criteria:**
- Can import bank CSV
- Auto-matches 80%+ of transactions
- Manual matching for unmatched items
- Shows reconciliation discrepancies
- Generates monthly reconciliation report

---

### 1.5 Build Voided Transaction Report
**Issue:** Voided transactions invisible in all reports

**Required Changes:**
```typescript
// electron/main/ipc/reports/reports-handlers.ts
ipcMain.handle('report:voidedTransactions', async (_, startDate, endDate) => {
  return db.prepare(`
    SELECT 
      lt.transaction_ref,
      lt.transaction_date,
      lt.amount,
      lt.description,
      lt.voided_reason,
      u1.full_name as recorded_by,
      u2.full_name as voided_by,
      lt.voided_at
    FROM ledger_transaction lt
    JOIN user u1 ON lt.recorded_by_user_id = u1.id
    LEFT JOIN user u2 ON lt.voided_by_user_id = u2.id
    WHERE lt.is_voided = 1
    AND lt.transaction_date BETWEEN ? AND ?
    ORDER BY lt.voided_at DESC
  `).all(startDate, endDate);
});
```

**Acceptance Criteria:**
- Report shows all voided transactions in period
- Includes who voided and when
- Shows void reason
- Flags suspicious patterns (multiple voids by same user)
- Exportable to PDF for audit

---

## PHASE 2: HIGH-RISK GAPS (Week 3-4) - SHOULD FIX

### 2.1 Add Aged Receivables Analysis
**Implementation:**
```typescript
ipcMain.handle('report:agedReceivables', async (_) => {
  return db.prepare(`
    SELECT 
      s.admission_number,
      s.first_name || ' ' || s.last_name as student_name,
      fi.invoice_number,
      fi.invoice_date,
      fi.due_date,
      (fi.total_amount - fi.amount_paid) as balance,
      CASE
        WHEN julianday('now') - julianday(fi.due_date) <= 30 THEN '0-30 days'
        WHEN julianday('now') - julianday(fi.due_date) <= 60 THEN '31-60 days'
        WHEN julianday('now') - julianday(fi.due_date) <= 90 THEN '61-90 days'
        ELSE '90+ days'
      END as aging_bucket
    FROM fee_invoice fi
    JOIN student s ON fi.student_id = s.id
    WHERE fi.status IN ('PENDING', 'PARTIAL')
    ORDER BY julianday('now') - julianday(fi.due_date) DESC
  `).all();
});
```

---

### 2.2 Auto-Apply Credit Balance to New Invoices
**Implementation:**
```typescript
// In invoice generation logic
const student = db.prepare('SELECT credit_balance FROM student WHERE id = ?').get(studentId);
const creditAvailable = student.credit_balance || 0;

let invoiceTotal = calculateTotalFees(studentId, termId);
let creditApplied = Math.min(creditAvailable, invoiceTotal);

// Create invoice
const invoice = db.prepare(`
  INSERT INTO fee_invoice (
    student_id, term_id, total_amount, amount_paid, credit_applied
  ) VALUES (?, ?, ?, ?, ?)
`).run(studentId, termId, invoiceTotal, creditApplied, creditApplied);

// Deduct credit from student
if (creditApplied > 0) {
  db.prepare('UPDATE student SET credit_balance = credit_balance - ? WHERE id = ?')
    .run(creditApplied, studentId);
}
```

---

### 2.3 Implement Mid-Term Proration
**Implementation:**
```typescript
function calculateProratedFees(
  studentId: number, 
  termId: number, 
  enrollmentDate: string
): number {
  const term = db.prepare('SELECT start_date, end_date FROM term WHERE id = ?').get(termId);
  const fees = db.prepare('SELECT amount FROM fee_structure WHERE ...').get(...);
  
  const termStart = new Date(term.start_date);
  const termEnd = new Date(term.end_date);
  const enrollment = new Date(enrollmentDate);
  
  const totalDays = (termEnd - termStart) / (1000 * 60 * 60 * 24);
  const remainingDays = (termEnd - enrollment) / (1000 * 60 * 60 * 24);
  
  return Math.round(fees.amount * (remainingDays / totalDays));
}
```

---

## PHASE 3: DOMAIN COMPLETENESS (Week 5-6) - NICE TO HAVE

### 3.1 Transport Costing Module
**Tables Needed:**
```sql
CREATE TABLE transport_route (
  id INTEGER PRIMARY KEY,
  route_name TEXT NOT NULL,
  vehicle_registration TEXT,
  driver_id INTEGER,
  distance_km DECIMAL(10,2),
  is_active BOOLEAN DEFAULT 1
);

CREATE TABLE transport_assignment (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  route_id INTEGER NOT NULL,
  academic_year_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL,
  monthly_fee INTEGER NOT NULL
);

CREATE TABLE vehicle_expense (
  id INTEGER PRIMARY KEY,
  vehicle_registration TEXT NOT NULL,
  expense_date DATE NOT NULL,
  expense_type TEXT NOT NULL, -- FUEL, MAINTENANCE, INSURANCE
  amount INTEGER NOT NULL,
  odometer_reading INTEGER
);
```

---

### 3.2 Boarding Cost Attribution
**Tables Needed:**
```sql
CREATE TABLE dormitory (
  id INTEGER PRIMARY KEY,
  dorm_name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  gender TEXT CHECK(gender IN ('M', 'F', 'MIXED')),
  is_active BOOLEAN DEFAULT 1
);

CREATE TABLE dorm_assignment (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  dorm_id INTEGER NOT NULL,
  bed_number TEXT,
  academic_year_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL
);

CREATE TABLE boarding_expense (
  id INTEGER PRIMARY KEY,
  dorm_id INTEGER,
  expense_date DATE NOT NULL,
  expense_type TEXT NOT NULL, -- FOOD, UTILITIES, SECURITY, LAUNDRY
  amount INTEGER NOT NULL,
  per_student BOOLEAN DEFAULT 0
);
```

---

### 3.3 Scholarship/Sponsor Tracking
**Tables Needed:**
```sql
CREATE TABLE sponsor (
  id INTEGER PRIMARY KEY,
  sponsor_name TEXT NOT NULL,
  sponsor_type TEXT CHECK(sponsor_type IN ('GOVERNMENT', 'NGO', 'CORPORATE', 'INDIVIDUAL')),
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT 1
);

CREATE TABLE sponsorship (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  sponsor_id INTEGER NOT NULL,
  academic_year_id INTEGER NOT NULL,
  amount_per_term INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT DEFAULT 'ACTIVE'
);

CREATE TABLE sponsorship_disbursement (
  id INTEGER PRIMARY KEY,
  sponsorship_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL,
  disbursement_date DATE NOT NULL,
  amount INTEGER NOT NULL,
  reference_number TEXT,
  transaction_id INTEGER
);
```

---

## TESTING REQUIREMENTS

### Unit Tests Required:
1. Payment recording with approval workflow
2. Period lock enforcement
3. Cash flow calculations
4. Aged receivables calculation
5. Proration logic
6. Credit balance application

### Integration Tests Required:
1. End-to-end payment → invoice → receipt flow
2. Payroll calculation → approval → payment
3. Bank reconciliation full workflow
4. Invoice generation with exemptions + credits

### E2E Tests Required:
1. Complete fee payment journey (UI → DB → Receipt)
2. Approval workflow (request → approve → execute)
3. Financial close (generate reports → lock period → verify immutability)

**Minimum Test Coverage:** 80% for financial modules

---

## SUCCESS CRITERIA

### Before Production Deployment:

**Mandatory Checklist:**
- [ ] All 8 Critical Blockers fixed and tested
- [ ] Period locking enforced in all transaction types
- [ ] Approval workflows implemented for high-value transactions
- [ ] Cash flow statement produces real calculations
- [ ] Bank reconciliation UI completed
- [ ] Voided transaction report available
- [ ] Aged receivables report with 30/60/90 buckets
- [ ] Credit balance auto-applied to invoices
- [ ] Test coverage >80% for finance module
- [ ] External audit simulation passed
- [ ] User acceptance testing by school accountant completed

**Financial Reports Must Answer:**
- ✅ What is our current cash position?
- ✅ Which parents owe fees (by aging bucket)?
- ✅ Is the school bus profitable?
- ✅ Are boarding operations profitable?
- ✅ What is our monthly operating profit?
- ✅ Do we have sufficient cash for next month's payroll?

**Audit Requirements Met:**
- ✅ Complete audit trail for all transactions
- ✅ Voided transactions visible and auditable
- ✅ Period locking prevents backdating
- ✅ Approval workflow prevents unauthorized transactions
- ✅ Bank reconciliation matches system balance

---

## RISK MITIGATION

### If Timeline at Risk:

**MUST HAVE (Absolute Minimum):**
1. Approval workflows
2. Period locking enforcement
3. Voided transaction report

**CAN DEFER (After Initial Deployment):**
1. Transport costing
2. Boarding attribution
3. Scholarship tracking
4. NEMIS export

### If Budget Constraints:

**Priority Order:**
1. Phase 1 (Critical Blockers) - CANNOT SKIP
2. Phase 2 items 2.1, 2.2 (Aged receivables, Credit application) - HIGH VALUE
3. Phase 2 item 2.3 (Proration) - MEDIUM VALUE
4. Phase 3 (Domain) - LOWEST PRIORITY

---

## DEPLOYMENT STRATEGY

### Pre-Production Checklist:
1. ✅ All Phase 1 fixes deployed
2. ✅ Database backup strategy confirmed
3. ✅ User training completed
4. ✅ Parallel run with existing system (1 month)
5. ✅ External auditor review passed
6. ✅ Board approval obtained
7. ✅ Disaster recovery plan tested

### Go-Live Plan:
- **Week 0:** Deploy to test environment
- **Week 1-4:** Parallel run (old + new system)
- **Week 5:** Cutover weekend
- **Week 6-8:** Hypercare support

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-02  
**Owner:** Development Team  
**Reviewer:** Principal & Chief Accountant  
