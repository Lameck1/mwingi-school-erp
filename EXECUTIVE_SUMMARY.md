# EXECUTIVE SUMMARY: MWINGI SCHOOL ERP AUDIT

## Non-Technical Overview for School Leadership

**Prepared For:** Board of Directors, Principal, Chief Accountant  
**Date:** 2026-02-02  
**Classification:** CONFIDENTIAL  

---

## 📊 OVERALL ASSESSMENT

### System Readiness: **60% Complete** ⚠️

**Verdict:** The Mwingi School ERP system is **NOT READY for production use** without addressing critical gaps in financial controls, reporting, and audit compliance.

### Risk Level: **HIGH** 🔴

Deploying the system in its current state exposes the school to:

- Financial misreporting
- Fraud risk
- Audit failures
- Regulatory penalties
- Legal liability

---

## 🎯 WHAT WORKS WELL

### ✅ Strong Foundations (60%)

1. **Payroll Calculations**
   - Kenya 2024 statutory rates correctly implemented (PAYE, NSSF, SHIF, Housing Levy)
   - Accurate salary calculations
   - Proper deduction tracking

2. **Basic Payment Processing**
   - Can record fee payments
   - Generates receipts
   - Tracks payment history

3. **Security**
   - Database encrypted
   - Passwords protected
   - User access control (3 roles: Admin, Clerk, Auditor)

4. **Kenya Curriculum Support**
   - CBC grading system implemented
   - Junior Secondary tracking
   - Term-based fee structure

5. **Data Integrity**
   - Transaction-based updates (prevents partial saves)
   - Audit logging (partial)
   - Soft deletes (data not lost)

---

## ⚠️ CRITICAL GAPS (Must Fix Before Launch)

### 1. NO APPROVAL WORKFLOWS 🔴 HIGHEST RISK

**What This Means:**
Any clerk can process a payment of **any amount** without supervisor approval.

**Real-World Risk:**

```
Scenario: Clerk processes 5 million KES "payment" to fictitious vendor
Current System: Transaction succeeds, no alerts
Result: Money stolen, no approval trail for auditors
```

**What's Needed:**

- Payments >100,000 KES require supervisor approval
- Payments >500,000 KES require dual authorization (Principal + Accountant)
- All refunds require approval

**Timeline to Fix:** 1 week  
**Cost to School if Not Fixed:** Undetectable fraud, audit failure

---

### 2. CASH FLOW REPORTS ARE BROKEN 🔴 CRITICAL

**What This Means:**
The "Cash Flow Statement" button exists but shows **incorrect/empty data**.

**Real-World Risk:**

```
Board Meeting: "According to cash flow, we have 2M KES available"
Reality: Report is non-functional. Actual available cash: 200K KES
Decision: Board approves 1.5M construction project
Result: Bounced checks, unpaid salaries
```

**What's Needed:**

- Rebuild cash flow calculations from scratch
- Separate operating/investing/financing activities
- Match bank account balances

**Timeline to Fix:** 1 week  
**Cost to School if Not Fixed:** Wrong financial decisions, liquidity crisis

---

### 3. PERIOD LOCKING CAN BE BYPASSED 🔴 CRITICAL

**What This Means:**
After "closing the books" for December, transactions can still be backdated to December.

**Real-World Risk:**

```
January 15: Financial statements approved by Board
January 20: Clerk backdates 200K expense to December
Result: December P&L changes AFTER Board approval
Impact: Audit failure, loss of trust
```

**What's Needed:**

- Lock ALL transaction types when period closed
- Only Principal can unlock (with audit trail)
- Prevent any backdating

**Timeline to Fix:** 3 days  
**Cost to School if Not Fixed:** Financial statement manipulation, audit failure

---

### 4. BANK RECONCILIATION NOT AVAILABLE 🔴 CRITICAL

**What This Means:**
Cannot verify that system balance matches bank statement.

**Real-World Risk:**

```
6 months pass without reconciliation
System shows: 3M KES in bank
Actual bank: 2.1M KES (900K missing due to fees + fraud)
School issues 2.5M checks
Result: All checks bounce
```

**What's Needed:**

- Build UI to upload bank statements
- Auto-match transactions
- Flag discrepancies
- Monthly reconciliation reports

**Timeline to Fix:** 1 week  
**Cost to School if Not Fixed:** Undetected theft, bounced payments

---

### 5. VOIDED TRANSACTIONS INVISIBLE 🔴 HIGH RISK

**What This Means:**
When a transaction is "voided" (cancelled), it disappears from all reports.

**Real-World Risk:**

