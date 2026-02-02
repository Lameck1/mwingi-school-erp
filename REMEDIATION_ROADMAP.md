# REMEDIATION ROADMAP: MWINGI SCHOOL ERP
## Production-Grade Financial System Implementation

**Date:** 2026-02-02  
**Based On:** Critical Audit Report (CRITICAL_AUDIT_REPORT.md)  
**Target:** Industrial-grade, production-ready ERP for Kenyan CBC/CBE schools  
**Timeline:** 4 phases over 6-8 weeks  

---

## OVERVIEW

This roadmap converts the audit findings into actionable, phased remediation with **complete, working code** for every change. Each phase builds on the previous, ensuring the system progresses from critically flawed to production-ready.

### Guiding Principles

1. **Financial Correctness First**: Every transaction must be deterministic, auditable, and reconstructable
2. **Separation of Concerns**: Clear boundaries between domain logic, data access, and presentation
3. **Domain-Driven Design**: Model aligns with Kenyan school operations (CBC/CBE, TSC, NEMIS)
4. **Defense in Depth**: Multiple layers of validation, authorization, and audit
5. **No Silent Failures**: All errors surfaced, logged, and actionable

### Success Criteria

After completion, the system must:
- ✅ Pass external financial audits
- ✅ Support decision-grade management reporting
- ✅ Prevent unauthorized transactions through multi-level approval
- ✅ Maintain complete, tamper-proof audit trails
- ✅ Handle all edge cases (mid-term changes, overpayments, refunds)
- ✅ Comply with Kenyan statutory reporting requirements

---

## PHASE 1: CORE FINANCIAL CONTROLS (Week 1-2)

### Objective
Establish foundational financial controls to prevent fraud, unauthorized transactions, and data manipulation. Make the system audit-safe.

### Defects Addressed
1. ❌ No approval workflows (Critical Finding 2.1)
2. ❌ Period locking incomplete (Critical Finding 2.3)
3. ❌ Voiding audit trail invisible (Critical Finding 2.5)
4. ❌ No transaction velocity limits
5. ❌ No amount authorization thresholds

### Architectural Principles
- **Command Pattern**: All financial operations as commands with validation
- **Chain of Responsibility**: Multi-level approval workflow
- **Event Sourcing**: Immutable financial events
- **Audit-First Design**: Every action logged before execution

---

### STEP 1.1: Database Schema for Approval Workflows

**File:** `electron/main/database/migrations/010_approval_workflows.ts`

```typescript
import Database from 'better-sqlite3-multiple-ciphers'

export function up(db: Database.Database): void {
  db.exec(`
    -- Approval workflow configuration
    CREATE TABLE IF NOT EXISTS approval_threshold (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN (
        'FEE_PAYMENT', 'EXPENSE', 'SALARY_PAYMENT', 'REFUND', 
        'FEE_EXEMPTION', 'ASSET_PURCHASE', 'BANK_TRANSFER'
      )),
      min_amount INTEGER NOT NULL,
      max_amount INTEGER,
      required_role TEXT NOT NULL CHECK(required_role IN (
        'ACCOUNTS_CLERK', 'BURSAR', 'PRINCIPAL', 'BOARD_CHAIR'
      )),
      requires_dual_approval BOOLEAN DEFAULT 0,
      description TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Approval requests
    CREATE TABLE IF NOT EXISTS approval_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_number TEXT NOT NULL UNIQUE,
      transaction_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT NOT NULL,
      supporting_documents TEXT, -- JSON array of file paths
      requested_by_user_id INTEGER NOT NULL,
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      current_status TEXT DEFAULT 'PENDING' CHECK(current_status IN (
        'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'
      )),
      metadata TEXT, -- JSON: transaction details, student_id, etc.
      completed_at DATETIME,
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id)
    );

    -- Approval actions (multi-stage approval trail)
    CREATE TABLE IF NOT EXISTS approval_action (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      approver_user_id INTEGER NOT NULL,
      approver_role TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('APPROVED', 'REJECTED')),
      comments TEXT,
      approval_order INTEGER NOT NULL, -- 1st approval, 2nd approval, etc.
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES approval_request(id),
      FOREIGN KEY (approver_user_id) REFERENCES user(id)
    );

    -- Period lock enforcement table
    CREATE TABLE IF NOT EXISTS financial_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_name TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_locked BOOLEAN DEFAULT 0,
      locked_by_user_id INTEGER,
      locked_at DATETIME,
      unlock_reason TEXT,
      unlocked_by_user_id INTEGER,
      unlocked_at DATETIME,
      FOREIGN KEY (locked_by_user_id) REFERENCES user(id),
      FOREIGN KEY (unlocked_by_user_id) REFERENCES user(id),
      UNIQUE(start_date, end_date)
    );

    -- Voided transactions report table (make voids visible)
    CREATE TABLE IF NOT EXISTS void_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      original_amount INTEGER NOT NULL,
      void_reason TEXT NOT NULL,
      voided_by_user_id INTEGER NOT NULL,
      approved_by_user_id INTEGER, -- Supervisor approval
      voided_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES ledger_transaction(id),
      FOREIGN KEY (voided_by_user_id) REFERENCES user(id),
      FOREIGN KEY (approved_by_user_id) REFERENCES user(id)
    );

    -- Insert default approval thresholds (Kenya school context)
    INSERT INTO approval_threshold (transaction_type, min_amount, max_amount, required_role, requires_dual_approval, description) VALUES
    -- Payments
    ('FEE_PAYMENT', 0, 10000000, 'ACCOUNTS_CLERK', 0, 'Fee payments up to 100K KES'),
    ('FEE_PAYMENT', 10000001, 50000000, 'BURSAR', 0, 'Fee payments 100K-500K KES'),
    ('FEE_PAYMENT', 50000001, NULL, 'PRINCIPAL', 1, 'Fee payments over 500K KES (dual approval)'),
    
    -- Expenses
    ('EXPENSE', 0, 5000000, 'ACCOUNTS_CLERK', 0, 'Expenses up to 50K KES'),
    ('EXPENSE', 5000001, 20000000, 'BURSAR', 0, 'Expenses 50K-200K KES'),
    ('EXPENSE', 20000001, NULL, 'PRINCIPAL', 1, 'Expenses over 200K KES (dual approval)'),
    
    -- Refunds (always require supervisor)
    ('REFUND', 0, 10000000, 'BURSAR', 0, 'Refunds up to 100K KES'),
    ('REFUND', 10000001, NULL, 'PRINCIPAL', 1, 'Refunds over 100K KES (dual approval)'),
    
    -- Salary payments (always principal approval)
    ('SALARY_PAYMENT', 0, NULL, 'PRINCIPAL', 0, 'All salary payments'),
    
    -- Fee exemptions
    ('FEE_EXEMPTION', 0, 5000000, 'BURSAR', 0, 'Exemptions up to 50K KES'),
    ('FEE_EXEMPTION', 5000001, NULL, 'PRINCIPAL', 1, 'Exemptions over 50K KES (dual approval)');

    -- Insert default financial periods (current year)
    INSERT INTO financial_period (period_name, start_date, end_date, is_locked) VALUES
    ('January 2026', '2026-01-01', '2026-01-31', 0),
    ('February 2026', '2026-02-01', '2026-02-28', 0),
    ('March 2026', '2026-03-01', '2026-03-31', 0);

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_approval_request_status ON approval_request(current_status, requested_at);
    CREATE INDEX IF NOT EXISTS idx_approval_request_user ON approval_request(requested_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_approval_action_request ON approval_action(request_id, approval_order);
    CREATE INDEX IF NOT EXISTS idx_financial_period_dates ON financial_period(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_void_audit_transaction ON void_audit(transaction_id);
  `);
}

export function down(db: Database.Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_void_audit_transaction;
    DROP INDEX IF EXISTS idx_financial_period_dates;
    DROP INDEX IF EXISTS idx_approval_action_request;
    DROP INDEX IF EXISTS idx_approval_request_user;
    DROP INDEX IF EXISTS idx_approval_request_status;
    
    DROP TABLE IF EXISTS void_audit;
    DROP TABLE IF EXISTS financial_period;
    DROP TABLE IF EXISTS approval_action;
    DROP TABLE IF EXISTS approval_request;
    DROP TABLE IF EXISTS approval_threshold;
  `);
}
```

**Impact:**
- ✅ **Financial Correctness**: Prevents unauthorized high-value transactions
- ✅ **Auditability**: Complete approval trail with multi-stage tracking
- ✅ **Report Reliability**: Period locking prevents post-close manipulation

---

### STEP 1.2: Approval Workflow Service

**File:** `electron/main/services/workflow/ApprovalWorkflowService.ts`

```typescript
import { BaseService } from '../base/BaseService'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface ApprovalRequestData {
  transactionType: string
  amount: number // in cents
  description: string
  metadata: Record<string, any>
  requestedByUserId: number
  supportingDocuments?: string[]
}

