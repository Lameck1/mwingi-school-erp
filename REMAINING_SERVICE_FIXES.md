# Remaining Service Database Parameter Fixes

## Summary
3 of 11 services have been successfully fixed with database parameter support:
- ✅ PaymentService
- ✅ FeeProrationService  
- ✅ ScholarshipService

**Remaining services needing fixes:** 6 finance services + 4 report services = **10 services total**

## Pattern to Apply (Identical for ALL Services)

### Step 1: Add Database Import
```typescript
import Database from 'better-sqlite3-multiple-ciphers'
import { getDatabase } from '../../database'
```

### Step 2: For EVERY Nested Class
Add constructor with database parameter:

```typescript
class RepositoryClass {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async method() {
    const db = this.db  // Change from: const db = getDatabase()
    // ... rest of method
  }
}
```

### Step 3: Update Main Service Constructor
Pass database to ALL nested class instantiations:

```typescript
export class ServiceName {
  private db: Database.Database
  private readonly repo: RepositoryClass

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new RepositoryClass(this.db)  // Pass this.db
  }
}
```

### Step 4: Fix Direct get Database() Calls
Replace any direct `getDatabase()` calls in service methods with `this.db`

---

## Services Requiring Fixes

### Finance Services

#### 1. CreditAutoApplicationService
**File:** electron/main/services/finance/CreditAutoApplicationService.ts

**Nested Classes:**
- CreditRepository (3 methods)
- InvoiceRepository (2 methods)  
- CreditAllocator (1 method with getDatabase() calls)
- FIFOAllocationStrategy
- Main CreditAutoApplicationService

**getDatabase() Locations:** ~10-12 calls to fix

---

#### 2. CashFlowStatementService  
**File:** electron/main/services/reports/CashFlowStatementService.ts

**Nested Classes:**
- CashFlowDataRepository (4-5 methods)
- CashFlowCalculator
- CashFlowReportGenerator
- Main CashFlowStatementService

**getDatabase() Locations:** ~8-10 calls

---

#### 3. AgedReceivablesService
**File:** electron/main/services/reports/AgedReceivablesService.ts

**Nested Classes:**
- ReceivablesDataRepository (2-3 methods)
- AgingCalculator
- AgedReceivablesReportGenerator
- Main AgedReceivablesService

**getDatabase() Locations:** ~6-8 calls

---

#### 4. StudentLedgerService
**File:** electron/main/services/reports/StudentLedgerService.ts

**Nested Classes:**
- LedgerDataRepository (2-3 methods)
- LedgerReportGenerator
- Main StudentLedgerService

**getDatabase() Locations:** ~5-7 calls

---

#### 5. SegmentProfitabilityService
**File:** electron/main/services/reports/SegmentProfitabilityService.ts

**Nested Classes:**
- ProfitabilityRepository (3-4 methods)
- ClassProfitabilityAnalyzer
- ActivityFeeAnalyzer  
- SegmentComparator
- Main SegmentProfitabilityService

**getDatabase() Locations:** ~10-12 calls

---

#### 6. NEMISExportService
**File:** electron/main/services/reports/NEMISExportService.ts

**Nested Classes:**
- NEMISDataRepository (2-3 methods)
- NEMISDataTransformer
- CSVExporter
- Main NEMISExportService

**getDatabase() Locations:** ~6-8 calls

---

## Implementation Checklist

For EACH service above:

- [ ] Add `import Database from 'better-sqlite3-multiple-ciphers'`
- [ ] For each nested class:
  - [ ] Add `private db: Database.Database`
  - [ ] Add `constructor(db?: Database.Database) { this.db = db || getDatabase() }`
  - [ ] Replace ALL `const db = getDatabase()` with `const db = this.db`
- [ ] Update main service:
  - [ ] Add `private db: Database.Database`
  - [ ] Add `db?: Database.Database` parameter to constructor
  - [ ] Initialize: `this.db = db || getDatabase()`
  - [ ] Pass `this.db` when instantiating nested classes
  - [ ] Replace any direct `getDatabase()` calls with `this.db`
- [ ] Test service: `npm test -- ServiceName.test.ts --run`
- [ ] Verify: Zero "Database not initialized" errors

---

## Estimated Time per Service

- Simple services (3-4 nested classes): **15 minutes**
- Complex services (5-6 nested classes): **20-25 minutes**

**Total estimated time:** 2-3 hours for all 6 remaining services

---

## Success Criteria

After completing ALL 6 services:

```bash
npm test -- --run
```

**Expected Result:**
- Test Files: 15 passed
- Tests: 263 passed  
- Errors: 0 (no "Database not initialized" errors)

**Current Status:**
- Test Files: 4 passed, 11 failed
- Tests: 37 passed, 226 failed
- Errors: ~40 database initialization errors

---

## Example: Full Fix for CreditAutoApplicationService

```typescript
// Step 1: Add import
import Database from 'better-sqlite3-multiple-ciphers'
import { getDatabase } from '../../database'

// Step 2: Fix CreditRepository
class CreditRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getStudentCreditBalance(studentId: number): Promise<number> {
    const db = this.db  // Changed from getDatabase()
    const result = db.prepare(`...`).get(studentId)
    return result?.balance || 0
  }

  // Repeat for all other methods...
}

// Step 2b: Fix InvoiceRepository
class InvoiceRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getOutstandingInvoices(studentId: number): Promise<OutstandingInvoice[]> {
    const db = this.db  // Changed from getDatabase()
    return db.prepare(`...`).all(studentId)
  }
}

// Step 3: Fix main service
export class CreditAutoApplicationService {
  private db: Database.Database
  private readonly creditRepo: CreditRepository
  private readonly invoiceRepo: InvoiceRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.creditRepo = new CreditRepository(this.db)
    this.invoiceRepo = new InvoiceRepository(this.db)
  }

  // All methods now use this.creditRepo and this.invoiceRepo which have correct db
}
```

---

## Notes

- **Pattern is 100% consistent** across all services
- Tests are already written and passing for the fixed services
- No business logic changes needed - only database parameter plumbing
- After ALL services are fixed, integration and E2E tests should start passing
- ApprovalWorkflowService and PeriodLockingService are already correctly implemented

---

## Priority Order

1. **CreditAutoApplicationService** (highest usage, many tests)
2. **SegmentProfitabilityService** (complex, many database calls)
3. **CashFlowStatementService** (report services)
4. **AgedReceivablesService** (report services)
5. **StudentLedgerService** (report services)
6. **NEMISExportService** (report services)

---

Generated: February 2, 2026
Status: 3/11 services complete, 10 remaining