```
Parent pays 25K cash, receives receipt
Clerk voids payment next day, pockets cash
System shows: No payment received
Parent shows receipt: System shows "voided - duplicate entry"
Result: Theft + no way to prove parent paid
```

**What's Needed:**

- "Voided Transactions Report"
- Show who voided, when, and why
- Alert on suspicious patterns (same clerk voiding multiple times)

**Timeline to Fix:** 2 days  
**Cost to School if Not Fixed:** Theft concealment, parent disputes

---

## 📈 WHAT MANAGEMENT CANNOT CURRENTLY KNOW

### Questions the System CANNOT Answer

❌ **"Is the school bus profitable or losing money?"**

- System tracks total transport income and expenses
- Cannot separate Bus A (city route) from Bus B (rural route)
- Cannot tell which routes subsidize which
- **Impact:** May add unprofitable bus routes

❌ **"Do boarding fees cover boarding costs?"**

- System collects boarding fees
- Cannot separate boarding expenses (food, utilities, matron salary) from teaching expenses
- **Impact:** May underprice boarding, losing money unknowingly

❌ **"Which parents are 90+ days overdue on fees?"**

- System shows total defaulters
- Cannot separate recent (30 days) from chronic (90+ days)
- **Impact:** Wastes time chasing small recent debts while large old debts remain uncollected

❌ **"How much cash will we have next month?"**

- Cash flow statement broken
- Cannot forecast based on enrollment, payroll, expenses
- **Impact:** May run out of cash unexpectedly

❌ **"Is Transport Department within budget?"**

- Budget system exists but no variance reporting
- Cannot see "budgeted 500K, spent 700K"
- **Impact:** Overspending goes unnoticed until year-end

---

## 💰 FINANCIAL IMPACT SUMMARY

### Revenue at Risk

| Risk Area | Potential Annual Impact |
|-----------|------------------------|
| Undetected fraud (no approval workflow) | Up to 2M KES |
| Mid-term enrollment without proration | 200-500K KES undercharged |
| Unpaid overpayment credits not applied | 100-300K KES (parent disputes) |
| Poor debt collection (no aging report) | 500K-1M KES uncollectible |
| **TOTAL EXPOSURE** | **2.8M - 3.8M KES/year** |

### Operational Impact

| Issue | Consequence |
|-------|------------|
| No bank reconciliation | Undetected bank errors/fraud |
| Broken cash flow | Poor liquidity decisions, bounced checks |
| Voided transactions invisible | Theft concealment, audit failure |
| No transport/boarding costing | Cannot price services correctly |

---

## 📋 RECOMMENDED ACTION PLAN

### Phase 1: CRITICAL FIXES (Weeks 1-2) - **MANDATORY**

**Budget:** 400,000 - 600,000 KES (developer time)

1. ✅ Implement approval workflows
2. ✅ Fix cash flow calculations
3. ✅ Enforce period locking everywhere
4. ✅ Complete bank reconciliation UI
5. ✅ Build voided transaction report

**Result:** System becomes production-safe for basic operations

---

### Phase 2: HIGH-VALUE IMPROVEMENTS (Weeks 3-4) - **RECOMMENDED**

**Budget:** 300,000 - 400,000 KES

1. ✅ Aged receivables report (30/60/90 day buckets)
2. ✅ Auto-apply credit balances to new invoices
3. ✅ Mid-term enrollment proration
4. ✅ Budget variance reporting

**Result:** Better management decision-making, improved cash collection

---

### Phase 3: DOMAIN ENHANCEMENTS (Weeks 5-6) - **OPTIONAL**

**Budget:** 400,000 - 500,000 KES

1. Transport costing (per bus/route profitability)
2. Boarding cost attribution (per dorm profitability)
3. Scholarship/sponsor tracking
4. NEMIS/MOE reporting export

**Result:** Full management visibility, regulatory compliance

---

## 🔒 AUDIT & COMPLIANCE STATUS

### External Audit Readiness: **FAIL** ❌

**Issues That Will Fail Audit:**

1. Incomplete audit trail (voided transactions not visible)
2. Weak internal controls (no approval workflow)
3. Period lock bypassable (books can be changed after closing)
4. No bank reconciliation records
5. Financial reports unreliable (cash flow broken)

### Statutory Compliance (KRA/NSSF): **PARTIAL** ⚠️

**What Works:**

- ✅ Payroll calculations correct
- ✅ PAYE/NSSF/SHIF deductions accurate

**What's Missing:**

- ❌ Cannot export P9 forms for KRA
- ❌ Cannot export NSSF remittance files
- ❌ No TSC teacher salary reconciliation

---

## 💡 MANAGEMENT RECOMMENDATIONS