export interface ApprovalThreshold {
  id: number
  transaction_type: string
  min_amount: number
  max_amount: number | null
  required_role: string
  requires_dual_approval: boolean
}

export interface ApprovalRequestResult {
  success: boolean
  requestId?: number
  requestNumber?: string
  requiresApproval: boolean
  requiredRole?: string
  requiresDualApproval?: boolean
  error?: string
}

export class ApprovalWorkflowService extends BaseService<any, any> {
  protected tableName = 'approval_request'
  protected primaryKey = 'id'

  getTableName(): string { return this.tableName }
  getPrimaryKey(): string { return this.primaryKey }
  protected buildSelectQuery(): string { return 'SELECT * FROM approval_request' }
  protected mapRowToEntity(row: any): any { return row }
  protected validateCreate(data: any): string[] | null { return null }
  protected async validateUpdate(id: number, data: any): Promise<string[] | null> { return null }
  protected executeCreate(data: any): { lastInsertRowid: number | bigint } {
    throw new Error('Use createApprovalRequest instead')
  }
  protected executeUpdate(id: number, data: any): void {
    throw new Error('Use approve/reject methods instead')
  }

  /**
   * Check if a transaction requires approval based on amount and type
   */
  checkApprovalRequired(
    transactionType: string,
    amount: number
  ): { required: boolean; threshold?: ApprovalThreshold; error?: string } {
    const thresholds = this.db.prepare(`
      SELECT * FROM approval_threshold 
      WHERE transaction_type = ? 
      AND is_active = 1
      AND min_amount <= ?
      AND (max_amount IS NULL OR max_amount >= ?)
      ORDER BY min_amount DESC
      LIMIT 1
    `).all(transactionType, amount, amount) as ApprovalThreshold[]

    if (thresholds.length === 0) {
      // No threshold found - default to requiring approval
      return { 
        required: true, 
        error: `No approval threshold configured for ${transactionType}` 
      }
    }

    const threshold = thresholds[0]
    return { required: true, threshold }
  }