### For the Board

1. **DO NOT approve production deployment** until Phase 1 fixes completed
2. **Allocate 1.2M - 1.5M KES** for full remediation (Phases 1-3)
3. **Require independent audit review** before go-live
4. **Plan 1-month parallel run** (old system + new system simultaneously)
5. **Budget for ongoing maintenance** (150K KES/month)

### For the Principal

1. **Review approval workflow thresholds** - what amounts need Principal authorization?
2. **Define financial close process** - who locks periods, when, and how?
3. **Establish bank reconciliation schedule** - monthly, by whom?
4. **Approve user access levels** - who can do what in the system?

### For the Chief Accountant

1. **Participate in Phase 1 testing** - verify approval workflows work correctly
2. **Define chart of accounts** - how to categorize income/expenses
3. **Review reporting needs** - what reports are critical for month-end?
4. **Plan data migration** - how to import historical student/fee data?

---

## ⏱️ TIMELINE TO PRODUCTION

### Realistic Deployment Schedule

```
Week 1-2:  Phase 1 Critical Fixes
Week 3:    Testing & Quality Assurance
Week 4:    User Training
Week 5-8:  Parallel Run (old + new system)
Week 9:    Cutover Weekend
Week 10+:  Hypercare Support

EARLIEST GO-LIVE: 10 weeks (2.5 months)
```

### Fast-Track Option (High Risk)

```
Week 1-2:  Phase 1 Critical Fixes ONLY
Week 3:    Minimal Testing
Week 4:    Go-Live with limited features

RISK: Missing features may cause operational issues
RECOMMENDATION: Not advised for financial system
```

---

## 🎯 SUCCESS METRICS

### How to Know System is Ready

**Before Go-Live Checklist:**

- [ ] External auditor reviews and approves system
- [ ] School accountant completes 1-month test run successfully
- [ ] All Phase 1 critical fixes verified
- [ ] User training completed for all staff
- [ ] Backup and disaster recovery tested
- [ ] Board formally approves deployment

**After Go-Live (First 3 Months):**

- Monthly financial close completed on time
- Bank reconciliation matches system balance
- No audit trail gaps discovered
- All reports produce accurate data
- No fraud incidents detected
- User satisfaction >80%

---

## 📞 NEXT STEPS

### Immediate Actions

1. **Board Decision:** Approve remediation budget and timeline
2. **Vendor Engagement:** Contract developer for Phase 1 fixes
3. **Team Formation:** Assign Principal, Accountant, IT person to project team
4. **Risk Assessment:** Decide if current system stays in parallel
5. **Communication Plan:** Inform parents of fee payment changes

### Questions for Board Consideration

1. What is our risk tolerance for financial system deployment?
2. What budget can we allocate for system fixes?
3. Do we have capacity for 1-month parallel run?
4. Who will be the system owner (responsible for decisions)?
5. What happens if system fails in production?

---

## 📝 CONCLUSION

The Mwingi School ERP has **solid technical foundations** but **critical gaps in financial controls and reporting**.

**The system is 60% production-ready.**

With **4-6 weeks of focused development** and a **budget of 1.2M - 1.5M KES**, it can become a robust, audit-compliant school management system that serves Mwingi Adventist School for many years.

**Without these fixes, deploying the system risks:**

- Financial misstatements
- Fraud
- Audit failures  
- Regulatory penalties
- Reputational damage

**Recommendation:** **Approve Phase 1 remediation immediately.** Do not deploy to production until external audit review passed.

---

**Document Prepared By:** Principal Software Auditor  
**Review Required By:** Board of Directors, Principal, Chief Accountant  
**Next Review Date:** After Phase 1 completion  
**Confidentiality:** This document contains sensitive security and financial control information. Restrict distribution to Board members and senior management only.

---

## APPENDIX: Glossary for Non-Technical Readers

**Approval Workflow:** System that requires a supervisor to authorize large transactions before they're processed.

**Period Locking:** Preventing changes to financial records after month/year is closed (like putting books in a safe).

**Bank Reconciliation:** Matching school's records with bank statement to catch errors/fraud.

**Voided Transaction:** Cancelled transaction (like crossing out an entry in a ledger).

**Audit Trail:** Record of who did what and when (for accountability).

**Cash Flow Statement:** Report showing where cash came from and where it went.

**Aged Receivables:** Report showing who owes money and for how long (30/60/90 days).

**Proration:** Charging partial fees when student joins/leaves mid-term.

**Credit Balance:** Money parent overpaid that should be applied to next invoice.

**Phase 1/2/3:** Priority groups for fixes (Phase 1 = most urgent).