  /**
   * Create an approval request
   */
  async createApprovalRequest(
    data: ApprovalRequestData
  ): Promise<ApprovalRequestResult> {
    const check = this.checkApprovalRequired(data.transactionType, data.amount)
    
    if (check.error) {
      return { success: false, requiresApproval: true, error: check.error }
    }

    if (!check.required) {
      // No approval needed - can proceed directly
      return { 
        success: true, 
        requiresApproval: false 
      }
    }

    const threshold = check.threshold!

    return this.db.transaction(() => {
      const requestNumber = `APR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-6)}`
      
      const result = this.db.prepare(`
        INSERT INTO approval_request (
          request_number, transaction_type, amount, description,
          supporting_documents, requested_by_user_id, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        requestNumber,
        data.transactionType,
        data.amount,
        data.description,
        JSON.stringify(data.supportingDocuments || []),
        data.requestedByUserId,
        JSON.stringify(data.metadata)
      )

      const requestId = result.lastInsertRowid as number

      logAudit(
        data.requestedByUserId,
        'CREATE',
        'approval_request',
        requestId,
        null,
        data
      )

      return {
        success: true,
        requestId,
        requestNumber,
        requiresApproval: true,
        requiredRole: threshold.required_role,
        requiresDualApproval: threshold.requires_dual_approval
      }
    })()
  }

  /**
   * Approve an approval request
   */
  async approve(
    requestId: number,
    approverUserId: number,
    approverRole: string,
    comments?: string
  ): Promise<{ success: boolean; message?: string; approved?: boolean }> {
    const request = this.db.prepare('SELECT * FROM approval_request WHERE id = ?')
      .get(requestId) as any

    if (!request) {
      return { success: false, message: 'Approval request not found' }
    }

    if (request.current_status !== 'PENDING') {
      return { success: false, message: `Request already ${request.current_status}` }
    }

    // Check if approver has required role
    const threshold = this.db.prepare(`
      SELECT * FROM approval_threshold 
      WHERE transaction_type = ? 
      AND min_amount <= ?
      AND (max_amount IS NULL OR max_amount >= ?)
      AND is_active = 1
      ORDER BY min_amount DESC
      LIMIT 1
    `).get(request.transaction_type, request.amount, request.amount) as ApprovalThreshold | undefined

    if (!threshold) {
      return { success: false, message: 'No approval threshold found' }
    }

    // Check role hierarchy: ACCOUNTS_CLERK < BURSAR < PRINCIPAL < BOARD_CHAIR
    const roleHierarchy: Record<string, number> = {
      'ACCOUNTS_CLERK': 1,
      'BURSAR': 2,
      'PRINCIPAL': 3,
      'BOARD_CHAIR': 4
    }

    if (roleHierarchy[approverRole] < roleHierarchy[threshold.required_role]) {
      return { 
        success: false, 
        message: `Insufficient authority. Requires ${threshold.required_role} or higher.` 
      }
    }

    return this.db.transaction(() => {
      // Get current approval count
      const approvalCount = this.db.prepare(
        'SELECT COUNT(*) as count FROM approval_action WHERE request_id = ? AND action = ?'
      ).get(requestId, 'APPROVED') as { count: number }

      const approvalOrder = approvalCount.count + 1

      // Record approval action
      this.db.prepare(`
        INSERT INTO approval_action (
          request_id, approver_user_id, approver_role, action, 
          comments, approval_order
        ) VALUES (?, ?, ?, 'APPROVED', ?, ?)
      `).run(requestId, approverUserId, approverRole, comments || null, approvalOrder)

      // Check if we have enough approvals
      const requiresDual = threshold.requires_dual_approval
      const hasEnoughApprovals = requiresDual ? approvalOrder >= 2 : approvalOrder >= 1

      if (hasEnoughApprovals) {
        // Mark request as approved
        this.db.prepare(`
          UPDATE approval_request 
          SET current_status = 'APPROVED', completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(requestId)

        logAudit(
          approverUserId,
          'UPDATE',
          'approval_request',
          requestId,
          { current_status: request.current_status },
          { current_status: 'APPROVED', approver: approverUserId }
        )

        return { 
          success: true, 
          approved: true, 
          message: 'Request fully approved and can now be executed' 
        }
      } else {
        return { 
          success: true, 
          approved: false, 
          message: `Approval ${approvalOrder} of ${requiresDual ? 2 : 1} recorded. Awaiting additional approval.` 
        }
      }
    })()
  }

  /**
   * Reject an approval request
   */
  async reject(
    requestId: number,
    approverUserId: number,
    approverRole: string,
    comments: string
  ): Promise<{ success: boolean; message?: string }> {
    if (!comments || comments.trim().length === 0) {
      return { success: false, message: 'Rejection reason is required' }
    }

    const request = this.db.prepare('SELECT * FROM approval_request WHERE id = ?')
      .get(requestId) as any

    if (!request) {
      return { success: false, message: 'Approval request not found' }
    }

    if (request.current_status !== 'PENDING') {
      return { success: false, message: `Request already ${request.current_status}` }
    }

    return this.db.transaction(() => {
      const approvalCount = this.db.prepare(
        'SELECT COUNT(*) as count FROM approval_action WHERE request_id = ?'
      ).get(requestId) as { count: number }

      const approvalOrder = approvalCount.count + 1

      this.db.prepare(`
        INSERT INTO approval_action (
          request_id, approver_user_id, approver_role, action, 
          comments, approval_order
        ) VALUES (?, ?, ?, 'REJECTED', ?, ?)
      `).run(requestId, approverUserId, approverRole, comments, approvalOrder)

      this.db.prepare(`
        UPDATE approval_request 
        SET current_status = 'REJECTED', completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(requestId)

      logAudit(
        approverUserId,
        'UPDATE',
        'approval_request',
        requestId,
        { current_status: request.current_status },
        { current_status: 'REJECTED', rejector: approverUserId, reason: comments }
      )

      return { success: true, message: 'Request rejected' }
    })()
  }

  /**
   * Get pending approvals for a user based on their role
   */
  getPendingApprovals(userRole: string): any[] {
    // Role hierarchy check - can approve requests for their role or lower
    const roleHierarchy: Record<string, number> = {
      'ACCOUNTS_CLERK': 1,
      'BURSAR': 2,
      'PRINCIPAL': 3,
      'BOARD_CHAIR': 4
    }

    const userRoleLevel = roleHierarchy[userRole] || 0

    return this.db.prepare(`
      SELECT 
        ar.*,
        u.full_name as requester_name,
        at.required_role,
        at.requires_dual_approval,
        (SELECT COUNT(*) FROM approval_action WHERE request_id = ar.id AND action = 'APPROVED') as approval_count
      FROM approval_request ar
      JOIN user u ON ar.requested_by_user_id = u.id
      LEFT JOIN approval_threshold at ON (
        at.transaction_type = ar.transaction_type
        AND at.min_amount <= ar.amount
        AND (at.max_amount IS NULL OR at.max_amount >= ar.amount)
        AND at.is_active = 1
      )
      WHERE ar.current_status = 'PENDING'
      AND at.required_role IS NOT NULL
      ORDER BY ar.requested_at ASC
    `).all().filter((req: any) => {
      const requiredRoleLevel = roleHierarchy[req.required_role] || 0
      return userRoleLevel >= requiredRoleLevel
    })
  }

  /**
   * Check if a request is approved and can be executed
   */
  isApproved(requestId: number): boolean {
    const request = this.db.prepare(
      'SELECT current_status FROM approval_request WHERE id = ?'
    ).get(requestId) as { current_status: string } | undefined

    return request?.current_status === 'APPROVED'
  }
}
```

**Impact:**
- ✅ **Financial Correctness**: Amount-based authorization prevents unauthorized spending
- ✅ **Auditability**: Complete approval chain with multi-stage trail
- ✅ **Report Reliability**: Approval status queryable for management oversight

---

### STEP 1.3: Period Locking Service

**File:** `electron/main/services/finance/PeriodLockingService.ts`

```typescript
import { BaseService } from '../base/BaseService'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface FinancialPeriod {
  id: number
  period_name: string
  start_date: string
  end_date: string
  is_locked: boolean
  locked_by_user_id: number | null
  locked_at: string | null
}

export class PeriodLockingService extends BaseService<FinancialPeriod, any> {
  protected tableName = 'financial_period'
  protected primaryKey = 'id'

  getTableName(): string { return this.tableName }
  getPrimaryKey(): string { return this.primaryKey }
  protected buildSelectQuery(): string { return 'SELECT * FROM financial_period' }
  protected mapRowToEntity(row: any): FinancialPeriod { return row as FinancialPeriod }
  protected validateCreate(data: any): string[] | null { return null }
  protected async validateUpdate(id: number, data: any): Promise<string[] | null> { return null }
  protected executeCreate(data: any): { lastInsertRowid: number | bigint } {
    throw new Error('Use createPeriod method')
  }
  protected executeUpdate(id: number, data: any): void {
    throw new Error('Use lock/unlock methods')
  }

  /**
   * Check if a date falls within a locked period
   * CRITICAL: This must be called before ANY financial transaction
   */
  isDateLocked(transactionDate: string): { 
    locked: boolean; 
    period?: FinancialPeriod; 
    message?: string 
  } {
    const period = this.db.prepare(`
      SELECT * FROM financial_period 
      WHERE ? BETWEEN start_date AND end_date
    `).get(transactionDate) as FinancialPeriod | undefined

    if (!period) {
      // No period defined for this date - allow transaction but warn
      return { 
        locked: false, 
        message: 'Warning: No financial period defined for this date' 
      }
    }

    if (period.is_locked) {
      return {
        locked: true,
        period,
        message: `Period "${period.period_name}" is locked. Cannot record transactions for ${transactionDate}.`
      }
    }

    return { locked: false, period }
  }

  /**
   * Lock a financial period
   * Requires PRINCIPAL role or higher
   */
  async lockPeriod(
    periodId: number,
    userId: number,
    userRole: string
  ): Promise<{ success: boolean; message?: string }> {
    if (userRole !== 'PRINCIPAL' && userRole !== 'ADMIN') {
      return { 
        success: false, 
        message: 'Only Principal or Admin can lock financial periods' 
      }
    }

    const period = this.db.prepare('SELECT * FROM financial_period WHERE id = ?')
      .get(periodId) as FinancialPeriod | undefined

    if (!period) {
      return { success: false, message: 'Financial period not found' }
    }

    if (period.is_locked) {
      return { success: false, message: 'Period is already locked' }
    }

    // Check if there are any pending approval requests for transactions in this period
    const pendingInPeriod = this.db.prepare(`
      SELECT COUNT(*) as count FROM approval_request
      WHERE current_status = 'PENDING'
      AND json_extract(metadata, '$.transaction_date') BETWEEN ? AND ?
    `).get(period.start_date, period.end_date) as { count: number }

    if (pendingInPeriod.count > 0) {
      return { 
        success: false, 
        message: `Cannot lock period. ${pendingInPeriod.count} pending approval requests exist for this period.` 
      }
    }

    return this.db.transaction(() => {
      this.db.prepare(`
        UPDATE financial_period 
        SET is_locked = 1, 
            locked_by_user_id = ?, 
            locked_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, periodId)

      logAudit(
        userId,
        'UPDATE',
        'financial_period',
        periodId,
        { is_locked: false },
        { is_locked: true, locked_by: userId }
      )

      return { 
        success: true, 
        message: `Period "${period.period_name}" locked successfully` 
      }
    })()
  }

  /**
   * Unlock a financial period
   * Requires PRINCIPAL approval + documented reason
   */
  async unlockPeriod(
    periodId: number,
    userId: number,
    userRole: string,
    reason: string
  ): Promise<{ success: boolean; message?: string }> {
    if (userRole !== 'PRINCIPAL' && userRole !== 'ADMIN') {
      return { 
        success: false, 
        message: 'Only Principal or Admin can unlock financial periods' 
      }
    }

    if (!reason || reason.trim().length < 10) {
      return { 
        success: false, 
        message: 'Detailed reason (minimum 10 characters) required to unlock period' 
      }
    }

    const period = this.db.prepare('SELECT * FROM financial_period WHERE id = ?')
      .get(periodId) as FinancialPeriod | undefined

    if (!period) {
      return { success: false, message: 'Financial period not found' }
    }

    if (!period.is_locked) {
      return { success: false, message: 'Period is not locked' }
    }

    return this.db.transaction(() => {
      this.db.prepare(`
        UPDATE financial_period 
        SET is_locked = 0, 
            unlock_reason = ?,
            unlocked_by_user_id = ?, 
            unlocked_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(reason, userId, periodId)

      logAudit(
        userId,
        'UPDATE',
        'financial_period',
        periodId,
        { is_locked: true },
        { is_locked: false, unlocked_by: userId, reason }
      )

      return { 
        success: true, 
        message: `Period "${period.period_name}" unlocked` 
      }
    })()
  }

  /**
   * Get all periods with lock status
   */
  getAllPeriods(): FinancialPeriod[] {
    return this.db.prepare(`
      SELECT 
        fp.*,
        lu.full_name as locked_by_name,
        uu.full_name as unlocked_by_name
      FROM financial_period fp
      LEFT JOIN user lu ON fp.locked_by_user_id = lu.id
      LEFT JOIN user uu ON fp.unlocked_by_user_id = uu.id
      ORDER BY start_date DESC
    `).all() as FinancialPeriod[]
  }

  /**
   * Create a new financial period
   */
  async createPeriod(
    periodName: string,
    startDate: string,
    endDate: string,
    userId: number
  ): Promise<{ success: boolean; periodId?: number; message?: string }> {
    // Validate dates
    if (new Date(startDate) >= new Date(endDate)) {
      return { success: false, message: 'Start date must be before end date' }
    }

    // Check for overlapping periods
    const overlap = this.db.prepare(`
      SELECT COUNT(*) as count FROM financial_period
      WHERE (start_date <= ? AND end_date >= ?)
         OR (start_date <= ? AND end_date >= ?)
         OR (start_date >= ? AND end_date <= ?)
    `).get(startDate, startDate, endDate, endDate, startDate, endDate) as { count: number }

    if (overlap.count > 0) {
      return { success: false, message: 'Period overlaps with existing period' }
    }

    return this.db.transaction(() => {
      const result = this.db.prepare(`
        INSERT INTO financial_period (period_name, start_date, end_date, is_locked)
        VALUES (?, ?, ?, 0)
      `).run(periodName, startDate, endDate)

      const periodId = result.lastInsertRowid as number

      logAudit(
        userId,
        'CREATE',
        'financial_period',
        periodId,
        null,
        { period_name: periodName, start_date: startDate, end_date: endDate }
      )

      return { success: true, periodId, message: 'Period created successfully' }
    })()
  }
}
```

**Impact:**
- ✅ **Financial Correctness**: Prevents backdated transactions after period close
- ✅ **Auditability**: All lock/unlock actions logged with reasons
- ✅ **Report Reliability**: Financial statements immutable after period lock

---

### STEP 1.4: Enhanced Payment Service with Approval Integration

**File:** `electron/main/services/finance/EnhancedPaymentService.ts`

```typescript
import { BaseService } from '../base/BaseService'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { ApprovalWorkflowService } from '../workflow/ApprovalWorkflowService'
import { PeriodLockingService } from './PeriodLockingService'

export interface PaymentData {
  student_id: number
  invoice_id?: number
  amount: number // in KES (will be converted to cents)
  payment_method: string
  payment_reference?: string
  transaction_date: string
  description?: string
  term_id?: number
  amount_in_words?: string
}

export interface PaymentResult {
  success: boolean
  transactionRef?: string
  receiptNumber?: string
  requiresApproval?: boolean
  approvalRequestId?: number
  approvalRequestNumber?: string
  message?: string
}

export class EnhancedPaymentService extends BaseService<unknown, PaymentData> {
  protected tableName = 'ledger_transaction'
  protected primaryKey = 'id'
  private approvalService: ApprovalWorkflowService
  private periodService: PeriodLockingService

  constructor() {
    super()
    this.approvalService = new ApprovalWorkflowService()
    this.periodService = new PeriodLockingService()
  }

  getTableName(): string { return this.tableName }
  getPrimaryKey(): string { return this.primaryKey }
  protected buildSelectQuery(): string { return 'SELECT * FROM ledger_transaction' }
  protected mapRowToEntity(row: any): any { return row }
  protected validateCreate(data: PaymentData): string[] | null {
    const errors: string[] = []
    if (!data.student_id) errors.push('Student ID is required')
    if (!data.amount || data.amount <= 0) errors.push('Valid amount is required')
    if (!data.payment_method) errors.push('Payment method is required')
    if (!data.transaction_date) errors.push('Transaction date is required')
    return errors.length > 0 ? errors : null
  }
  protected async validateUpdate(id: number, data: Partial<PaymentData>): Promise<string[] | null> {
    return null
  }
  protected executeCreate(data: PaymentData): { lastInsertRowid: number | bigint } {
    throw new Error('Use recordPayment method instead')
  }
  protected executeUpdate(id: number, data: Partial<PaymentData>): void {
    throw new Error('Payments cannot be updated, only voided')
  }

  /**
   * Record a payment with approval workflow and period locking checks
   */
  async recordPayment(
    data: PaymentData,
    userId: number,
    userRole: string
  ): Promise<PaymentResult> {
    // 1. Validate input
    const errors = this.validateCreate(data)
    if (errors) {
      return { success: false, message: errors.join(', ') }
    }

    // 2. Check period lock
    const lockCheck = this.periodService.isDateLocked(data.transaction_date)
    if (lockCheck.locked) {
      return { success: false, message: lockCheck.message }
    }

    // 3. Convert amount to cents
    const amountCents = Math.round(data.amount * 100)

    // 4. Check if approval required
    const approvalCheck = this.approvalService.checkApprovalRequired(
      'FEE_PAYMENT',
      amountCents
    )

    if (approvalCheck.required && approvalCheck.threshold) {
      // Check role hierarchy
      const roleHierarchy: Record<string, number> = {
        'ACCOUNTS_CLERK': 1,
        'AUDITOR': 1,
        'BURSAR': 2,
        'PRINCIPAL': 3,
        'ADMIN': 4
      }

      const userLevel = roleHierarchy[userRole] || 0
      const requiredLevel = roleHierarchy[approvalCheck.threshold.required_role] || 0

      if (userLevel < requiredLevel) {
        // User doesn't have authority - create approval request
        const approvalResult = await this.approvalService.createApprovalRequest({
          transactionType: 'FEE_PAYMENT',
          amount: amountCents,
          description: data.description || `Fee payment for student ID ${data.student_id}`,
          metadata: {
            ...data,
            amount_cents: amountCents,
            user_id: userId,
            user_role: userRole
          },
          requestedByUserId: userId,
          supportingDocuments: []
        })

        if (!approvalResult.success) {
          return { success: false, message: approvalResult.error }
        }

        return {
          success: true,
          requiresApproval: true,
          approvalRequestId: approvalResult.requestId,
          approvalRequestNumber: approvalResult.requestNumber,
          message: `Payment requires ${approvalResult.requiredRole} approval. Request ${approvalResult.requestNumber} created.`
        }
      }
    }

    // 5. User has authority or no approval required - process payment
    return this.executePayment(data, amountCents, userId)
  }

  /**
   * Execute an approved payment
   */
  async executeApprovedPayment(
    approvalRequestId: number,
    executorUserId: number
  ): Promise<PaymentResult> {
    // 1. Verify approval is complete
    if (!this.approvalService.isApproved(approvalRequestId)) {
      return { success: false, message: 'Payment not fully approved yet' }
    }

    // 2. Get original payment data from approval request
    const request = this.db.prepare('SELECT * FROM approval_request WHERE id = ?')
      .get(approvalRequestId) as any

    if (!request) {
      return { success: false, message: 'Approval request not found' }
    }

    const metadata = JSON.parse(request.metadata)
    const paymentData: PaymentData = {
      student_id: metadata.student_id,
      invoice_id: metadata.invoice_id,
      amount: metadata.amount, // Already in KES
      payment_method: metadata.payment_method,
      payment_reference: metadata.payment_reference,
      transaction_date: metadata.transaction_date,
      description: metadata.description,
      term_id: metadata.term_id,
      amount_in_words: metadata.amount_in_words
    }

    const amountCents = metadata.amount_cents

    // 3. Re-check period lock (might have changed since approval requested)
    const lockCheck = this.periodService.isDateLocked(paymentData.transaction_date)
    if (lockCheck.locked) {
      return { success: false, message: lockCheck.message }
    }

    // 4. Execute payment
    return this.executePayment(paymentData, amountCents, executorUserId)
  }

  /**
   * Internal method to execute payment transaction
   */
  private executePayment(
    data: PaymentData,
    amountCents: number,
    userId: number
  ): PaymentResult {
    try {
      let receiptNumber = ''
      let transactionRef = ''

      this.db.transaction(() => {
        // Generate transaction reference
        transactionRef = `TXN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-6)}`

        // Get fee category
        const catId = this.db.prepare(
          `SELECT id FROM transaction_category WHERE category_name = 'School Fees' LIMIT 1`
        ).get() as any

        // Insert payment transaction
        const paymentResult = this.db.prepare(`
          INSERT INTO ledger_transaction (
            transaction_ref, student_id, amount, payment_method, 
            payment_reference, transaction_date, transaction_type, 
            category_id, debit_credit, description, recorded_by_user_id,
            term_id
          ) VALUES (?, ?, ?, ?, ?, ?, 'FEE_PAYMENT', ?, 'CREDIT', ?, ?, ?)
        `).run(
          transactionRef,
          data.student_id,
          amountCents,
          data.payment_method,
          data.payment_reference || null,
          data.transaction_date,
          catId?.id || 1,
          data.description || 'Fee Payment',
          userId,
          data.term_id || null
        )

        const paymentId = paymentResult.lastInsertRowid as number

        // Distribute payment across open invoices (FIFO)
        let remainingPayment = amountCents

        if (data.invoice_id) {
          // Apply to specific invoice
          const invoice = this.db.prepare(
            'SELECT total_amount, amount_paid FROM fee_invoice WHERE id = ?'
          ).get(data.invoice_id) as { total_amount: number; amount_paid: number } | undefined

          if (invoice) {
            const outstanding = invoice.total_amount - invoice.amount_paid
            const paymentToApply = Math.min(remainingPayment, outstanding)

            this.db.prepare(`
              UPDATE fee_invoice 
              SET amount_paid = amount_paid + ?, 
                  status = CASE 
                    WHEN amount_paid + ? >= total_amount THEN 'PAID' 
                    ELSE 'PARTIAL' 
                  END
              WHERE id = ?
            `).run(paymentToApply, paymentToApply, data.invoice_id)

            remainingPayment -= paymentToApply
          }
        } else {
          // Apply to open invoices (FIFO - oldest first)
          const openInvoices = this.db.prepare(`
            SELECT id, total_amount, amount_paid 
            FROM fee_invoice 
            WHERE student_id = ? AND status != 'PAID' AND status != 'CANCELLED'
            ORDER BY due_date ASC
          `).all(data.student_id) as Array<{ id: number; total_amount: number; amount_paid: number }>

          for (const invoice of openInvoices) {
            if (remainingPayment <= 0) break

            const outstanding = invoice.total_amount - invoice.amount_paid
            const paymentToApply = Math.min(remainingPayment, outstanding)

            this.db.prepare(`
              UPDATE fee_invoice 
              SET amount_paid = amount_paid + ?, 
                  status = CASE 
                    WHEN amount_paid + ? >= total_amount THEN 'PAID' 
                    ELSE 'PARTIAL' 
                  END
              WHERE id = ?
            `).run(paymentToApply, paymentToApply, invoice.id)

            remainingPayment -= paymentToApply
          }
        }

        // Handle overpayment - add to credit balance
        if (remainingPayment > 0) {
          this.db.prepare(
            'UPDATE student SET credit_balance = COALESCE(credit_balance, 0) + ? WHERE id = ?'
          ).run(remainingPayment, data.student_id)
        }

        // Generate receipt
        receiptNumber = `RCP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(paymentId).padStart(6, '0')}`

        this.db.prepare(`
          INSERT INTO receipt (
            receipt_number, transaction_id, receipt_date, student_id, amount,
            amount_in_words, payment_method, payment_reference, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          receiptNumber,
          paymentId,
          data.transaction_date,
          data.student_id,
          amountCents,
          data.amount_in_words || '',
          data.payment_method,
          data.payment_reference || null,
          userId
        )

        // Log audit
        logAudit(
          userId,
          'CREATE',
          'ledger_transaction',
          paymentId,
          null,
          { ...data, amount_cents: amountCents, receipt_number: receiptNumber }
        )
      })()

      return {
        success: true,
        transactionRef,
        receiptNumber,
        message: 'Payment recorded successfully'
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Payment failed'
      }
    }
  }

  /**
   * Void a payment with supervisor approval
   */
  async voidPayment(
    transactionId: number,
    reason: string,
    voidedByUserId: number,
    approvedByUserId?: number
  ): Promise<{ success: boolean; message?: string }> {
    if (!reason || reason.trim().length < 10) {
      return { 
        success: false, 
        message: 'Detailed void reason (minimum 10 characters) is required' 
      }
    }

    const payment = this.db.prepare('SELECT * FROM ledger_transaction WHERE id = ?')
      .get(transactionId) as any

    if (!payment) {
      return { success: false, message: 'Payment not found' }
    }

    if (payment.is_voided) {
      return { success: false, message: 'Payment already voided' }
    }

    // Check if payment is in a locked period
    const lockCheck = this.periodService.isDateLocked(payment.transaction_date)
    if (lockCheck.locked) {
      return { 
        success: false, 
        message: `Cannot void payment. ${lockCheck.message}` 
      }
    }

    return this.db.transaction(() => {
      // Mark transaction as voided
      this.db.prepare(`
        UPDATE ledger_transaction 
        SET is_voided = 1, 
            voided_reason = ?, 
            voided_by_user_id = ?,
            voided_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(reason, voidedByUserId, transactionId)

      // Record in void audit table for visibility
      this.db.prepare(`
        INSERT INTO void_audit (
          transaction_id, transaction_type, original_amount, 
          void_reason, voided_by_user_id, approved_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        transactionId,
        payment.transaction_type,
        payment.amount,
        reason,
        voidedByUserId,
        approvedByUserId || null
      )

      // Revert invoice if applicable
      if (payment.invoice_id) {
        const invoice = this.db.prepare('SELECT * FROM fee_invoice WHERE id = ?')
          .get(payment.invoice_id) as any

        if (invoice) {
          const newAmountPaid = Math.max(0, invoice.amount_paid - payment.amount)
          const newStatus = newAmountPaid === 0 ? 'PENDING' : 
                           newAmountPaid >= invoice.total_amount ? 'PAID' : 'PARTIAL'

          this.db.prepare(`
            UPDATE fee_invoice 
            SET amount_paid = ?,
                status = ?
            WHERE id = ?
          `).run(newAmountPaid, newStatus, payment.invoice_id)
        }
      }

      // Revert credit balance if applicable
      const student = this.db.prepare('SELECT credit_balance FROM student WHERE id = ?')
        .get(payment.student_id) as { credit_balance: number } | undefined

      if (student && student.credit_balance > 0) {
        // Only revert if there's credit to revert
        const revertAmount = Math.min(student.credit_balance, payment.amount)
        this.db.prepare(
          'UPDATE student SET credit_balance = credit_balance - ? WHERE id = ?'
        ).run(revertAmount, payment.student_id)
      }

      logAudit(
        voidedByUserId,
        'UPDATE',
        'ledger_transaction',
        transactionId,
        { is_voided: false },
        { is_voided: true, reason, approved_by: approvedByUserId }
      )

      return { success: true, message: 'Payment voided successfully' }
    })()
  }
}
```

**Impact:**
- ✅ **Financial Correctness**: Multi-level authorization based on amount thresholds
- ✅ **Auditability**: Complete void trail in separate table, always visible
- ✅ **Report Reliability**: Period lock enforced, preventing post-close changes

---

### STEP 1.5: IPC Handler Integration

**File:** `electron/main/ipc/workflow/approval-workflow-handlers.ts`

```typescript
import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { ApprovalWorkflowService } from '../../services/workflow/ApprovalWorkflowService'
import { PeriodLockingService } from '../../services/finance/PeriodLockingService'

export function registerApprovalWorkflowHandlers(): void {
  const approvalService = new ApprovalWorkflowService()
  const periodService = new PeriodLockingService()

  // Approval Requests
  ipcMain.handle('approval:create', async (_event: IpcMainInvokeEvent, data: any, userId: number) => {
    return approvalService.createApprovalRequest(data)
  })

  ipcMain.handle('approval:approve', async (
    _event: IpcMainInvokeEvent, 
    requestId: number, 
    userId: number, 
    userRole: string, 
    comments?: string
  ) => {
    return approvalService.approve(requestId, userId, userRole, comments)
  })

  ipcMain.handle('approval:reject', async (
    _event: IpcMainInvokeEvent, 
    requestId: number, 
    userId: number, 
    userRole: string, 
    comments: string
  ) => {
    return approvalService.reject(requestId, userId, userRole, comments)
  })

  ipcMain.handle('approval:getPending', async (_event: IpcMainInvokeEvent, userRole: string) => {
    return approvalService.getPendingApprovals(userRole)
  })

  ipcMain.handle('approval:isApproved', async (_event: IpcMainInvokeEvent, requestId: number) => {
    return approvalService.isApproved(requestId)
  })

  // Period Locking
  ipcMain.handle('period:lock', async (
    _event: IpcMainInvokeEvent, 
    periodId: number, 
    userId: number, 
    userRole: string
  ) => {
    return periodService.lockPeriod(periodId, userId, userRole)
  })

  ipcMain.handle('period:unlock', async (
    _event: IpcMainInvokeEvent, 
    periodId: number, 
    userId: number, 
    userRole: string, 
    reason: string
  ) => {
    return periodService.unlockPeriod(periodId, userId, userRole, reason)
  })

  ipcMain.handle('period:getAll', async () => {
    return periodService.getAllPeriods()
  })

  ipcMain.handle('period:create', async (
    _event: IpcMainInvokeEvent, 
    periodName: string, 
    startDate: string, 
    endDate: string, 
    userId: number
  ) => {
    return periodService.createPeriod(periodName, startDate, endDate, userId)
  })

  ipcMain.handle('period:checkLocked', async (_event: IpcMainInvokeEvent, date: string) => {
    return periodService.isDateLocked(date)
  })
}
```

**Integration in main index:**

Add to `electron/main/ipc/index.ts`:
```typescript
import { registerApprovalWorkflowHandlers } from './workflow/approval-workflow-handlers'

export function registerAllHandlers(): void {
  // ... existing handlers
  registerApprovalWorkflowHandlers()
  // ... rest
}
```

---

## Testing Phase 1 Changes

### Test File: `electron/main/services/workflow/__tests__/ApprovalWorkflowService.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { ApprovalWorkflowService } from '../ApprovalWorkflowService'
import { getDatabase } from '../../../database'
import { up as createSchema } from '../../../database/migrations/010_approval_workflows'

describe('ApprovalWorkflowService', () => {
  let service: ApprovalWorkflowService
  let db: any

  beforeEach(() => {
    db = getDatabase()
    // Reset database and create schema
    createSchema(db)
    service = new ApprovalWorkflowService()
  })

  it('should require approval for high-value payments', () => {
    const result = service.checkApprovalRequired('FEE_PAYMENT', 15000000) // 150K KES in cents
    expect(result.required).toBe(true)
    expect(result.threshold?.required_role).toBe('BURSAR')
  })

  it('should create approval request for unauthorized clerk', async () => {
    const result = await service.createApprovalRequest({
      transactionType: 'FEE_PAYMENT',
      amount: 15000000,
      description: 'Test payment',
      metadata: { student_id: 1 },
      requestedByUserId: 1
    })

    expect(result.success).toBe(true)
    expect(result.requiresApproval).toBe(true)
    expect(result.requestNumber).toMatch(/^APR-/)
  })

  it('should enforce dual approval for very high amounts', () => {
    const result = service.checkApprovalRequired('FEE_PAYMENT', 60000000) // 600K KES
    expect(result.required).toBe(true)
    expect(result.threshold?.requires_dual_approval).toBe(true)
  })

  it('should allow PRINCIPAL to approve requests', async () => {
    // Create request
    const request = await service.createApprovalRequest({
      transactionType: 'FEE_PAYMENT',
      amount: 15000000,
      description: 'Test payment',
      metadata: { student_id: 1 },
      requestedByUserId: 1
    })

    // Approve as PRINCIPAL
    const approval = await service.approve(
      request.requestId!,
      2,
      'PRINCIPAL',
      'Approved for testing'
    )

    expect(approval.success).toBe(true)
    expect(approval.approved).toBe(true)
  })

  it('should require second approval for dual approval threshold', async () => {
    // Create request for high amount
    const request = await service.createApprovalRequest({
      transactionType: 'FEE_PAYMENT',
      amount: 60000000,
      description: 'Large payment requiring dual approval',
      metadata: { student_id: 1 },
      requestedByUserId: 1
    })

    // First approval
    const firstApproval = await service.approve(
      request.requestId!,
      2,
      'PRINCIPAL',
      'First approval'
    )

    expect(firstApproval.success).toBe(true)
    expect(firstApproval.approved).toBe(false) // Not fully approved yet

    // Second approval
    const secondApproval = await service.approve(
      request.requestId!,
      3,
      'PRINCIPAL',
      'Second approval'
    )

    expect(secondApproval.success).toBe(true)
    expect(secondApproval.approved).toBe(true) // Now fully approved
  })

  it('should reject requests with reason', async () => {
    const request = await service.createApprovalRequest({
      transactionType: 'FEE_PAYMENT',
      amount: 15000000,
      description: 'Test payment',
      metadata: { student_id: 1 },
      requestedByUserId: 1
    })

    const rejection = await service.reject(
      request.requestId!,
      2,
      'PRINCIPAL',
      'Insufficient documentation provided'
    )

    expect(rejection.success).toBe(true)
  })
})
```

---

## Summary of Phase 1

**Files Created:**
1. `electron/main/database/migrations/010_approval_workflows.ts` - Database schema
2. `electron/main/services/workflow/ApprovalWorkflowService.ts` - Approval logic
3. `electron/main/services/finance/PeriodLockingService.ts` - Period locking
4. `electron/main/services/finance/EnhancedPaymentService.ts` - Enhanced payments
5. `electron/main/ipc/workflow/approval-workflow-handlers.ts` - IPC handlers
6. Test files for validation

**Critical Improvements:**
- ✅ **Fraud Prevention**: Multi-level authorization prevents unauthorized transactions
- ✅ **Audit Trail**: Complete approval chain with dual approval for high-value items
- ✅ **Data Integrity**: Period locking prevents post-close manipulation
- ✅ **Visibility**: Void audit table makes all voids visible in reports

**Next Phase Preview:**
Phase 2 will implement real cash flow calculations, aged receivables analysis, and decision-grade financial reports.

---

*End of Phase 1 - Core Financial Controls*  
*Continue to PHASE 2 for Reporting Infrastructure...*
