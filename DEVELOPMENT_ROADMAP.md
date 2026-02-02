# Mwingi School ERP - Comprehensive Development Roadmap

## Strategic Overview

This roadmap transforms the current prototype into a production-ready, professional-grade school financial management system. The plan is divided into **6 development phases** spanning approximately **24-32 weeks**, with each phase building upon the previous one.

---

## Architecture Principles

### SOLID Principles Implementation

| Principle | Application Strategy |
|-----------|---------------------|
| **S**ingle Responsibility | Each IPC handler, service, and component handles ONE concern only |
| **O**pen/Closed | Use plugin architecture for reports, export formats, payment gateways |
| **L**iskov Substitution | All payment methods implement a common `PaymentProvider` interface |
| **I**nterface Segregation | Separate interfaces for `Readable`, `Writable`, `Exportable` operations |
| **D**ependency Inversion | Services depend on abstractions, not concrete database implementations |

### Database Engineering Standards

1. **Normalized Schema** (3NF minimum)
2. **Referential Integrity** via foreign keys
3. **Soft Deletes** for audit compliance
4. **Temporal Tables** for historical tracking
5. **Indexed Queries** for performance
6. **Migration-Based Changes** only

### React Best Practices

1. **Component Composition** over inheritance
2. **Custom Hooks** for shared logic
3. **Context + Zustand** for state management
4. **React Query/TanStack Query** for server state
5. **Suspense Boundaries** for loading states
6. **Error Boundaries** for graceful failures

### Electron Best Practices

1. **Process Isolation** - Main/Renderer separation
2. **Context Bridge** for secure IPC
3. **Native Menus** for keyboard shortcuts
4. **Auto-Updates** via electron-updater
5. **Crash Reporting** integration
6. **Security Hardening** (CSP, nodeIntegration: false)

---

# Phase 1: Foundation & Architecture Refactoring
**Duration: 4-5 weeks**
**Goal: Establish robust architecture patterns and fix existing inconsistencies**

---

## 1.1 Service Layer Architecture

### Objective
Introduce a proper service layer that separates business logic from IPC handlers and database operations.

### Directory Structure

```
electron/
├── main/
│   ├── services/                    # Business logic layer
│   │   ├── base/
│   │   │   ├── BaseService.ts       # Abstract base service
│   │   │   ├── ServiceContainer.ts  # Dependency injection container
│   │   │   └── interfaces/
│   │   │       ├── IReadable.ts
│   │   │       ├── IWritable.ts
│   │   │       ├── IExportable.ts
│   │   │       └── IAuditable.ts
│   │   ├── finance/
│   │   │   ├── PaymentService.ts
│   │   │   ├── InvoiceService.ts
│   │   │   ├── TransactionService.ts
│   │   │   └── BudgetService.ts
│   │   ├── academic/
│   │   │   ├── StudentService.ts
│   │   │   ├── EnrollmentService.ts
│   │   │   └── AttendanceService.ts
│   │   ├── reports/
│   │   │   ├── ReportEngine.ts
│   │   │   ├── generators/
│   │   │   │   ├── FinancialReportGenerator.ts
│   │   │   │   ├── StudentReportGenerator.ts
│   │   │   │   └── AuditReportGenerator.ts
│   │   │   └── exporters/
│   │   │       ├── PDFExporter.ts
│   │   │       ├── ExcelExporter.ts
│   │   │       └── CSVExporter.ts
│   │   └── notifications/
│   │       ├── NotificationService.ts
│   │       ├── providers/
│   │       │   ├── SMSProvider.ts
│   │       │   └── EmailProvider.ts
│   │       └── templates/
│   │           └── MessageTemplates.ts
│   ├── repositories/                # Data access layer
│   │   ├── base/
│   │   │   └── BaseRepository.ts
│   │   ├── StudentRepository.ts
│   │   ├── TransactionRepository.ts
│   │   ├── InvoiceRepository.ts
│   │   └── ReportRepository.ts
│   ├── database/
│   │   ├── migrations/
│   │   ├── seeders/
│   │   └── DatabaseManager.ts
│   └── ipc/                         # Thin IPC layer (delegates to services)
│       ├── handlers/
│       └── validators/
```

### Implementation Details

#### Base Service Interface

```typescript name=electron/main/services/base/interfaces/IService.ts
/**
 * Base service interface following Interface Segregation Principle.
 * Services implement only the interfaces they need.
 */

export interface IReadable<T, F = Record<string, unknown>> {
  findById(id: number): Promise<T | null>
  findAll(filters?: F): Promise<T[]>
  exists(id: number): Promise<boolean>
}

export interface IWritable<T, C, U = Partial<C>> {
  create(data: C, userId: number): Promise<{ success: boolean; id: number; data?: T }>
  update(id: number, data: U, userId: number): Promise<{ success: boolean; data?: T }>
  delete(id: number, userId: number): Promise<{ success: boolean }>
}

export interface ISoftDeletable {
  softDelete(id: number, userId: number): Promise<{ success: boolean }>
  restore(id: number, userId: number): Promise<{ success: boolean }>
  findDeleted(): Promise<unknown[]>
}

export interface IAuditable {
  getAuditTrail(recordId: number): Promise<AuditEntry[]>
}

export interface IExportable<T> {
  exportToPDF(data: T[], options: ExportOptions): Promise<Buffer>
  exportToExcel(data: T[], options: ExportOptions): Promise<Buffer>
  exportToCSV(data: T[], options: ExportOptions): Promise<string>
}

export interface IPeriodLockable {
  lockPeriod(periodId: number, userId: number): Promise<{ success: boolean }>
  unlockPeriod(periodId: number, userId: number): Promise<{ success: boolean }>
  isPeriodLocked(periodId: number): Promise<boolean>
}

export interface AuditEntry {
  id: number
  action_type: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  user_id: number
  user_name: string
  created_at: string
}

export interface ExportOptions {
  title?: string
  dateRange?: { start: string; end: string }
  columns?: string[]
  orientation?: 'portrait' | 'landscape'
  includeHeaders?: boolean
}
```

#### Abstract Base Service

```typescript name=electron/main/services/base/BaseService.ts
import { Database } from 'better-sqlite3'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { IReadable, IWritable, IAuditable, AuditEntry } from './interfaces/IService'

/**
 * Abstract base service implementing common CRUD operations.
 * Follows Single Responsibility: Only handles data access patterns.
 * Follows Open/Closed: Extended by specific services without modification.
 */
export abstract class BaseService<T, C, U = Partial<C>, F = Record<string, unknown>>
  implements IReadable<T, F>, IWritable<T, C, U>, IAuditable {
  
  protected db: Database
  protected abstract tableName: string
  protected abstract primaryKey: string

  constructor() {
    this.db = getDatabase()
  }

  /**
   * Template method for building SELECT queries.
   * Subclasses override to add JOINs, computed columns, etc.
   */
  protected abstract buildSelectQuery(): string

  /**
   * Template method for mapping database rows to domain objects.
   */
  protected abstract mapRowToEntity(row: unknown): T

  /**
   * Template method for validating create data.
   * Returns validation errors or null if valid.
   */
  protected abstract validateCreate(data: C): string[] | null

  /**
   * Template method for validating update data.
   */
  protected abstract validateUpdate(id: number, data: U): Promise<string[] | null>

  async findById(id: number): Promise<T | null> {
    const query = `${this.buildSelectQuery()} WHERE ${this.tableName}.${this.primaryKey} = ?`
    const row = this.db.prepare(query).get(id)
    return row ? this.mapRowToEntity(row) : null
  }

  async findAll(filters?: F): Promise<T[]> {
    const { query, params } = this.buildFilteredQuery(filters)
    const rows = this.db.prepare(query).all(...params)
    return rows.map(row => this.mapRowToEntity(row))
  }

  async exists(id: number): Promise<boolean> {
    const result = this.db.prepare(
      `SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = ? LIMIT 1`
    ).get(id)
    return !!result
  }

  async create(data: C, userId: number): Promise<{ success: boolean; id: number; errors?: string[] }> {
    const errors = this.validateCreate(data)
    if (errors) {
      return { success: false, id: 0, errors }
    }

    try {
      const result = this.executeCreate(data)
      const id = result.lastInsertRowid as number

      logAudit(userId, 'CREATE', this.tableName, id, null, data)

      return { success: true, id }
    } catch (error) {
      return { 
        success: false, 
        id: 0, 
        errors: [error instanceof Error ? error.message : 'Unknown error'] 
      }
    }
  }

  async update(id: number, data: U, userId: number): Promise<{ success: boolean; errors?: string[] }> {
    const existing = await this.findById(id)
    if (!existing) {
      return { success: false, errors: ['Record not found'] }
    }

    const errors = await this.validateUpdate(id, data)
    if (errors) {
      return { success: false, errors }
    }

    try {
      this.executeUpdate(id, data)
      logAudit(userId, 'UPDATE', this.tableName, id, existing, data)
      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        errors: [error instanceof Error ? error.message : 'Unknown error'] 
      }
    }
  }

  async delete(id: number, userId: number): Promise<{ success: boolean; errors?: string[] }> {
    const existing = await this.findById(id)
    if (!existing) {
      return { success: false, errors: ['Record not found'] }
    }

    try {
      this.db.prepare(`DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`).run(id)
      logAudit(userId, 'DELETE', this.tableName, id, existing, null)
      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        errors: [error instanceof Error ? error.message : 'Unknown error'] 
      }
    }
  }

  async getAuditTrail(recordId: number): Promise<AuditEntry[]> {
    return this.db.prepare(`
      SELECT a.*, u.full_name as user_name
      FROM audit_log a
      LEFT JOIN user u ON a.user_id = u.id
      WHERE a.table_name = ? AND a.record_id = ?
      ORDER BY a.created_at DESC
    `).all(this.tableName, recordId) as AuditEntry[]
  }

  /**
   * Build filtered query with dynamic WHERE clauses.
   * Override in subclasses for custom filtering logic.
   */
  protected buildFilteredQuery(filters?: F): { query: string; params: unknown[] } {
    const baseQuery = this.buildSelectQuery()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters) {
      this.applyFilters(filters, conditions, params)
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    return { query: `${baseQuery}${whereClause}`, params }
  }

  /**
   * Override to add filter conditions.
   */
  protected applyFilters(filters: F, conditions: string[], params: unknown[]): void {
    // Default: no filters. Override in subclasses.
  }

  /**
   * Execute create operation. Override for custom insert logic.
   */
  protected abstract executeCreate(data: C): { lastInsertRowid: number | bigint }

  /**
   * Execute update operation. Override for custom update logic.
   */
  protected abstract executeUpdate(id: number, data: U): void
}
```

#### Dependency Injection Container

```typescript name=electron/main/services/base/ServiceContainer.ts
/**
 * Simple dependency injection container.
 * Follows Dependency Inversion Principle: High-level modules depend on abstractions.
 */

type ServiceFactory<T> = () => T
type ServiceInstance = unknown

class ServiceContainer {
  private static instance: ServiceContainer
  private services: Map<string, ServiceInstance> = new Map()
  private factories: Map<string, ServiceFactory<unknown>> = new Map()

  private constructor() {}

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer()
    }
    return ServiceContainer.instance
  }

  /**
   * Register a service factory (lazy instantiation).
   */
  register<T>(name: string, factory: ServiceFactory<T>): void {
    this.factories.set(name, factory)
  }

  /**
   * Register a singleton instance.
   */
  registerInstance<T>(name: string, instance: T): void {
    this.services.set(name, instance)
  }

  /**
   * Resolve a service by name.
   */
  resolve<T>(name: string): T {
    // Check for existing instance
    if (this.services.has(name)) {
      return this.services.get(name) as T
    }

    // Check for factory
    const factory = this.factories.get(name)
    if (factory) {
      const instance = factory() as T
      this.services.set(name, instance) // Cache as singleton
      return instance
    }

    throw new Error(`Service '${name}' not registered`)
  }

  /**
   * Clear all services (useful for testing).
   */
  clear(): void {
    this.services.clear()
    this.factories.clear()
  }
}

export const container = ServiceContainer.getInstance()

// Service registration helper
export function registerServices(): void {
  // Import services lazily to avoid circular dependencies
  container.register('StudentService', () => {
    const { StudentService } = require('../academic/StudentService')
    return new StudentService()
  })

  container.register('PaymentService', () => {
    const { PaymentService } = require('../finance/PaymentService')
    return new PaymentService()
  })

  container.register('InvoiceService', () => {
    const { InvoiceService } = require('../finance/InvoiceService')
    return new InvoiceService()
  })

  container.register('ReportEngine', () => {
    const { ReportEngine } = require('../reports/ReportEngine')
    return new ReportEngine()
  })

  container.register('NotificationService', () => {
    const { NotificationService } = require('../notifications/NotificationService')
    return new NotificationService()
  })
}
```

---

## 1.2 Database Schema Enhancements

### Objective
Add missing tables, implement soft deletes, period locking, and proper indexing.

### New Migration: Enhanced Schema

```typescript name=electron/main/database/migrations/002_enhanced_schema.ts
/**
 * Migration: Enhanced Schema for Production Readiness
 * - Adds soft delete columns
 * - Adds period locking
 * - Adds budget tables
 * - Adds bank reconciliation tables
 * - Adds approval workflow tables
 * - Creates proper indexes
 */

export function getEnhancedSchema(): string {
  return `
    -- ================================================
    -- SOFT DELETE SUPPORT
    -- ================================================
    
    -- Add deleted_at columns to existing tables
    ALTER TABLE student ADD COLUMN deleted_at DATETIME DEFAULT NULL;
    ALTER TABLE staff ADD COLUMN deleted_at DATETIME DEFAULT NULL;
    ALTER TABLE fee_invoice ADD COLUMN deleted_at DATETIME DEFAULT NULL;
    ALTER TABLE ledger_transaction ADD COLUMN deleted_at DATETIME DEFAULT NULL;

    -- ================================================
    -- PERIOD LOCKING (Financial Period Closure)
    -- ================================================

    CREATE TABLE IF NOT EXISTS financial_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_name TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK(period_type IN ('MONTHLY', 'QUARTERLY', 'YEARLY')),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      academic_year_id INTEGER,
      term_id INTEGER,
      is_locked BOOLEAN DEFAULT 0,
      locked_at DATETIME,
      locked_by_user_id INTEGER,
      unlock_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (locked_by_user_id) REFERENCES user(id)
    );

    -- ================================================
    -- BUDGETING MODULE
    -- ================================================

    CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_name TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL,
      term_id INTEGER,
      status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ACTIVE', 'CLOSED')),
      total_amount INTEGER DEFAULT 0,
      notes TEXT,
      created_by_user_id INTEGER NOT NULL,
      approved_by_user_id INTEGER,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME DEFAULT NULL,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id),
      FOREIGN KEY (approved_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS budget_line_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      budgeted_amount INTEGER NOT NULL DEFAULT 0,
      actual_amount INTEGER DEFAULT 0,
      variance INTEGER GENERATED ALWAYS AS (budgeted_amount - actual_amount) STORED,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (budget_id) REFERENCES budget(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES transaction_category(id)
    );

    CREATE TABLE IF NOT EXISTS budget_revision (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL,
      revision_number INTEGER NOT NULL,
      previous_amount INTEGER NOT NULL,
      new_amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      revised_by_user_id INTEGER NOT NULL,
      approved_by_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (budget_id) REFERENCES budget(id),
      FOREIGN KEY (revised_by_user_id) REFERENCES user(id),
      FOREIGN KEY (approved_by_user_id) REFERENCES user(id)
    );

    -- ================================================
    -- BANK RECONCILIATION
    -- ================================================

    CREATE TABLE IF NOT EXISTS bank_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      branch TEXT,
      swift_code TEXT,
      currency TEXT DEFAULT 'KES',
      opening_balance INTEGER DEFAULT 0,
      current_balance INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bank_statement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_account_id INTEGER NOT NULL,
      statement_date DATE NOT NULL,
      opening_balance INTEGER NOT NULL,
      closing_balance INTEGER NOT NULL,
      statement_reference TEXT,
      file_path TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RECONCILED', 'PARTIAL')),
      reconciled_by_user_id INTEGER,
      reconciled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES bank_account(id),
      FOREIGN KEY (reconciled_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS bank_statement_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_statement_id INTEGER NOT NULL,
      transaction_date DATE NOT NULL,
      description TEXT NOT NULL,
      reference TEXT,
      debit_amount INTEGER DEFAULT 0,
      credit_amount INTEGER DEFAULT 0,
      running_balance INTEGER,
      is_matched BOOLEAN DEFAULT 0,
      matched_transaction_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_statement_id) REFERENCES bank_statement(id) ON DELETE CASCADE,
      FOREIGN KEY (matched_transaction_id) REFERENCES ledger_transaction(id)
    );

    CREATE TABLE IF NOT EXISTS reconciliation_adjustment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_statement_id INTEGER NOT NULL,
      adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('BANK_CHARGE', 'INTEREST', 'ERROR', 'TIMING', 'OTHER')),
      amount INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_statement_id) REFERENCES bank_statement(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    -- ================================================
    -- APPROVAL WORKFLOWS
    -- ================================================

    CREATE TABLE IF NOT EXISTS approval_workflow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_name TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL, -- 'EXPENSE', 'BUDGET', 'INVOICE_VOID', 'REFUND'
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS approval_step (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      step_order INTEGER NOT NULL,
      approver_role TEXT NOT NULL,
      min_amount INTEGER DEFAULT 0,
      max_amount INTEGER,
      is_mandatory BOOLEAN DEFAULT 1,
      FOREIGN KEY (workflow_id) REFERENCES approval_workflow(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS approval_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      current_step INTEGER DEFAULT 1,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
      requested_by_user_id INTEGER NOT NULL,
      final_approver_user_id INTEGER,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workflow_id) REFERENCES approval_workflow(id),
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id),
      FOREIGN KEY (final_approver_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS approval_action (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      step_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('APPROVED', 'REJECTED', 'RETURNED')),
      comments TEXT,
      acted_by_user_id INTEGER NOT NULL,
      acted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES approval_request(id),
      FOREIGN KEY (step_id) REFERENCES approval_step(id),
      FOREIGN KEY (acted_by_user_id) REFERENCES user(id)
    );

    -- ================================================
    -- FIXED ASSETS REGISTER
    -- ================================================

    CREATE TABLE IF NOT EXISTS asset_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL UNIQUE,
      depreciation_method TEXT DEFAULT 'STRAIGHT_LINE' CHECK(depreciation_method IN ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'NONE')),
      useful_life_years INTEGER DEFAULT 5,
      depreciation_rate DECIMAL(5,2),
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS fixed_asset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_code TEXT NOT NULL UNIQUE,
      asset_name TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      description TEXT,
      serial_number TEXT,
      location TEXT,
      acquisition_date DATE NOT NULL,
      acquisition_cost INTEGER NOT NULL,
      current_value INTEGER NOT NULL,
      accumulated_depreciation INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'DISPOSED', 'WRITTEN_OFF', 'TRANSFERRED')),
      disposed_date DATE,
      disposed_value INTEGER,
      disposal_reason TEXT,
      supplier_id INTEGER,
      warranty_expiry DATE,
      last_depreciation_date DATE,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME DEFAULT NULL,
      FOREIGN KEY (category_id) REFERENCES asset_category(id),
      FOREIGN KEY (supplier_id) REFERENCES supplier(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS asset_depreciation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      depreciation_date DATE NOT NULL,
      amount INTEGER NOT NULL,
      book_value_before INTEGER NOT NULL,
      book_value_after INTEGER NOT NULL,
      financial_period_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES fixed_asset(id),
      FOREIGN KEY (financial_period_id) REFERENCES financial_period(id)
    );

    -- ================================================
    -- REPORT SCHEDULING
    -- ================================================

    CREATE TABLE IF NOT EXISTS scheduled_report (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      parameters TEXT, -- JSON string
      schedule_type TEXT NOT NULL CHECK(schedule_type IN ('DAILY', 'WEEKLY', 'MONTHLY', 'TERM_END', 'YEAR_END')),
      day_of_week INTEGER, -- 0-6 for weekly
      day_of_month INTEGER, -- 1-31 for monthly
      time_of_day TEXT DEFAULT '06:00',
      recipients TEXT, -- JSON array of email addresses
      export_format TEXT DEFAULT 'PDF' CHECK(export_format IN ('PDF', 'EXCEL', 'CSV')),
      is_active BOOLEAN DEFAULT 1,
      last_run_at DATETIME,
      next_run_at DATETIME,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS report_execution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheduled_report_id INTEGER NOT NULL,
      execution_time DATETIME NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILED', 'PARTIAL')),
      file_path TEXT,
      error_message TEXT,
      recipients_notified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scheduled_report_id) REFERENCES scheduled_report(id)
    );

    -- ================================================
    -- ATTENDANCE (Complete the missing frontend link)
    -- ================================================

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      attendance_date DATE NOT NULL,
      stream_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
      check_in_time TIME,
      check_out_time TIME,
      remarks TEXT,
      recorded_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, attendance_date),
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      FOREIGN KEY (recorded_by_user_id) REFERENCES user(id)
    );

    -- ================================================
    -- COMPREHENSIVE INDEXES
    -- ================================================

    -- Student indexes
    CREATE INDEX IF NOT EXISTS idx_student_active ON student(is_active) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_student_type ON student(student_type);
    CREATE INDEX IF NOT EXISTS idx_student_guardian_phone ON student(guardian_phone);

    -- Transaction indexes
    CREATE INDEX IF NOT EXISTS idx_transaction_type ON ledger_transaction(transaction_type);
    CREATE INDEX IF NOT EXISTS idx_transaction_category ON ledger_transaction(category_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_period ON ledger_transaction(term_id, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transaction_voided ON ledger_transaction(is_voided);

    -- Invoice indexes
    CREATE INDEX IF NOT EXISTS idx_invoice_status ON fee_invoice(status);
    CREATE INDEX IF NOT EXISTS idx_invoice_term ON fee_invoice(term_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_due_date ON fee_invoice(due_date);

    -- Budget indexes
    CREATE INDEX IF NOT EXISTS idx_budget_year ON budget(academic_year_id);
    CREATE INDEX IF NOT EXISTS idx_budget_status ON budget(status);
    CREATE INDEX IF NOT EXISTS idx_budget_line_category ON budget_line_item(category_id);

    -- Bank reconciliation indexes
    CREATE INDEX IF NOT EXISTS idx_bank_statement_date ON bank_statement(statement_date);
    CREATE INDEX IF NOT EXISTS idx_bank_line_matched ON bank_statement_line(is_matched);

    -- Approval indexes
    CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_request(status);
    CREATE INDEX IF NOT EXISTS idx_approval_entity ON approval_request(entity_type, entity_id);

    -- Asset indexes
    CREATE INDEX IF NOT EXISTS idx_asset_category ON fixed_asset(category_id);
    CREATE INDEX IF NOT EXISTS idx_asset_status ON fixed_asset(status);

    -- Attendance indexes
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id, attendance_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_stream ON attendance(stream_id, attendance_date);

    -- Audit log indexes
    CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name, record_id);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(created_at);
  `;
}
```

---

## 1.3 UI Component Library Standardization

### Objective
Create a consistent component library with proper TypeScript types and accessibility.

### Component Structure

```
src/
├── components/
│   ├── ui/                          # Base UI primitives
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.test.tsx
│   │   │   └── index.ts
│   │   ├── Input/
│   │   ├── Select/
│   │   ├── Modal/
│   │   ├── Table/
│   │   │   ├── DataTable.tsx        # Full-featured data table
│   │   │   ├── TableHeader.tsx
│   │   │   ├── TableBody.tsx
│   │   │   ├── TablePagination.tsx
│   │   │   ├── ColumnSelector.tsx
│   │   │   └── index.ts
│   │   ├── Card/
│   │   ├── Badge/
│   │   ├── Tooltip/
│   │   ├── Dropdown/
│   │   ├── DatePicker/
│   │   ├── DateRangePicker/
│   │   ├── Skeleton/
│   │   └── EmptyState/
│   ├── patterns/                    # Composite patterns
│   │   ├── SearchableSelect.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── CommandPalette.tsx
│   │   ├── PageHeader.tsx
│   │   ├── FormSection.tsx
│   │   └── StatCard.tsx
│   ├── feedback/                    # User feedback
│   │   ├── Toast/
│   │   ├── AlertBanner/
│   │   ├── LoadingOverlay/
│   │   └── ErrorBoundary/
│   └── layout/                      # Layout components
│       ├── Sidebar/
│       ├── TopBar/
│       ├── PageContainer/
│       └── SplitPane/
```

### Implementation: Enhanced Data Table

```tsx name=src/components/ui/Table/DataTable.tsx
import React, { useState, useMemo, useCallback } from 'react'
import { 
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, 
  Settings, Download, Filter, Search, X 
} from 'lucide-react'
import { Skeleton } from '../Skeleton'
import { EmptyState } from '../EmptyState'
import { Dropdown } from '../Dropdown'
import { Input } from '../Input'

/**
 * Professional data table component with:
 * - Column sorting (single and multi)
 * - Column visibility toggle
 * - Column resizing
 * - Pagination with configurable page sizes
 * - Row selection (single and multi)
 * - Search/filter
 * - Export capability
 * - Frozen header on scroll
 * - Loading states with skeletons
 * - Empty states
 * - Keyboard navigation
 */

export interface Column<T> {
  key: keyof T | string
  header: string
  width?: number
  minWidth?: number
  sortable?: boolean
  visible?: boolean
  frozen?: boolean
  align?: 'left' | 'center' | 'right'
  render?: (value: unknown, row: T, index: number) => React.ReactNode
  exportTransform?: (value: unknown, row: T) => string | number
}

export interface DataTableProps<T extends { id: number | string }> {
  data: T[]
  columns: Column<T>[]
  loading?: boolean
  emptyMessage?: string
  emptyIcon?: React.ReactNode
  
  // Selection
  selectable?: boolean
  selectedIds?: Set<number | string>
  onSelectionChange?: (selectedIds: Set<number | string>) => void
  
  // Pagination
  paginated?: boolean
  pageSize?: number
  pageSizeOptions?: number[]
  totalCount?: number
  currentPage?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void
  
  // Sorting
  sortable?: boolean
  defaultSort?: { key: string; direction: 'asc' | 'desc' }
  onSort?: (key: string, direction: 'asc' | 'desc') => void
  
  // Actions
  onRowClick?: (row: T) => void
  onExport?: (format: 'csv' | 'excel' | 'pdf') => void
  
  // Customization
  rowClassName?: (row: T, index: number) => string
  stickyHeader?: boolean
  compact?: boolean
  striped?: boolean
}

interface SortState {
  key: string
  direction: 'asc' | 'desc'
}

export function DataTable<T extends { id: number | string }>({
  data,
  columns: initialColumns,
  loading = false,
  emptyMessage = 'No data available',
  emptyIcon,
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
  paginated = true,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  totalCount,
  currentPage = 1,
  onPageChange,
  onPageSizeChange,
  sortable = true,
  defaultSort,
  onSort,
  onRowClick,
  onExport,
  rowClassName,
  stickyHeader = true,
  compact = false,
  striped = true,
}: DataTableProps<T>) {
  // State
  const [columns, setColumns] = useState(initialColumns.map(c => ({ ...c, visible: c.visible !== false })))
  const [sort, setSort] = useState<SortState | null>(defaultSort || null)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [internalPage, setInternalPage] = useState(currentPage)
  const [searchTerm, setSearchTerm] = useState('')
  const [showColumnSelector, setShowColumnSelector] = useState(false)

  const page = onPageChange ? currentPage : internalPage

  // Visible columns
  const visibleColumns = useMemo(() => columns.filter(c => c.visible), [columns])

  // Sorted and filtered data
  const processedData = useMemo(() => {
    let result = [...data]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(row => 
        visibleColumns.some(col => {
          const value = getNestedValue(row, col.key as string)
          return String(value).toLowerCase().includes(term)
        })
      )
    }

    // Sort
    if (sort && !onSort) {
      result.sort((a, b) => {
        const aVal = getNestedValue(a, sort.key)
        const bVal = getNestedValue(b, sort.key)
        
        if (aVal === bVal) return 0
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        
        const comparison = aVal < bVal ? -1 : 1
        return sort.direction === 'asc' ? comparison : -comparison
      })
    }

    return result
  }, [data, searchTerm, sort, visibleColumns, onSort])

  // Pagination
  const totalItems = totalCount ?? processedData.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const paginatedData = useMemo(() => {
    if (!paginated) return processedData
    const start = (page - 1) * pageSize
    return processedData.slice(start, start + pageSize)
  }, [processedData, paginated, page, pageSize])

  // Handlers
  const handleSort = useCallback((key: string) => {
    if (!sortable) return
    
    const newDirection = sort?.key === key && sort.direction === 'asc' ? 'desc' : 'asc'
    const newSort = { key, direction: newDirection as 'asc' | 'desc' }
    
    setSort(newSort)
    onSort?.(key, newDirection)
  }, [sort, sortable, onSort])

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return
    
    const allSelected = paginatedData.every(row => selectedIds.has(row.id))
    
    if (allSelected) {
      const newSelected = new Set(selectedIds)
      paginatedData.forEach(row => newSelected.delete(row.id))
      onSelectionChange(newSelected)
    } else {
      const newSelected = new Set(selectedIds)
      paginatedData.forEach(row => newSelected.add(row.id))
      onSelectionChange(newSelected)
    }
  }, [paginatedData, selectedIds, onSelectionChange])

  const handleSelectRow = useCallback((id: number | string) => {
    if (!onSelectionChange) return
    
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    onSelectionChange(newSelected)
  }, [selectedIds, onSelectionChange])

  const handlePageChange = useCallback((newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    if (onPageChange) {
      onPageChange(newPage)
    } else {
      setInternalPage(newPage)
    }
  }, [totalPages, onPageChange])

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize)
    onPageSizeChange?.(newSize)
    handlePageChange(1)
  }, [onPageSizeChange, handlePageChange])

  const toggleColumnVisibility = useCallback((key: string) => {
    setColumns(prev => prev.map(col => 
      (col.key as string) === key ? { ...col, visible: !col.visible } : col
    ))
  }, [])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, row: T) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (selectable) {
        handleSelectRow(row.id)
      }
      onRowClick?.(row)
    }
  }, [selectable, handleSelectRow, onRowClick])

  // Render
  if (loading) {
    return (
      <div className="w-full space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!data.length && !searchTerm) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyMessage}
        description="Try adjusting your filters or add new records."
      />
    )
  }

  const cellPadding = compact ? 'px-3 py-2' : 'px-4 py-4'
  const headerPadding = compact ? 'px-3 py-2' : 'px-4 py-3'

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
          <Input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Column selector */}
          <div className="relative">
            <button
              onClick={() => setShowColumnSelector(!showColumnSelector)}
              className="p-2 hover:bg-white/10 rounded-lg border border-white/10"
              title="Toggle columns"
            >
              <Settings className="w-4 h-4" />
            </button>
            
            {showColumnSelector && (
              <div className="absolute right-0 top-full mt-2 bg-secondary border border-white/10 rounded-lg shadow-xl z-50 min-w-[200px]">
                <div className="p-2 border-b border-white/10 text-xs font-bold text-foreground/60 uppercase">
                  Visible Columns
                </div>
                <div className="p-2 space-y-1">
                  {columns.map(col => (
                    <label key={col.key as string} className="flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={col.visible}
                        onChange={() => toggleColumnVisibility(col.key as string)}
                        className="rounded border-white/20"
                      />
                      <span className="text-sm">{col.header}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export */}
          {onExport && (
            <Dropdown
              trigger={
                <button className="p-2 hover:bg-white/10 rounded-lg border border-white/10" title="Export">
                  <Download className="w-4 h-4" />
                </button>
              }
              items={[
                { label: 'Export as CSV', onClick: () => onExport('csv') },
                { label: 'Export as Excel', onClick: () => onExport('excel') },
                { label: 'Export as PDF', onClick: () => onExport('pdf') },
              ]}
            />
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full">
          <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            <tr className="bg-secondary/80 backdrop-blur-sm border-b border-white/10">
              {selectable && (
                <th className={`${headerPadding} w-12`}>
                  <input
                    type="checkbox"
                    checked={paginatedData.length > 0 && paginatedData.every(row => selectedIds.has(row.id))}
                    onChange={handleSelectAll}
                    className="rounded border-white/20"
                    aria-label="Select all"
                  />
                </th>
              )}
              {visibleColumns.map(col => (
                <th
                  key={col.key as string}
                  className={`
                    ${headerPadding} text-left text-[11px] font-bold uppercase tracking-wider text-foreground/50
                    ${col.sortable !== false && sortable ? 'cursor-pointer hover:text-foreground/80 select-none' : ''}
                    ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}
                  `}
                  style={{ width: col.width, minWidth: col.minWidth }}
                  onClick={() => col.sortable !== false && handleSort(col.key as string)}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.header}</span>
                    {col.sortable !== false && sortable && sort?.key === col.key && (
                      sort.direction === 'asc' 
                        ? <ChevronUp className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} className="text-center py-12 text-foreground/40">
                  No results found for "{searchTerm}"
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => (
                <tr
                  key={row.id}
                  className={`
                    ${striped && index % 2 === 1 ? 'bg-white/[0.02]' : ''}
                    ${onRowClick ? 'cursor-pointer hover:bg-white/5' : ''}
                    ${selectedIds.has(row.id) ? 'bg-primary/10' : ''}
                    ${rowClassName?.(row, index) || ''}
                    transition-colors
                  `}
                  onClick={() => onRowClick?.(row)}
                  onKeyDown={(e) => handleKeyDown(e, row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                >
                  {selectable && (
                    <td className={`${cellPadding} w-12`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={(e) => {
                          e.stopPropagation()
                          handleSelectRow(row.id)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-white/20"
                        aria-label={`Select row ${row.id}`}
                      />
                    </td>
                  )}
                  {visibleColumns.map(col => {
                    const value = getNestedValue(row, col.key as string)
                    return (
                      <td
                        key={col.key as string}
                        className={`
                          ${cellPadding} text-sm
                          ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}
                        `}
                      >
                        {col.render ? col.render(value, row, index) : String(value ?? '-')}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {paginated && totalPages > 1 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-4 px-2">
          <div className="flex items-center gap-4 text-sm text-foreground/60">
            <span>
              Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalItems)} of {totalItems}
            </span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="bg-secondary border border-white/10 rounded-lg px-2 py-1 text-sm"
              aria-label="Page size"
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={size}>{size} per page</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(1)}
              disabled={page === 1}
              className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="First page"
            >
              <ChevronLeft className="w-4 h-4" />
              <ChevronLeft className="w-4 h-4 -ml-2" />
            </button>
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1">
              {generatePageNumbers(page, totalPages).map((pageNum, i) => (
                pageNum === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-2">...</span>
                ) : (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum as number)}
                    className={`
                      min-w-[32px] h-8 rounded-lg text-sm font-medium
                      ${page === pageNum 
                        ? 'bg-primary text-white' 
                        : 'hover:bg-white/10'
                      }
                    `}
                  >
                    {pageNum}
                  </button>
                )
              ))}
            </div>

            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
              className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={page === totalPages}
              className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Last page"
            >
              <ChevronRight className="w-4 h-4" />
              <ChevronRight className="w-4 h-4 -ml-2" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper functions
function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, obj)
}

function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  if (current <= 3) {
    return [1, 2, 3, 4, 5, '...', total]
  }

  if (current >= total - 2) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total]
  }

  return [1, '...', current - 1, current, current + 1, '...', total]
}

export default DataTable
```

---

## 1.4 Theme System & Design Tokens

### Objective
Implement a consistent theme system with light/dark mode support.

```typescript name=src/styles/theme.ts
/**
 * Design tokens for consistent theming.
 * These values are used by Tailwind and can be toggled for light/dark mode.
 */

export const lightTheme = {
  background: '0 0% 100%',
  foreground: '222 47% 11%',
  card: '0 0% 100%',
  cardForeground: '222 47% 11%',
  popover: '0 0% 100%',
  popoverForeground: '222 47% 11%',
  primary: '231 92% 62%',
  primaryForeground: '0 0% 100%',
  secondary: '220 14% 96%',
  secondaryForeground: '222 47% 11%',
  muted: '220 14% 96%',
  mutedForeground: '220 9% 46%',
  accent: '220 14% 96%',
  accentForeground: '222 47% 11%',
  destructive: '0 84% 60%',
  destructiveForeground: '0 0% 100%',
  border: '220 13% 91%',
  input: '220 13% 91%',
  ring: '231 92% 62%',
  success: '142 70% 45%',
  warning: '38 92% 50%',
}

export const darkTheme = {
  background: '222 47% 6%',
  foreground: '213 27% 84%',
  card: '222 47% 8%',
  cardForeground: '213 27% 84%',
  popover: '222 47% 8%',
  popoverForeground: '213 27% 84%',
  primary: '231 92% 62%',
  primaryForeground: '0 0% 100%',
  secondary: '217 32% 12%',
  secondaryForeground: '213 27% 84%',
  muted: '217 32% 12%',
  mutedForeground: '215 20% 45%',
  accent: '217 32% 17%',
  accentForeground: '213 27% 84%',
  destructive: '0 84% 60%',
  destructiveForeground: '0 0% 100%',
  border: '217 32% 17%',
  input: '217 32% 17%',
  ring: '231 92% 62%',
  success: '142 70% 45%',
  warning: '38 92% 50%',
}

export type ThemeColors = typeof lightTheme
```

```tsx name=src/contexts/ThemeContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react'
import { lightTheme, darkTheme, ThemeColors } from '../styles/theme'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  mode: ThemeMode
  resolvedMode: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
  colors: ThemeColors
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('theme-mode')
    return (stored as ThemeMode) || 'system'
  })

  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const updateResolvedMode = () => {
      if (mode === 'system') {
        setResolvedMode(mediaQuery.matches ? 'dark' : 'light')
      } else {
        setResolvedMode(mode)
      }
    }

    updateResolvedMode()
    mediaQuery.addEventListener('change', updateResolvedMode)

    return () => mediaQuery.removeEventListener('change', updateResolvedMode)
  }, [mode])

  useEffect(() => {
    localStorage.setItem('theme-mode', mode)
  }, [mode])

  useEffect(() => {
    const root = document.documentElement
    const colors = resolvedMode === 'dark' ? darkTheme : lightTheme

    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--${kebabCase(key)}`, value)
    })

    root.classList.remove('light', 'dark')
    root.classList.add(resolvedMode)
  }, [resolvedMode])

  const colors = resolvedMode === 'dark' ? darkTheme : lightTheme

  return (
    <ThemeContext.Provider value={{ mode, resolvedMode, setMode, colors }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

function kebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}
```

---

## 1.5 Keyboard Shortcuts System

### Objective
Implement a global keyboard shortcuts system for desktop-like UX.

```tsx name=src/hooks/useKeyboardShortcuts.ts
import { useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

interface Shortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  description: string
  scope?: string
}

// Global shortcuts registry
const shortcutRegistry = new Map<string, Shortcut>()

function getShortcutKey(shortcut: Omit<Shortcut, 'action' | 'description'>): string {
  const parts: string[] = []
  if (shortcut.ctrl) parts.push('ctrl')
  if (shortcut.shift) parts.push('shift')
  if (shortcut.alt) parts.push('alt')
  parts.push(shortcut.key.toLowerCase())
  return parts.join('+')
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const navigate = useNavigate()
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  useEffect(() => {
    // Register shortcuts
    shortcuts.forEach(shortcut => {
      const key = getShortcutKey(shortcut)
      shortcutRegistry.set(key, shortcut)
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Allow Escape to blur inputs
        if (event.key === 'Escape') {
          target.blur()
        }
        return
      }

      const pressedKey = getShortcutKey({
        key: event.key,
        ctrl: event.ctrlKey || event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey,
      })

      const shortcut = shortcutRegistry.get(pressedKey)
      if (shortcut) {
        event.preventDefault()
        shortcut.action()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      // Unregister shortcuts
      shortcuts.forEach(shortcut => {
        const key = getShortcutKey(shortcut)
        shortcutRegistry.delete(key)
      })
    }
  }, [shortcuts])
}

// Hook for global shortcuts that persist across pages
export function useGlobalShortcuts() {
  const navigate = useNavigate()

  const shortcuts: Shortcut[] = [
    {
      key: 'k',
      ctrl: true,
      description: 'Open command palette',
      action: () => {
        // Dispatch custom event for command palette
        window.dispatchEvent(new CustomEvent('open-command-palette'))
      },
    },
    {
      key: '/',
      description: 'Focus search',
      action: () => {
        const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement
        searchInput?.focus()
      },
    },
    {
      key: 'g',
      ctrl: true,
      description: 'Go to dashboard',
      action: () => navigate('/'),
    },
    {
      key: 's',
      ctrl: true,
      shift: true,
      description: 'Go to students',
      action: () => navigate('/students'),
    },
    {
      key: 'f',
      ctrl: true,
      shift: true,
      description: 'Go to fee payment',
      action: () => navigate('/fee-payment'),
    },
    {
      key: 'r',
      ctrl: true,
      shift: true,
      description: 'Go to reports',
      action: () => navigate('/reports'),
    },
    {
      key: 'n',
      ctrl: true,
      shift: true,
      description: 'New student',
      action: () => navigate('/students/new'),
    },
    {
      key: 'p',
      ctrl: true,
      description: 'Print current view',
      action: () => window.print(),
    },
    {
      key: 'Escape',
      description: 'Close modal/dialog',
      action: () => {
        window.dispatchEvent(new CustomEvent('close-modal'))
      },
    },
  ]

  useKeyboardShortcuts(shortcuts)

  return shortcuts
}

// Get all registered shortcuts for help display
export function getAllShortcuts(): Shortcut[] {
  return Array.from(shortcutRegistry.values())
}
```

### Command Palette Component

```tsx name=src/components/patterns/CommandPalette.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Search, Users, Wallet, FileText, Settings, 
  BarChart3, UserPlus, CreditCard, Home, X,
  ArrowRight, Command
} from 'lucide-react'
import { getAllShortcuts } from '../../hooks/useKeyboardShortcuts'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  shortcut?: string
  action: () => void
  category: string
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Define commands
  const commands: CommandItem[] = useMemo(() => [
    // Navigation
    { id: 'nav-dashboard', label: 'Go to Dashboard', icon: <Home className="w-4 h-4" />, shortcut: '⌘G', action: () => navigate('/'), category: 'Navigation' },
    { id: 'nav-students', label: 'Go to Students', icon: <Users className="w-4 h-4" />, shortcut: '⌘⇧S', action: () => navigate('/students'), category: 'Navigation' },
    { id: 'nav-fee-payment', label: 'Go to Fee Payment', icon: <CreditCard className="w-4 h-4" />, shortcut: '⌘⇧F', action: () => navigate('/fee-payment'), category: 'Navigation' },
    { id: 'nav-reports', label: 'Go to Reports', icon: <BarChart3 className="w-4 h-4" />, shortcut: '⌘⇧R', action: () => navigate('/reports'), category: 'Navigation' },
    { id: 'nav-invoices', label: 'Go to Invoices', icon: <FileText className="w-4 h-4" />, action: () => navigate('/invoices'), category: 'Navigation' },
    { id: 'nav-settings', label: 'Go to Settings', icon: <Settings className="w-4 h-4" />, action: () => navigate('/settings'), category: 'Navigation' },
    
    // Actions
    { id: 'action-new-student', label: 'Add New Student', icon: <UserPlus className="w-4 h-4" />, shortcut: '⌘⇧N', action: () => navigate('/students/new'), category: 'Actions' },
    { id: 'action-record-payment', label: 'Record Fee Payment', icon: <Wallet className="w-4 h-4" />, action: () => navigate('/fee-payment'), category: 'Actions' },
    { id: 'action-print', label: 'Print Current View', shortcut: '⌘P', action: () => window.print(), category: 'Actions' },
    
    // Reports
    { id: 'report-defaulters', label: 'View Fee Defaulters Report', icon: <FileText className="w-4 h-4" />, action: () => navigate('/reports?tab=defaulters'), category: 'Reports' },
    { id: 'report-collection', label: 'View Fee Collection Report', icon: <FileText className="w-4 h-4" />, action: () => navigate('/reports?tab=fee-collection'), category: 'Reports' },
    { id: 'report-financial', label: 'View Financial Summary', icon: <FileText className="w-4 h-4" />, action: () => navigate('/financial-reports'), category: 'Reports' },
  ], [navigate])

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!search.trim()) return commands
    
    const term = search.toLowerCase()
    return commands.filter(cmd => 
      cmd.label.toLowerCase().includes(term) ||
      cmd.description?.toLowerCase().includes(term) ||
      cmd.category.toLowerCase().includes(term)
    )
  }, [commands, search])

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    filteredCommands.forEach(cmd => {
      if (!groups[cmd.category]) groups[cmd.category] = []
      groups[cmd.category].push(cmd)
    })
    return groups
  }, [filteredCommands])

  // Flatten for keyboard navigation
  const flatCommands = useMemo(() => filteredCommands, [filteredCommands])

  // Listen for open event
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true)
      setSearch('')
      setSelectedIndex(0)
    }

    window.addEventListener('open-command-palette', handleOpen)
    return () => window.removeEventListener('open-command-palette', handleOpen)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => Math.min(prev + 1, flatCommands.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (flatCommands[selectedIndex]) {
            flatCommands[selectedIndex].action()
            setIsOpen(false)
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, flatCommands, selectedIndex])

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />
      
      {/* Dialog */}
      <div className="relative w-full max-w-xl bg-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <Search className="w-5 h-5 text-foreground/40" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-lg outline-none placeholder:text-foreground/30"
          />
          <div className="flex items-center gap-1 text-xs text-foreground/40">
            <kbd className="px-1.5 py-0.5 bg-secondary rounded">⌘</kbd>
            <kbd className="px-1.5 py-0.5 bg-secondary rounded">K</kbd>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-white/10 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {Object.keys(groupedCommands).length === 0 ? (
            <div className="p-8 text-center text-foreground/40">
              No commands found for "{search}"
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-2 text-[10px] font-bold text-foreground/40 uppercase tracking-widest bg-secondary/50">
                  {category}
                </div>
                {items.map((cmd, idx) => {
                  const globalIdx = flatCommands.indexOf(cmd)
                  const isSelected = globalIdx === selectedIndex
                  
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.action()
                        setIsOpen(false)
                      }}
                      className={`
                        w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                        ${isSelected ? 'bg-primary/20 text-white' : 'hover:bg-white/5'}
                      `}
                    >
                      <div className="flex-shrink-0 text-foreground/60">
                        {cmd.icon || <ArrowRight className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{cmd.label}</p>
                        {cmd.description && (
                          <p className="text-xs text-foreground/40 truncate">{cmd.description}</p>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <div className="flex-shrink-0 text-xs text-foreground/30 font-mono">
                          {cmd.shortcut}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 bg-secondary/30 text-xs text-foreground/40">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-secondary rounded text-[10px]">↑</kbd>
              <kbd className="px-1 py-0.5 bg-secondary rounded text-[10px]">↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-secondary rounded text-[10px]">↵</kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-secondary rounded text-[10px]">esc</kbd>
              Close
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            <span>Command Palette</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CommandPalette
```

---

## Phase 1 Deliverables Summary

| Deliverable | Status | Description |
|-------------|--------|-------------|
| Service Layer Architecture | 🆕 | BaseService, ServiceContainer, DI pattern |
| Enhanced Database Schema | 🆕 | Budget, Bank Reconciliation, Approval Workflows, Fixed Assets |
| UI Component Library | 🆕 | DataTable, Skeleton, EmptyState, Modal |
| Theme System | 🆕 | Light/Dark mode toggle with design tokens |
| Keyboard Shortcuts | 🆕 | Global shortcuts + Command Palette (⌘K) |
| Consistent Styling | 🔧 | Fix light/dark theme inconsistencies |

---

# Phase 2: Financial Core Enhancements
**Duration: 5-6 weeks**
**Goal: Build production-ready financial management capabilities**

---

## 2.1 Budgeting Module

### Objective
Implement complete budget creation, tracking, variance analysis, and approval workflows.

### Budget Service

```typescript name=electron/main/services/finance/BudgetService.ts
import { BaseService } from '../base/BaseService'
import { logAudit } from '../../database/utils/audit'
import { container } from '../base/ServiceContainer'

export interface Budget {
  id: number
  budget_name: string
  academic_year_id: number
  term_id: number | null
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'CLOSED'
  total_amount: number
  notes: string | null
  created_by_user_id: number
  approved_by_user_id: number | null
  approved_at: string | null
  created_at: string
  updated_at: string
  // Computed
  academic_year_name?: string
  term_name?: string
  created_by_name?: string
  approved_by_name?: string
  line_items?: BudgetLineItem[]
  total_budgeted?: number
  total_actual?: number
  total_variance?: number
}

export interface BudgetLineItem {
  id: number
  budget_id: number
  category_id: number
  description: string
  budgeted_amount: number
  actual_amount: number
  variance: number
  notes: string | null
  category_name?: string
  category_type?: 'INCOME' | 'EXPENSE'
}

export interface BudgetFilters {
  academic_year_id?: number
  term_id?: number
  status?: Budget['status']
}

export interface CreateBudgetData {
  budget_name: string
  academic_year_id: number
  term_id?: number
  notes?: string
  line_items: CreateBudgetLineItemData[]
}

export interface CreateBudgetLineItemData {
  category_id: number
  description: string
  budgeted_amount: number
  notes?: string
}

export class BudgetService extends BaseService<Budget, CreateBudgetData, Partial<CreateBudgetData>, BudgetFilters> {
  protected tableName = 'budget'
  protected primaryKey = 'id'

  protected buildSelectQuery(): string {
    return `
      SELECT 
        b.*,
        ay.year_name as academic_year_name,
        t.term_name,
        u1.full_name as created_by_name,
        u2.full_name as approved_by_name,
        COALESCE(SUM(bli.budgeted_amount), 0) as total_budgeted,
        COALESCE(SUM(bli.actual_amount), 0) as total_actual,
        COALESCE(SUM(bli.variance), 0) as total_variance
      FROM budget b
      LEFT JOIN academic_year ay ON b.academic_year_id = ay.id
      LEFT JOIN term t ON b.term_id = t.id
      LEFT JOIN user u1 ON b.created_by_user_id = u1.id
      LEFT JOIN user u2 ON b.approved_by_user_id = u2.id
      LEFT JOIN budget_line_item bli ON b.id = bli.budget_id
    `
  }

  protected mapRowToEntity(row: unknown): Budget {
    return row as Budget
  }

  protected validateCreate(data: CreateBudgetData): string[] | null {
    const errors: string[] = []

    if (!data.budget_name?.trim()) {
      errors.push('Budget name is required')
    }
    if (!data.academic_year_id) {
      errors.push('Academic year is required')
    }
    if (!data.line_items?.length) {
      errors.push('At least one budget line item is required')
    }

    // Validate line items
    data.line_items?.forEach((item, index) => {
      if (!item.category_id) {
        errors.push(`Line item ${index + 1}: Category is required`)
      }
      if (!item.description?.trim()) {
        errors.push(`Line item ${index + 1}: Description is required`)
      }
      if (item.budgeted_amount < 0) {
        errors.push(`Line item ${index + 1}: Amount must be positive`)
      }
    })

    return errors.length > 0 ? errors : null
  }

  protected async validateUpdate(id: number, data: Partial<CreateBudgetData>): Promise<string[] | null> {
    const existing = await this.findById(id)
    if (!existing) {
      return ['Budget not found']
    }

    // Cannot update approved/closed budgets
    if (existing.status === 'APPROVED' || existing.status === 'CLOSED') {
      return ['Cannot modify an approved or closed budget. Create a revision instead.']
    }

    return null
  }

  protected executeCreate(data: CreateBudgetData): { lastInsertRowid: number | bigint } {
    const result = this.db.transaction(() => {
      // Insert budget
      const budgetResult = this.db.prepare(`
        INSERT INTO budget (budget_name, academic_year_id, term_id, notes, status, created_by_user_id)
        VALUES (?, ?, ?, ?, 'DRAFT', ?)
      `).run(
        data.budget_name,
        data.academic_year_id,
        data.term_id || null,
        data.notes || null,
        1 // TODO: Get from context
      )

      const budgetId = budgetResult.lastInsertRowid as number

      // Insert line items
      const insertItem = this.db.prepare(`
        INSERT INTO budget_line_item (budget_id, category_id, description, budgeted_amount, notes)
        VALUES (?, ?, ?, ?, ?)
      `)

      for (const item of data.line_items) {
        insertItem.run(
          budgetId,
          item.category_id,
          item.description,
          item.budgeted_amount,
          item.notes || null
        )
      }

      // Calculate total
      const total = data.line_items.reduce((sum, item) => sum + item.budgeted_amount, 0)
      this.db.prepare('UPDATE budget SET total_amount = ? WHERE id = ?').run(total, budgetId)

      return budgetResult
    })()

    return result
  }

  protected executeUpdate(id: number, data: Partial<CreateBudgetData>): void {
    this.db.transaction(() => {
      // Update budget fields
      if (data.budget_name || data.notes !== undefined) {
        this.db.prepare(`
          UPDATE budget 
          SET budget_name = COALESCE(?, budget_name),
              notes = COALESCE(?, notes),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(data.budget_name, data.notes, id)
      }

      // Update line items if provided
      if (data.line_items) {
        // Delete existing items and recreate
        this.db.prepare('DELETE FROM budget_line_item WHERE budget_id = ?').run(id)

        const insertItem = this.db.prepare(`
          INSERT INTO budget_line_item (budget_id, category_id, description, budgeted_amount, notes)
          VALUES (?, ?, ?, ?, ?)
        `)

        let total = 0
        for (const item of data.line_items) {
          insertItem.run(id, item.category_id, item.description, item.budgeted_amount, item.notes || null)
          total += item.budgeted_amount
        }

        this.db.prepare('UPDATE budget SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(total, id)
      }
    })()
  }

  protected applyFilters(filters: BudgetFilters, conditions: string[], params: unknown[]): void {
    if (filters.academic_year_id) {
      conditions.push('b.academic_year_id = ?')
      params.push(filters.academic_year_id)
    }
    if (filters.term_id) {
      conditions.push('b.term_id = ?')
      params.push(filters.term_id)
    }
    if (filters.status) {
      conditions.push('b.status = ?')
      params.push(filters.status)
    }
    conditions.push('b.deleted_at IS NULL')
  }

  /**
   * Get budget with all line items
   */
  async getBudgetWithLineItems(budgetId: number): Promise<Budget | null> {
    const budget = await this.findById(budgetId)
    if (!budget) return null

    const lineItems = this.db.prepare(`
      SELECT bli.*, tc.category_name, tc.category_type
      FROM budget_line_item bli
      JOIN transaction_category tc ON bli.category_id = tc.id
      WHERE bli.budget_id = ?
      ORDER BY tc.category_type DESC, tc.category_name
    `).all(budgetId) as BudgetLineItem[]

    return { ...budget, line_items: lineItems }
  }

  /**
   * Submit budget for approval
   */
  async submitForApproval(budgetId: number, userId: number): Promise<{ success: boolean; errors?: string[] }> {
    const budget = await this.findById(budgetId)
    if (!budget) {
      return { success: false, errors: ['Budget not found'] }
    }

    if (budget.status !== 'DRAFT') {
      return { success: false, errors: ['Only draft budgets can be submitted for approval'] }
    }

    this.db.prepare(`
      UPDATE budget SET status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(budgetId)

    logAudit(userId, 'SUBMIT', 'budget', budgetId, { status: 'DRAFT' }, { status: 'SUBMITTED' })

    return { success: true }
  }

  /**
   * Approve budget
   */
  async approve(budgetId: number, userId: number): Promise<{ success: boolean; errors?: string[] }> {
    const budget = await this.findById(budgetId)
    if (!budget) {
      return { success: false, errors: ['Budget not found'] }
    }

    if (budget.status !== 'SUBMITTED') {
      return { success: false, errors: ['Only submitted budgets can be approved'] }
    }

    this.db.prepare(`
      UPDATE budget 
      SET status = 'APPROVED', 
          approved_by_user_id = ?, 
          approved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(userId, budgetId)

    logAudit(userId, 'APPROVE', 'budget', budgetId, { status: 'SUBMITTED' }, { status: 'APPROVED' })

    return { success: true }
  }

  /**
   * Reject budget
   */
  async reject(budgetId: number, userId: number, reason: string): Promise<{ success: boolean; errors?: string[] }> {
    const budget = await this.findById(budgetId)
    if (!budget) {
      return { success: false, errors: ['Budget not found'] }
    }

    if (budget.status !== 'SUBMITTED') {
      return { success: false, errors: ['Only submitted budgets can be rejected'] }
    }

    this.db.prepare(`
      UPDATE budget 
      SET status = 'REJECTED', 
          notes = COALESCE(notes, '') || '\n\nRejection Reason: ' || ?,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(reason, budgetId)

    logAudit(userId, 'REJECT', 'budget', budgetId, { status: 'SUBMITTED' }, { status: 'REJECTED', reason })

    return { success: true }
  }

  /**
   * Get budget vs actual comparison
   */
  async getBudgetVsActual(budgetId: number, startDate: string, endDate: string): Promise<{
    budget: Budget
    comparison: BudgetComparisonItem[]
    summary: BudgetSummary
  } | null> {
    const budget = await this.getBudgetWithLineItems(budgetId)
    if (!budget) return null

    // Get actual spending per category within date range
    const actuals = this.db.prepare(`
      SELECT 
        category_id,
        SUM(CASE WHEN debit_credit = 'DEBIT' THEN amount ELSE 0 END) as total_expense,
        SUM(CASE WHEN debit_credit = 'CREDIT' THEN amount ELSE 0 END) as total_income
      FROM ledger_transaction
      WHERE is_voided = 0 
        AND transaction_date BETWEEN ? AND ?
        AND category_id IS NOT NULL
      GROUP BY category_id
    `).all(startDate, endDate) as Array<{ category_id: number; total_expense: number; total_income: number }>

    const actualMap = new Map(actuals.map(a => [a.category_id, a]))

    // Build comparison
    const comparison: BudgetComparisonItem[] = (budget.line_items || []).map(item => {
      const actual = actualMap.get(item.category_id)
      const actualAmount = actual 
        ? (item.category_type === 'EXPENSE' ? actual.total_expense : actual.total_income)
        : 0

      return {
        category_id: item.category_id,
        category_name: item.category_name || '',
        category_type: item.category_type || 'EXPENSE',
        description: item.description,
        budgeted_amount: item.budgeted_amount,
        actual_amount: actualAmount,
        variance: item.budgeted_amount - actualAmount,
        variance_percent: item.budgeted_amount > 0 
          ? ((item.budgeted_amount - actualAmount) / item.budgeted_amount) * 100 
          : 0,
        status: this.getVarianceStatus(item.budgeted_amount, actualAmount, item.category_type || 'EXPENSE')
      }
    })

    // Calculate summary
    const incomeItems = comparison.filter(c => c.category_type === 'INCOME')
    const expenseItems = comparison.filter(c => c.category_type === 'EXPENSE')

    const summary: BudgetSummary = {
      total_budgeted_income: incomeItems.reduce((sum, i) => sum + i.budgeted_amount, 0),
      total_actual_income: incomeItems.reduce((sum, i) => sum + i.actual_amount, 0),
      total_budgeted_expense: expenseItems.reduce((sum, i) => sum + i.budgeted_amount, 0),
      total_actual_expense: expenseItems.reduce((sum, i) => sum + i.actual_amount, 0),
      net_budgeted: 0,
      net_actual: 0,
      overall_variance: 0,
    }

    summary.net_budgeted = summary.total_budgeted_income - summary.total_budgeted_expense
    summary.net_actual = summary.total_actual_income - summary.total_actual_expense
    summary.overall_variance = summary.net_actual - summary.net_budgeted

    return { budget, comparison, summary }
  }

  private getVarianceStatus(budgeted: number, actual: number, type: 'INCOME' | 'EXPENSE'): 'ON_TRACK' | 'WARNING' | 'OVER' | 'UNDER' {
    if (budgeted === 0) return 'ON_TRACK'

    const variance = ((budgeted - actual) / budgeted) * 100

    if (type === 'EXPENSE') {
      // For expenses: over budget is bad
      if (actual > budgeted) return 'OVER'
      if (variance < 10) return 'WARNING'
      if (variance > 30) return 'UNDER'
      return 'ON_TRACK'
    } else {
      // For income: under budget is concerning
      if (actual < budgeted * 0.7) return 'UNDER'
      if (actual < budgeted * 0.9) return 'WARNING'
      if (actual > budgeted) return 'OVER'
      return 'ON_TRACK'
    }
  }
}

interface BudgetComparisonItem {
  category_id: number
  category_name: string
  category_type: 'INCOME' | 'EXPENSE'
  description: string
  budgeted_amount: number
  actual_amount: number
  variance: number
  variance_percent: number
  status: 'ON_TRACK' | 'WARNING' | 'OVER' | 'UNDER'
}

interface BudgetSummary {
  total_budgeted_income: number
  total_actual_income: number
  total_budgeted_expense: number
  total_actual_expense: number
  net_budgeted: number
  net_actual: number
  overall_variance: number
}
```

### Budget UI Component

```tsx name=src/pages/Finance/Budget/index.tsx
import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { 
  Plus, TrendingUp, TrendingDown, DollarSign, 
  CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronRight, Edit, Eye, FileText
} from 'lucide-react'
import { DataTable, Column } from '../../../components/ui/Table/DataTable'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { StatCard } from '../../../components/patterns/StatCard'
import { Badge } from '../../../components/ui/Badge'
import { useAppStore } from '../../../stores'
import { formatCurrency } from '../../../utils/format'

interface Budget {
  id: number
  budget_name: string
  academic_year_name: string
  term_name: string | null
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'CLOSED'
  total_amount: number
  total_budgeted: number
  total_actual: number
  total_variance: number
  created_by_name: string
  approved_by_name: string | null
  created_at: string
}

const statusConfig = {
  DRAFT: { label: 'Draft', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: Edit },
  SUBMITTED: { label: 'Pending Approval', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle },
  REJECTED: { label: 'Rejected', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
  ACTIVE: { label: 'Active', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: TrendingUp },
  CLOSED: { label: 'Closed', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: FileText },
}

export default function BudgetList() {
  const navigate = useNavigate()
  const { currentAcademicYear, currentTerm } = useAppStore()
  
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    totalBudgets: 0,
    activeBudget: 0,
    totalBudgeted: 0,
    totalActual: 0,
    variance: 0,
  })

  const loadBudgets = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.electronAPI.getBudgets({
        academic_year_id: currentAcademicYear?.id
      })
      setBudgets(data)

      // Calculate summary
      const active = data.find((b: Budget) => b.status === 'ACTIVE')
      setSummary({
        totalBudgets: data.length,
        activeBudget: active?.total_amount || 0,
        totalBudgeted: data.reduce((sum: number, b: Budget) => sum + b.total_budgeted, 0),
        totalActual: data.reduce((sum: number, b: Budget) => sum + b.total_actual, 0),
        variance: data.reduce((sum: number, b: Budget) => sum + b.total_variance, 0),
      })
    } catch (error) {
      console.error('Failed to load budgets:', error)
    } finally {
      setLoading(false)
    }
  }, [currentAcademicYear])

  useEffect(() => {
    loadBudgets()
  }, [loadBudgets])

  const columns: Column<Budget>[] = [
    {
      key: 'budget_name',
      header: 'Budget Name',
      render: (_, row) => (
        <div>
          <p className="font-bold text-white">{row.budget_name}</p>
          <p className="text-xs text-foreground/40">
            {row.academic_year_name} {row.term_name ? `• ${row.term_name}` : ''}
          </p>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (value) => {
        const config = statusConfig[value as keyof typeof statusConfig]
        const Icon = config.icon
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${config.color}`}>
            <Icon className="w-3 h-3" />
            {config.label}
          </span>
        )
      }
    },
    {
      key: 'total_budgeted',
      header: 'Budgeted',
      align: 'right',
      render: (value) => (
        <span className="font-mono font-bold text-white">{formatCurrency(value as number)}</span>
      )
    },
    {
      key: 'total_actual',
      header: 'Actual',
      align: 'right',
      render: (value) => (
        <span className="font-mono font-medium text-foreground/70">{formatCurrency(value as number)}</span>
      )
    },
    {
      key: 'total_variance',
      header: 'Variance',
      align: 'right',
      render: (value) => {
        const variance = value as number
        const isPositive = variance >= 0
        return (
          <span className={`font-mono font-bold flex items-center justify-end gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {formatCurrency(Math.abs(variance))}
          </span>
        )
      }
    },
    {
      key: 'created_by_name',
      header: 'Created By',
      render: (value) => <span className="text-sm">{value as string}</span>
    },
  ]

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Budget Management"
        subtitle="Create, track, and analyze financial budgets"
        actions={
          <Link
            to="/budget/new"
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Budget
          </Link>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Active Budget"
          value={formatCurrency(summary.activeBudget)}
          icon={DollarSign}
          color="from-blue-500/20 to-indigo-500/20 text-blue-400"
        />
        <StatCard
          label="Total Budgeted"
          value={formatCurrency(summary.totalBudgeted)}
          icon={FileText}
          color="from-emerald-500/20 to-teal-500/20 text-emerald-400"
        />
        <StatCard
          label="Total Spent"
          value={formatCurrency(summary.totalActual)}
          icon={TrendingDown}
          color="from-amber-500/20 to-orange-500/20 text-amber-400"
        />
        <StatCard
          label="Overall Variance"
          value={formatCurrency(Math.abs(summary.variance))}
          icon={summary.variance >= 0 ? TrendingUp : AlertTriangle}
          color={summary.variance >= 0 
            ? "from-green-500/20 to-emerald-500/20 text-green-400"
            : "from-red-500/20 to-rose-500/20 text-red-400"
          }
          trend={summary.variance >= 0 ? 'up' : 'down'}
          trendLabel={summary.variance >= 0 ? 'Under budget' : 'Over budget'}
        />
      </div>

      {/* Budget List */}
      <div className="card">
        <DataTable
          data={budgets}
          columns={columns}
          loading={loading}
          emptyMessage="No budgets created yet"
          onRowClick={(row) => navigate(`/budget/${row.id}`)}
          sortable
          paginated
          pageSize={10}
        />
      </div>
    </div>
  )
}
```

---

## 2.2 Professional Report Export System

### Objective
Implement real PDF, Excel, and CSV export functionality.

### Report Export Service

```typescript name=electron/main/services/reports/exporters/PDFExporter.ts
import puppeteer, { Browser, Page } from 'puppeteer'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

interface PDFExportOptions {
  title: string
  subtitle?: string
  orientation?: 'portrait' | 'landscape'
  pageSize?: 'A4' | 'Letter' | 'Legal'
  margins?: {
    top?: string
    right?: string
    bottom?: string
    left?: string
  }
  headerTemplate?: string
  footerTemplate?: string
  schoolInfo?: {
    name: string
    address: string
    phone: string
    email: string
    logo?: string
  }
}

interface TableData {
  headers: string[]
  rows: (string | number)[][]
  columnWidths?: number[]
  columnAlignments?: ('left' | 'center' | 'right')[]
}

interface ReportSection {
  type: 'title' | 'subtitle' | 'text' | 'table' | 'summary' | 'chart' | 'spacer'
  content?: string
  data?: TableData | SummaryData | ChartData
}

interface SummaryData {
  items: { label: string; value: string | number; highlight?: boolean }[]
  columns?: number
}

interface ChartData {
  type: 'bar' | 'pie' | 'line'
  labels: string[]
  values: number[]
  colors?: string[]
}

export class PDFExporter {
  private browser: Browser | null = null

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      })
    }
    return this.browser
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  /**
   * Generate PDF from report sections
   */
  async generateReport(
    sections: ReportSection[],
    options: PDFExportOptions
  ): Promise<Buffer> {
    const browser = await this.getBrowser()
    const page = await browser.newPage()

    try {
      const html = this.buildHTML(sections, options)
      await page.setContent(html, { waitUntil: 'networkidle0' })

      const pdfBuffer = await page.pdf({
        format: options.pageSize || 'A4',
        landscape: options.orientation === 'landscape',
        printBackground: true,
        margin: {
          top: options.margins?.top || '20mm',
          right: options.margins?.right || '15mm',
          bottom: options.margins?.bottom || '20mm',
          left: options.margins?.left || '15mm',
        },
        displayHeaderFooter: true,
        headerTemplate: options.headerTemplate || this.getDefaultHeader(options),
        footerTemplate: options.footerTemplate || this.getDefaultFooter(),
      })

      return Buffer.from(pdfBuffer)
    } finally {
      await page.close()
    }
  }

  /**
   * Generate PDF from raw HTML
   */
  async generateFromHTML(html: string, options: PDFExportOptions): Promise<Buffer> {
    const browser = await this.getBrowser()
    const page = await browser.newPage()

    try {
      await page.setContent(html, { waitUntil: 'networkidle0' })

      const pdfBuffer = await page.pdf({
        format: options.pageSize || 'A4',
        landscape: options.orientation === 'landscape',
        printBackground: true,
        margin: {
          top: options.margins?.top || '25mm',
          right: options.margins?.right || '15mm',
          bottom: options.margins?.bottom || '20mm',
          left: options.margins?.left || '15mm',
        },
        displayHeaderFooter: true,
        headerTemplate: this.getDefaultHeader(options),
        footerTemplate: this.getDefaultFooter(),
      })

      return Buffer.from(pdfBuffer)
    } finally {
      await page.close()
    }
  }

  private buildHTML(sections: ReportSection[], options: PDFExportOptions): string {
    const sectionHTML = sections.map(section => this.renderSection(section)).join('\n')

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${options.title}</title>
          <style>
            ${this.getStyles()}
          </style>
        </head>
        <body>
          <div class="report-container">
            ${sectionHTML}
          </div>
        </body>
      </html>
    `
  }

  private renderSection(section: ReportSection): string {
    switch (section.type) {
      case 'title':
        return `<h1 class="report-title">${section.content}</h1>`
      
      case 'subtitle':
        return `<h2 class="report-subtitle">${section.content}</h2>`
      
      case 'text':
        return `<p class="report-text">${section.content}</p>`
      
      case 'spacer':
        return `<div class="spacer"></div>`
      
      case 'table':
        return this.renderTable(section.data as TableData)
      
      case 'summary':
        return this.renderSummary(section.data as SummaryData)
      
      default:
        return ''
    }
  }

  private renderTable(data: TableData): string {
    const headerCells = data.headers.map((h, i) => {
      const align = data.columnAlignments?.[i] || 'left'
      const width = data.columnWidths?.[i] ? `width: ${data.columnWidths[i]}%` : ''
      return `<th style="text-align: ${align}; ${width}">${h}</th>`
    }).join('')

    const rows = data.rows.map(row => {
      const cells = row.map((cell, i) => {
        const align = data.columnAlignments?.[i] || 'left'
        return `<td style="text-align: ${align}">${cell}</td>`
      }).join('')
      return `<tr>${cells}</tr>`
    }).join('')

    return `
      <table class="report-table">
        <thead>
          <tr>${headerCells}</tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
  }

  private renderSummary(data: SummaryData): string {
    const columns = data.columns || 2
    const items = data.items.map(item => `
      <div class="summary-item ${item.highlight ? 'highlight' : ''}">
        <span class="summary-label">${item.label}</span>
        <span class="summary-value">${item.value}</span>
      </div>
    `).join('')

    return `
      <div class="summary-grid" style="grid-template-columns: repeat(${columns}, 1fr)">
        ${items}
      </div>
    `
  }

  private getDefaultHeader(options: PDFExportOptions): string {
    const school = options.schoolInfo
    return `
      <div style="width: 100%; font-size: 9px; padding: 10px 30px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between;">
        <div style="font-weight: bold;">${school?.name || 'School Report'}</div>
        <div>${options.title}</div>
      </div>
    `
  }

  private getDefaultFooter(): string {
    return `
      <div style="width: 100%; font-size: 8px; padding: 10px 30px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; color: #666;">
        <div>Generated on <span class="date"></span></div>
        <div>Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
      </div>
    `
  }

  private getStyles(): string {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 11px;
        line-height: 1.5;
        color: #333;
      }

      .report-container {
        padding: 0;
      }

      .report-title {
        font-size: 20px;
        font-weight: 700;
        color: #1e3a8a;
        margin-bottom: 5px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .report-subtitle {
        font-size: 14px;
        font-weight: 600;
        color: #4b5563;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 2px solid #e5e7eb;
      }

      .report-text {
        margin-bottom: 15px;
        color: #4b5563;
      }

      .spacer {
        height: 20px;
      }

      .report-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
        font-size: 10px;
      }

      .report-table th {
        background-color: #f3f4f6;
        color: #374151;
        font-weight: 600;
        text-transform: uppercase;
        font-size: 9px;
        letter-spacing: 0.5px;
        padding: 10px 8px;
        border-bottom: 2px solid #d1d5db;
      }

      .report-table td {
        padding: 8px;
        border-bottom: 1px solid #e5e7eb;
        vertical-align: middle;
      }

      .report-table tbody tr:nth-child(even) {
        background-color: #f9fafb;
      }

      .report-table tbody tr:hover {
        background-color: #f3f4f6;
      }

      .summary-grid {
        display: grid;
        gap: 15px;
        margin-bottom: 20px;
      }

      .summary-item {
        display: flex;
        justify-content: space-between;
        padding: 12px 15px;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
      }

      .summary-item.highlight {
        background-color: #1e40af;
        border-color: #1e40af;
      }

      .summary-item.highlight .summary-label,
      .summary-item.highlight .summary-value {
        color: white;
      }

      .summary-label {
        font-weight: 500;
        color: #6b7280;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .summary-value {
        font-weight: 700;
        color: #111827;
        font-size: 14px;
      }

      @page {
        margin: 0;
      }
    `
  }
}

// Singleton instance
let pdfExporter: PDFExporter | null = null

export function getPDFExporter(): PDFExporter {
  if (!pdfExporter) {
    pdfExporter = new PDFExporter()
  }
  return pdfExporter
}

// Cleanup on app quit
app.on('before-quit', async () => {
  if (pdfExporter) {
    await pdfExporter.closeBrowser()
  }
})
```

### Excel Exporter

```typescript name=electron/main/services/reports/exporters/ExcelExporter.ts
import ExcelJS from 'exceljs'

interface ExcelExportOptions {
  sheetName?: string
  title?: string
  subtitle?: string
  author?: string
  includeHeaders?: boolean
  columnWidths?: number[]
  freezeHeader?: boolean
  autoFilter?: boolean
}

interface ExcelColumn {
  header: string
  key: string
  width?: number
  style?: Partial<ExcelJS.Style>
  numFmt?: string
}

export class ExcelExporter {
  /**
   * Export data to Excel buffer
   */
  async export<T extends Record<string, unknown>>(
    data: T[],
    columns: ExcelColumn[],
    options: ExcelExportOptions = {}
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    
    workbook.creator = options.author || 'School ERP System'
    workbook.created = new Date()

    const worksheet = workbook.addWorksheet(options.sheetName || 'Report', {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
      }
    })

    let startRow = 1
    if (options.title) {
      const titleRow = worksheet.addRow([options.title])
      titleRow.font = { size: 16, bold: true, color: { argb: 'FF1E3A8A' } }
      worksheet.mergeCells(`A1:${this.columnLetter(columns.length)}1`)
      startRow++
    }

    if (options.subtitle) {
      const subtitleRow = worksheet.addRow([options.subtitle])
      subtitleRow.font = { size: 12, italic: true, color: { argb: 'FF6B7280' } }
      worksheet.mergeCells(`A${startRow}:${this.columnLetter(columns.length)}${startRow}`)
      startRow++
      worksheet.addRow([])
      startRow++
    }

    worksheet.columns = columns.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width || 15,
      style: col.style,
    }))

    const headerRow = worksheet.getRow(startRow)
    headerRow.values = columns.map(c => c.header)
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E40AF' }
      }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF1E40AF' } }
      }
    })
    headerRow.height = 25
    startRow++

    data.forEach((item, index) => {
      const rowValues = columns.map(col => {
        const value = item[col.key]
        if (typeof value === 'number' && col.numFmt) {
          return value / 100
        }
        return value
      })
      
      const row = worksheet.addRow(rowValues)
      
      if (index % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' }
          }
        })
      }

      columns.forEach((col, colIndex) => {
        if (col.numFmt) {
          row.getCell(colIndex + 1).numFmt = col.numFmt
        }
      })
    })

    if (options.freezeHeader !== false) {
      worksheet.views = [{ state: 'frozen', ySplit: startRow - 1 }]
    }

    if (options.autoFilter !== false && data.length > 0) {
      worksheet.autoFilter = {
        from: { row: startRow - 1, column: 1 },
        to: { row: startRow - 1 + data.length, column: columns.length }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }

  private columnLetter(col: number): string {
    let letter = ''
    while (col > 0) {
      const remainder = (col - 1) % 26
      letter = String.fromCharCode(65 + remainder) + letter
      col = Math.floor((col - 1) / 26)
    }
    return letter
  }
}

export const excelExporter = new ExcelExporter()
```

### CSV Exporter

```typescript name=electron/main/services/reports/exporters/CSVExporter.ts
interface CSVExportOptions {
  delimiter?: string
  includeHeaders?: boolean
  dateFormat?: string
  numberFormat?: 'raw' | 'formatted'
}

interface CSVColumn {
  key: string
  header: string
  transform?: (value: unknown) => string
}

export class CSVExporter {
  /**
   * Export data to CSV string
   */
  export<T extends Record<string, unknown>>(
    data: T[],
    columns: CSVColumn[],
    options: CSVExportOptions = {}
  ): string {
    const delimiter = options.delimiter || ','
    const includeHeaders = options.includeHeaders !== false

    const lines: string[] = []

    // Header row
    if (includeHeaders) {
      const headers = columns.map(col => this.escapeCSV(col.header, delimiter))
      lines.push(headers.join(delimiter))
    }

    // Data rows
    for (const row of data) {
      const values = columns.map(col => {
        let value = this.getNestedValue(row, col.key)
        
        if (col.transform) {
          value = col.transform(value)
        } else if (value === null || value === undefined) {
          value = ''
        } else if (typeof value === 'number') {
          // Convert cents to currency if needed
          if (options.numberFormat === 'formatted' && this.looksLikeCents(col.key)) {
            value = (value / 100).toFixed(2)
          }
        } else if (value instanceof Date) {
          value = this.formatDate(value, options.dateFormat)
        }

        return this.escapeCSV(String(value), delimiter)
      })
      
      lines.push(values.join(delimiter))
    }

    return lines.join('\n')
  }

  /**
   * Export to Buffer (for file saving)
   */
  exportToBuffer<T extends Record<string, unknown>>(
    data: T[],
    columns: CSVColumn[],
    options: CSVExportOptions = {}
  ): Buffer {
    const csv = this.export(data, columns, options)
    // Add BOM for Excel UTF-8 compatibility
    return Buffer.from('\ufeff' + csv, 'utf-8')
  }

  private escapeCSV(value: string, delimiter: string): string {
    if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((acc, part) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[part]
      }
      return undefined
    }, obj as unknown)
  }

  private formatDate(date: Date, format?: string): string {
    if (format === 'ISO') {
      return date.toISOString()
    }
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  private looksLikeCents(key: string): boolean {
    const moneyKeywords = ['amount', 'balance', 'fee', 'cost', 'price', 'salary', 'total', 'paid']
    return moneyKeywords.some(keyword => key.toLowerCase().includes(keyword))
  }
}

export const csvExporter = new CSVExporter()
```

### Report Engine (Unified Export Interface)

```typescript name=electron/main/services/reports/ReportEngine.ts
import { getPDFExporter } from './exporters/PDFExporter'
import { excelExporter, ExcelColumn } from './exporters/ExcelExporter'
import { csvExporter, CSVColumn } from './exporters/CSVExporter'
import { getDatabase } from '../../database'
import { dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export type ExportFormat = 'pdf' | 'excel' | 'csv'

export interface ReportDefinition {
  id: string
  name: string
  description: string
  category: 'financial' | 'student' | 'staff' | 'inventory' | 'audit'
  supportedFormats: ExportFormat[]
  parameters?: ReportParameter[]
}

export interface ReportParameter {
  key: string
  label: string
  type: 'date' | 'daterange' | 'select' | 'multiselect' | 'text' | 'number'
  required?: boolean
  options?: { value: string; label: string }[]
  default?: unknown
}

export interface GenerateReportOptions {
  reportId: string
  format: ExportFormat
  parameters: Record<string, unknown>
  saveToFile?: boolean
  openAfterSave?: boolean
}

export interface ReportResult {
  success: boolean
  data?: Buffer | string
  filePath?: string
  error?: string
}

export class ReportEngine {
  private db = getDatabase()

  /**
   * Get all available report definitions
   */
  getAvailableReports(): ReportDefinition[] {
    return [
      // Financial Reports
      {
        id: 'fee-collection',
        name: 'Fee Collection Report',
        description: 'Summary of all fee payments within a date range',
        category: 'financial',
        supportedFormats: ['pdf', 'excel', 'csv'],
        parameters: [
          { key: 'startDate', label: 'Start Date', type: 'date', required: true },
          { key: 'endDate', label: 'End Date', type: 'date', required: true },
          { key: 'paymentMethod', label: 'Payment Method', type: 'select', options: [
            { value: '', label: 'All Methods' },
            { value: 'CASH', label: 'Cash' },
            { value: 'MPESA', label: 'M-Pesa' },
            { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
            { value: 'CHEQUE', label: 'Cheque' },
          ]},
        ]
      },
      {
        id: 'fee-defaulters',
        name: 'Fee Defaulters Report',
        description: 'List of students with outstanding balances',
        category: 'financial',
        supportedFormats: ['pdf', 'excel', 'csv'],
        parameters: [
          { key: 'termId', label: 'Term', type: 'select', required: true },
          { key: 'minBalance', label: 'Minimum Balance', type: 'number', default: 0 },
          { key: 'streamId', label: 'Class/Stream', type: 'select' },
        ]
      },
      {
        id: 'income-expense',
        name: 'Income & Expense Report',
        description: 'Summary of all income and expenses by category',
        category: 'financial',
        supportedFormats: ['pdf', 'excel', 'csv'],
        parameters: [
          { key: 'startDate', label: 'Start Date', type: 'date', required: true },
          { key: 'endDate', label: 'End Date', type: 'date', required: true },
          { key: 'categoryType', label: 'Type', type: 'select', options: [
            { value: '', label: 'All' },
            { value: 'INCOME', label: 'Income Only' },
            { value: 'EXPENSE', label: 'Expenses Only' },
          ]},
        ]
      },
      {
        id: 'budget-variance',
        name: 'Budget vs Actual Report',
        description: 'Compare budgeted amounts against actual spending',
        category: 'financial',
        supportedFormats: ['pdf', 'excel'],
        parameters: [
          { key: 'budgetId', label: 'Budget', type: 'select', required: true },
          { key: 'startDate', label: 'Start Date', type: 'date', required: true },
          { key: 'endDate', label: 'End Date', type: 'date', required: true },
        ]
      },
      {
        id: 'aged-receivables',
        name: 'Aged Receivables Report',
        description: 'Outstanding fees grouped by aging periods (30/60/90 days)',
        category: 'financial',
        supportedFormats: ['pdf', 'excel', 'csv'],
        parameters: [
          { key: 'asOfDate', label: 'As of Date', type: 'date', required: true },
        ]
      },
      {
        id: 'cash-flow',
        name: 'Cash Flow Statement',
        description: 'Summary of cash inflows and outflows',
        category: 'financial',
        supportedFormats: ['pdf', 'excel'],
        parameters: [
          { key: 'startDate', label: 'Start Date', type: 'date', required: true },
          { key: 'endDate', label: 'End Date', type: 'date', required: true },
        ]
      },
      // Student Reports
      {
        id: 'student-ledger',
        name: 'Student Fee Ledger',
        description: 'Complete transaction history for a student',
        category: 'student',
        supportedFormats: ['pdf', 'excel'],
        parameters: [
          { key: 'studentId', label: 'Student', type: 'select', required: true },
        ]
      },
      {
        id: 'enrollment-summary',
        name: 'Enrollment Summary',
        description: 'Student enrollment statistics by class and type',
        category: 'student',
        supportedFormats: ['pdf', 'excel', 'csv'],
        parameters: [
          { key: 'academicYearId', label: 'Academic Year', type: 'select', required: true },
          { key: 'termId', label: 'Term', type: 'select' },
        ]
      },
      {
        id: 'attendance-summary',
        name: 'Attendance Report',
        description: 'Student attendance statistics',
        category: 'student',
        supportedFormats: ['pdf', 'excel', 'csv'],
        parameters: [
          { key: 'startDate', label: 'Start Date', type: 'date', required: true },
          { key: 'endDate', label: 'End Date', type: 'date', required: true },
          { key: 'streamId', label: 'Class/Stream', type: 'select' },
        ]
      },
      // Staff Reports
      {
        id: 'payroll-summary',
        name: 'Payroll Summary',
        description: 'Summary of payroll for a specific period',
        category: 'staff',
        supportedFormats: ['pdf', 'excel', 'csv'],
        parameters: [
          { key: 'periodId', label: 'Payroll Period', type: 'select', required: true },
        ]
      },
      {
        id: 'staff-list',
        name: 'Staff Directory',
        description: 'Complete list of all staff members',
        category: 'staff',
        supportedFormats: ['pdf', 'excel', 'csv'],
        parameters: [
          { key: 'department', label: 'Department', type: 'select' },
          { key: 'status', label: 'Status', type: 'select', options: [
            { value: '', label: 'All' },
            { value: 'active', label: 'Active Only' },
            { value: 'inactive', label: 'Inactive Only' },
          ]},
        ]
      },
      // Audit Reports
      {
        id: 'audit-trail',
        name: 'Audit Trail Report',
        description: 'System activity and change log',
        category: 'audit',
        supportedFormats: ['pdf', 'excel', 'csv'],
        parameters: [
          { key: 'startDate', label: 'Start Date', type: 'date', required: true },
          { key: 'endDate', label: 'End Date', type: 'date', required: true },
          { key: 'actionType', label: 'Action Type', type: 'select', options: [
            { value: '', label: 'All Actions' },
            { value: 'CREATE', label: 'Create' },
            { value: 'UPDATE', label: 'Update' },
            { value: 'DELETE', label: 'Delete' },
            { value: 'LOGIN', label: 'Login' },
          ]},
          { key: 'tableName', label: 'Entity', type: 'select' },
        ]
      },
    ]
  }

  /**
   * Generate a report
   */
  async generateReport(options: GenerateReportOptions): Promise<ReportResult> {
    try {
      const reportDef = this.getAvailableReports().find(r => r.id === options.reportId)
      if (!reportDef) {
        return { success: false, error: 'Report definition not found' }
      }

      if (!reportDef.supportedFormats.includes(options.format)) {
        return { success: false, error: `Format ${options.format} not supported for this report` }
      }

      // Fetch report data
      const data = await this.fetchReportData(options.reportId, options.parameters)

      // Generate in requested format
      let result: Buffer | string
      let fileExtension: string

      switch (options.format) {
        case 'pdf':
          result = await this.generatePDF(options.reportId, data, options.parameters)
          fileExtension = 'pdf'
          break
        case 'excel':
          result = await this.generateExcel(options.reportId, data, options.parameters)
          fileExtension = 'xlsx'
          break
        case 'csv':
          result = this.generateCSV(options.reportId, data)
          fileExtension = 'csv'
          break
        default:
          return { success: false, error: 'Invalid format' }
      }

      // Save to file if requested
      if (options.saveToFile) {
        const filePath = await this.saveToFile(result, reportDef.name, fileExtension)
        
        if (options.openAfterSave && filePath) {
          shell.openPath(filePath)
        }

        return { success: true, data: result, filePath }
      }

      return { success: true, data: result }
    } catch (error) {
      console.error('Report generation failed:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  /**
   * Fetch data for a specific report
   */
  private async fetchReportData(
    reportId: string, 
    parameters: Record<string, unknown>
  ): Promise<unknown[]> {
    switch (reportId) {
      case 'fee-collection':
        return this.fetchFeeCollectionData(parameters)
      case 'fee-defaulters':
        return this.fetchDefaultersData(parameters)
      case 'income-expense':
        return this.fetchIncomeExpenseData(parameters)
      case 'aged-receivables':
        return this.fetchAgedReceivablesData(parameters)
      case 'audit-trail':
        return this.fetchAuditTrailData(parameters)
      default:
        throw new Error(`Data fetcher not implemented for report: ${reportId}`)
    }
  }

  private fetchFeeCollectionData(params: Record<string, unknown>): unknown[] {
    let query = `
      SELECT 
        lt.transaction_date,
        s.admission_number,
        s.first_name || ' ' || s.last_name as student_name,
        st.stream_name,
        lt.amount,
        lt.payment_method,
        lt.payment_reference,
        r.receipt_number,
        lt.description
      FROM ledger_transaction lt
      JOIN student s ON lt.student_id = s.id
      LEFT JOIN enrollment e ON s.id = e.student_id
      LEFT JOIN stream st ON e.stream_id = st.id
      LEFT JOIN receipt r ON lt.receipt_id = r.id
      WHERE lt.transaction_type = 'FEE_PAYMENT'
        AND lt.is_voided = 0
        AND lt.transaction_date BETWEEN ? AND ?
    `
    const queryParams: unknown[] = [params.startDate, params.endDate]

    if (params.paymentMethod) {
      query += ' AND lt.payment_method = ?'
      queryParams.push(params.paymentMethod)
    }

    query += ' ORDER BY lt.transaction_date DESC'

    return this.db.prepare(query).all(...queryParams)
  }

  private fetchDefaultersData(params: Record<string, unknown>): unknown[] {
    return this.db.prepare(`
      SELECT 
        s.admission_number,
        s.first_name || ' ' || s.last_name as student_name,
        s.guardian_name,
        s.guardian_phone,
        st.stream_name,
        fi.invoice_number,
        fi.total_amount,
        fi.amount_paid,
        (fi.total_amount - fi.amount_paid) as balance,
        fi.due_date,
        CAST(julianday('now') - julianday(fi.due_date) AS INTEGER) as days_overdue
      FROM fee_invoice fi
      JOIN student s ON fi.student_id = s.id
      LEFT JOIN enrollment e ON s.id = e.student_id
      LEFT JOIN stream st ON e.stream_id = st.id
      WHERE fi.status NOT IN ('PAID', 'CANCELLED')
        AND fi.total_amount > fi.amount_paid
        AND (fi.total_amount - fi.amount_paid) >= ?
        AND (? IS NULL OR fi.term_id = ?)
        AND (? IS NULL OR e.stream_id = ?)
      ORDER BY balance DESC
    `).all(
      params.minBalance || 0,
      params.termId || null,
      params.termId || null,
      params.streamId || null,
      params.streamId || null
    )
  }

  private fetchIncomeExpenseData(params: Record<string, unknown>): unknown[] {
    let query = `
      SELECT 
        lt.transaction_date,
        tc.category_name,
        tc.category_type,
        lt.transaction_type,
        lt.amount,
        lt.debit_credit,
        lt.payment_method,
        lt.description,
        u.full_name as recorded_by
      FROM ledger_transaction lt
      LEFT JOIN transaction_category tc ON lt.category_id = tc.id
      LEFT JOIN user u ON lt.recorded_by_user_id = u.id
      WHERE lt.is_voided = 0
        AND lt.transaction_date BETWEEN ? AND ?
        AND lt.transaction_type NOT IN ('FEE_PAYMENT')
    `
    const queryParams: unknown[] = [params.startDate, params.endDate]

    if (params.categoryType) {
      query += ' AND tc.category_type = ?'
      queryParams.push(params.categoryType)
    }

    query += ' ORDER BY lt.transaction_date DESC'

    return this.db.prepare(query).all(...queryParams)
  }

  private fetchAgedReceivablesData(params: Record<string, unknown>): unknown[] {
    const asOfDate = params.asOfDate as string
    
    return this.db.prepare(`
      SELECT 
        s.admission_number,
        s.first_name || ' ' || s.last_name as student_name,
        st.stream_name,
        s.guardian_phone,
        SUM(CASE WHEN julianday(?) - julianday(fi.due_date) <= 30 THEN (fi.total_amount - fi.amount_paid) ELSE 0 END) as current_30,
        SUM(CASE WHEN julianday(?) - julianday(fi.due_date) BETWEEN 31 AND 60 THEN (fi.total_amount - fi.amount_paid) ELSE 0 END) as days_31_60,
        SUM(CASE WHEN julianday(?) - julianday(fi.due_date) BETWEEN 61 AND 90 THEN (fi.total_amount - fi.amount_paid) ELSE 0 END) as days_61_90,
        SUM(CASE WHEN julianday(?) - julianday(fi.due_date) > 90 THEN (fi.total_amount - fi.amount_paid) ELSE 0 END) as over_90,
        SUM(fi.total_amount - fi.amount_paid) as total_outstanding
      FROM fee_invoice fi
      JOIN student s ON fi.student_id = s.id
      LEFT JOIN enrollment e ON s.id = e.student_id
      LEFT JOIN stream st ON e.stream_id = st.id
      WHERE fi.status NOT IN ('PAID', 'CANCELLED')
        AND fi.total_amount > fi.amount_paid
      GROUP BY s.id
      HAVING total_outstanding > 0
      ORDER BY total_outstanding DESC
    `).all(asOfDate, asOfDate, asOfDate, asOfDate)
  }

  private fetchAuditTrailData(params: Record<string, unknown>): unknown[] {
    let query = `
      SELECT 
        a.created_at,
        u.full_name as user_name,
        a.action_type,
        a.table_name,
        a.record_id,
        a.old_values,
        a.new_values
      FROM audit_log a
      LEFT JOIN user u ON a.user_id = u.id
      WHERE a.created_at BETWEEN ? AND ?
    `
    const queryParams: unknown[] = [
      params.startDate + ' 00:00:00',
      params.endDate + ' 23:59:59'
    ]

    if (params.actionType) {
      query += ' AND a.action_type = ?'
      queryParams.push(params.actionType)
    }

    if (params.tableName) {
      query += ' AND a.table_name = ?'
      queryParams.push(params.tableName)
    }

    query += ' ORDER BY a.created_at DESC LIMIT 1000'

    return this.db.prepare(query).all(...queryParams)
  }

  private async generatePDF(
    reportId: string,
    data: unknown[],
    parameters: Record<string, unknown>
  ): Promise<Buffer> {
    const pdfExporter = getPDFExporter()
    const reportDef = this.getAvailableReports().find(r => r.id === reportId)!

    // Build PDF sections based on report type
    const sections = this.buildPDFSections(reportId, data, parameters)

    return pdfExporter.generateReport(sections, {
      title: reportDef.name,
      subtitle: this.buildReportSubtitle(parameters),
      orientation: data.length > 0 && Object.keys(data[0] as object).length > 6 ? 'landscape' : 'portrait',
    })
  }

  private buildPDFSections(
    reportId: string,
    data: unknown[],
    parameters: Record<string, unknown>
  ): Array<{ type: string; content?: string; data?: unknown }> {
    const reportDef = this.getAvailableReports().find(r => r.id === reportId)!
    const sections: Array<{ type: string; content?: string; data?: unknown }> = []

    sections.push({ type: 'title', content: reportDef.name })
    sections.push({ type: 'subtitle', content: this.buildReportSubtitle(parameters) })
    sections.push({ type: 'spacer' })

    if (data.length === 0) {
      sections.push({ type: 'text', content: 'No data available for the selected criteria.' })
      return sections
    }

    // Add summary section for certain reports
    if (reportId === 'fee-collection') {
      const total = (data as Array<{ amount: number }>).reduce((sum, r) => sum + r.amount, 0)
      sections.push({
        type: 'summary',
        data: {
          items: [
            { label: 'Total Transactions', value: data.length },
            { label: 'Total Collected', value: this.formatCurrency(total), highlight: true },
          ],
          columns: 2
        }
      })
      sections.push({ type: 'spacer' })
    }

    // Add data table
    const columns = this.getColumnsForReport(reportId)
    sections.push({
      type: 'table',
      data: {
        headers: columns.map(c => c.header),
        rows: data.map(row => columns.map(c => this.formatCellValue(row, c.key, c.format))),
        columnAlignments: columns.map(c => c.align || 'left'),
      }
    })

    return sections
  }

  private getColumnsForReport(reportId: string): Array<{
    key: string
    header: string
    align?: 'left' | 'center' | 'right'
    format?: 'currency' | 'date' | 'number'
  }> {
    switch (reportId) {
      case 'fee-collection':
        return [
          { key: 'transaction_date', header: 'Date', format: 'date' },
          { key: 'admission_number', header: 'Adm No' },
          { key: 'student_name', header: 'Student Name' },
          { key: 'stream_name', header: 'Class' },
          { key: 'amount', header: 'Amount', align: 'right', format: 'currency' },
          { key: 'payment_method', header: 'Method' },
          { key: 'receipt_number', header: 'Receipt' },
        ]
      case 'fee-defaulters':
        return [
          { key: 'admission_number', header: 'Adm No' },
          { key: 'student_name', header: 'Student Name' },
          { key: 'stream_name', header: 'Class' },
          { key: 'guardian_phone', header: 'Guardian Phone' },
          { key: 'total_amount', header: 'Total Due', align: 'right', format: 'currency' },
          { key: 'amount_paid', header: 'Paid', align: 'right', format: 'currency' },
          { key: 'balance', header: 'Balance', align: 'right', format: 'currency' },
          { key: 'days_overdue', header: 'Days Overdue', align: 'center', format: 'number' },
        ]
      case 'aged-receivables':
        return [
          { key: 'admission_number', header: 'Adm No' },
          { key: 'student_name', header: 'Student Name' },
          { key: 'stream_name', header: 'Class' },
          { key: 'current_30', header: 'Current (0-30)', align: 'right', format: 'currency' },
          { key: 'days_31_60', header: '31-60 Days', align: 'right', format: 'currency' },
          { key: 'days_61_90', header: '61-90 Days', align: 'right', format: 'currency' },
          { key: 'over_90', header: 'Over 90 Days', align: 'right', format: 'currency' },
          { key: 'total_outstanding', header: 'Total', align: 'right', format: 'currency' },
        ]
      default:
        return []
    }
  }

  private formatCellValue(row: unknown, key: string, format?: string): string {
    const value = (row as Record<string, unknown>)[key]
    
    if (value === null || value === undefined) return '-'
    
    switch (format) {
      case 'currency':
        return this.formatCurrency(value as number)
      case 'date':
        return new Date(value as string).toLocaleDateString('en-GB')
      case 'number':
        return String(value)
      default:
        return String(value)
    }
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount / 100)
  }

  private buildReportSubtitle(parameters: Record<string, unknown>): string {
    const parts: string[] = []
    
    if (parameters.startDate && parameters.endDate) {
      const start = new Date(parameters.startDate as string).toLocaleDateString('en-GB')
      const end = new Date(parameters.endDate as string).toLocaleDateString('en-GB')
      parts.push(`Period: ${start} to ${end}`)
    }

    parts.push(`Generated: ${new Date().toLocaleString()}`)

    return parts.join(' • ')
  }

  private async generateExcel(
    reportId: string,
    data: unknown[],
    parameters: Record<string, unknown>
  ): Promise<Buffer> {
    const columns = this.getColumnsForReport(reportId).map(col => ({
      key: col.key,
      header: col.header,
      width: 15,
      numFmt: col.format === 'currency' ? '#,##0.00' : undefined,
    }))

    const reportDef = this.getAvailableReports().find(r => r.id === reportId)!

    return excelExporter.export(
      data as Record<string, unknown>[],
      columns,
      {
        title: reportDef.name,
        subtitle: this.buildReportSubtitle(parameters),
        sheetName: reportDef.name.substring(0, 31),
      }
    )
  }

  private generateCSV(reportId: string, data: unknown[]): Buffer {
    const columns = this.getColumnsForReport(reportId).map(col => ({
      key: col.key,
      header: col.header,
    }))

    return csvExporter.exportToBuffer(
      data as Record<string, unknown>[],
      columns,
      { numberFormat: 'formatted' }
    )
  }

  private async saveToFile(
    data: Buffer | string,
    reportName: string,
    extension: string
  ): Promise<string | null> {
    const defaultPath = path.join(
      app.getPath('documents'),
      `${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.${extension}`
    )

    const result = await dialog.showSaveDialog({
      defaultPath,
      filters: [
        { name: extension.toUpperCase(), extensions: [extension] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    const buffer = typeof data === 'string' ? Buffer.from(data) : data
    fs.writeFileSync(result.filePath, buffer)

    return result.filePath
  }
}

export const reportEngine = new ReportEngine()
```

---

## 2.3 Period Locking & Transaction Controls

### Objective
Implement financial period closure to prevent backdating and ensure data integrity.

```typescript name=electron/main/services/finance/PeriodService.ts
import { BaseService } from '../base/BaseService'
import { logAudit } from '../../database/utils/audit'

export interface FinancialPeriod {
  id: number
  period_name: string
  period_type: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  start_date: string
  end_date: string
  academic_year_id: number | null
  term_id: number | null
  is_locked: boolean
  locked_at: string | null
  locked_by_user_id: number | null
  unlock_reason: string | null
  created_at: string
  // Computed
  academic_year_name?: string
  term_name?: string
  locked_by_name?: string
  transaction_count?: number
  total_income?: number
  total_expense?: number
}

export interface PeriodFilters {
  academic_year_id?: number
  period_type?: FinancialPeriod['period_type']
  is_locked?: boolean
}

export class PeriodService extends BaseService<
  FinancialPeriod,
  Omit<FinancialPeriod, 'id' | 'created_at' | 'is_locked' | 'locked_at' | 'locked_by_user_id'>,
  Partial<FinancialPeriod>,
  PeriodFilters
> {
  protected tableName = 'financial_period'
  protected primaryKey = 'id'

  protected buildSelectQuery(): string {
    return `
      SELECT 
        fp.*,
        ay.year_name as academic_year_name,
        t.term_name,
        u.full_name as locked_by_name,
        (SELECT COUNT(*) FROM ledger_transaction lt 
         WHERE lt.transaction_date BETWEEN fp.start_date AND fp.end_date 
         AND lt.is_voided = 0) as transaction_count,
        (SELECT COALESCE(SUM(amount), 0) FROM ledger_transaction lt 
         WHERE lt.transaction_date BETWEEN fp.start_date AND fp.end_date 
         AND lt.debit_credit = 'CREDIT' AND lt.is_voided = 0) as total_income,
        (SELECT COALESCE(SUM(amount), 0) FROM ledger_transaction lt 
         WHERE lt.transaction_date BETWEEN fp.start_date AND fp.end_date 
         AND lt.debit_credit = 'DEBIT' AND lt.is_voided = 0) as total_expense
      FROM financial_period fp
      LEFT JOIN academic_year ay ON fp.academic_year_id = ay.id
      LEFT JOIN term t ON fp.term_id = t.id
      LEFT JOIN user u ON fp.locked_by_user_id = u.id
    `
  }

  protected mapRowToEntity(row: unknown): FinancialPeriod {
    return row as FinancialPeriod
  }

  protected validateCreate(data: unknown): string[] | null {
    const errors: string[] = []
    const d = data as Partial<FinancialPeriod>

    if (!d.period_name?.trim()) errors.push('Period name is required')
    if (!d.start_date) errors.push('Start date is required')
    if (!d.end_date) errors.push('End date is required')
    if (d.start_date && d.end_date && new Date(d.start_date) >= new Date(d.end_date)) {
      errors.push('End date must be after start date')
    }

    return errors.length > 0 ? errors : null
  }

  protected async validateUpdate(id: number, data: Partial<FinancialPeriod>): Promise<string[] | null> {
    const existing = await this.findById(id)
    if (!existing) return ['Period not found']
    if (existing.is_locked) return ['Cannot modify a locked period']
    return null
  }

  protected executeCreate(data: unknown): { lastInsertRowid: number | bigint } {
    const d = data as Partial<FinancialPeriod>
    return this.db.prepare(`
      INSERT INTO financial_period (period_name, period_type, start_date, end_date, academic_year_id, term_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      d.period_name,
      d.period_type || 'MONTHLY',
      d.start_date,
      d.end_date,
      d.academic_year_id || null,
      d.term_id || null
    )
  }

  protected executeUpdate(id: number, data: Partial<FinancialPeriod>): void {
    const sets: string[] = []
    const params: unknown[] = []

    if (data.period_name !== undefined) {
      sets.push('period_name = ?')
      params.push(data.period_name)
    }
    if (data.start_date !== undefined) {
      sets.push('start_date = ?')
      params.push(data.start_date)
    }
    if (data.end_date !== undefined) {
      sets.push('end_date = ?')
      params.push(data.end_date)
    }

    if (sets.length > 0) {
      params.push(id)
      this.db.prepare(`UPDATE financial_period SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
  }

  /**
   * Lock a financial period - prevents all modifications to transactions within the period
   */
  async lockPeriod(periodId: number, userId: number): Promise<{ success: boolean; errors?: string[] }> {
    const period = await this.findById(periodId)
    if (!period) {
      return { success: false, errors: ['Period not found'] }
    }

    if (period.is_locked) {
      return { success: false, errors: ['Period is already locked'] }
    }

    // Check for any pending approvals or draft transactions
    const pendingItems = this.db.prepare(`
      SELECT COUNT(*) as count FROM ledger_transaction
      WHERE transaction_date BETWEEN ? AND ?
        AND (is_voided = 1 OR status = 'PENDING')
    `).get(period.start_date, period.end_date) as { count: number }

    if (pendingItems.count > 0) {
      return { 
        success: false, 
        errors: [`Cannot lock period: ${pendingItems.count} pending or voided transactions exist`] 
      }
    }

    this.db.prepare(`
      UPDATE financial_period 
      SET is_locked = 1, locked_at = CURRENT_TIMESTAMP, locked_by_user_id = ?
      WHERE id = ?
    `).run(userId, periodId)

    logAudit(userId, 'LOCK', 'financial_period', periodId, { is_locked: false }, { is_locked: true })

    return { success: true }
  }

  /**
   * Unlock a financial period (requires special authorization)
   */
  async unlockPeriod(
    periodId: number, 
    userId: number, 
    reason: string
  ): Promise<{ success: boolean; errors?: string[] }> {
    const period = await this.findById(periodId)
    if (!period) {
      return { success: false, errors: ['Period not found'] }
    }

    if (!period.is_locked) {
      return { success: false, errors: ['Period is not locked'] }
    }

    if (!reason?.trim()) {
      return { success: false, errors: ['Unlock reason is required'] }
    }

    // Check user has ADMIN role (should be enforced at IPC level too)
    const user = this.db.prepare('SELECT role FROM user WHERE id = ?').get(userId) as { role: string } | undefined
    if (!user || user.role !== 'ADMIN') {
      return { success: false, errors: ['Only administrators can unlock periods'] }
    }

    this.db.prepare(`
      UPDATE financial_period 
      SET is_locked = 0, unlock_reason = ?
      WHERE id = ?
    `).run(reason, periodId)

    logAudit(userId, 'UNLOCK', 'financial_period', periodId, 
      { is_locked: true }, 
      { is_locked: false, unlock_reason: reason }
    )

    return { success: true }
  }

  /**
   * Check if a date falls within a locked period
   */
  isDateLocked(transactionDate: string): boolean {
    const result = this.db.prepare(`
      SELECT 1 FROM financial_period
      WHERE is_locked = 1
        AND ? BETWEEN start_date AND end_date
      LIMIT 1
    `).get(transactionDate)

    return !!result
  }

  /**
   * Get the period that contains a specific date
   */
  getPeriodForDate(date: string): FinancialPeriod | null {
    const query = this.buildSelectQuery() + ' WHERE ? BETWEEN fp.start_date AND fp.end_date LIMIT 1'
    const row = this.db.prepare(query).get(date)
    return row ? this.mapRowToEntity(row) : null
  }

  /**
   * Auto-generate monthly periods for an academic year
   */
  async generateMonthlyPeriods(
    academicYearId: number,
    userId: number
  ): Promise<{ success: boolean; periodsCreated: number; errors?: string[] }> {
    const year = this.db.prepare('SELECT * FROM academic_year WHERE id = ?').get(academicYearId) as {
      id: number
      year_name: string
      start_date: string
      end_date: string
    } | undefined

    if (!year) {
      return { success: false, periodsCreated: 0, errors: ['Academic year not found'] }
    }

    const startDate = new Date(year.start_date)
    const endDate = new Date(year.end_date)
    let periodsCreated = 0

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO financial_period (period_name, period_type, start_date, end_date, academic_year_id)
      VALUES (?, 'MONTHLY', ?, ?, ?)
    `)

    const current = new Date(startDate)
    while (current <= endDate) {
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1)
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0)
      
      const periodName = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      
      const result = insertStmt.run(
        periodName,
        monthStart.toISOString().slice(0, 10),
        monthEnd.toISOString().slice(0, 10),
        academicYearId
      )

      if (result.changes > 0) {
        periodsCreated++
      }

      current.setMonth(current.getMonth() + 1)
    }

    logAudit(userId, 'CREATE', 'financial_period', null, null, { 
      action: 'generate_monthly_periods',
      academic_year_id: academicYearId,
      periods_created: periodsCreated
    })

    return { success: true, periodsCreated }
  }
}

export const periodService = new PeriodService()
```

---

## Phase 2 Deliverables Summary

| Deliverable | Status | Description |
|-------------|--------|-------------|
| Budget Service & UI | 🆕 | Complete budget CRUD, line items, approval workflow |
| Budget vs Actual Reports | 🆕 | Variance analysis with visual indicators |
| PDF Export (Puppeteer) | 🆕 | Professional PDF generation with headers/footers |
| Excel Export (ExcelJS) | 🆕 | Styled Excel exports with frozen headers |
| CSV Export | 🆕 | Clean CSV exports with proper escaping |
| Report Engine | 🆕 | Unified report generation interface |
| Aged Receivables Report | 🆕 | 30/60/90 day aging analysis |
| Period Locking | 🆕 | Lock/unlock financial periods |
| Transaction Date Validation | 🆕 | Prevent entries in locked periods |

---

# Phase 3: Advanced Financial Features
**Duration: 4-5 weeks**
**Goal: Implement bank reconciliation, approval workflows, and fixed assets**

---

## 3.1 Bank Reconciliation Module

### Objective
Match bank statement entries with system transactions for accurate financial reporting.

```typescript name=electron/main/services/finance/BankReconciliationService.ts
import { BaseService } from '../base/BaseService'
import { logAudit } from '../../database/utils/audit'

export interface BankAccount {
  id: number
  account_name: string
  account_number: string
  bank_name: string
  branch: string | null
  swift_code: string | null
  currency: string
  opening_balance: number
  current_balance: number
  is_active: boolean
  created_at: string
}

export interface BankStatement {
  id: number
  bank_account_id: number
  statement_date: string
  opening_balance: number
  closing_balance: number
  statement_reference: string | null
  file_path: string | null
  status: 'PENDING' | 'RECONCILED' | 'PARTIAL'
  reconciled_by_user_id: number | null
  reconciled_at: string | null
  created_at: string
  // Computed
  bank_name?: string
  account_number?: string
  lines?: BankStatementLine[]
  matched_count?: number
  unmatched_count?: number
}

export interface BankStatementLine {
  id: number
  bank_statement_id: number
  transaction_date: string
  description: string
  reference: string | null
  debit_amount: number
  credit_amount: number
  running_balance: number | null
  is_matched: boolean
  matched_transaction_id: number | null
  created_at: string
  // For matching
  suggested_matches?: SuggestedMatch[]
}

export interface SuggestedMatch {
  transaction_id: number
  transaction_date: string
  amount: number
  description: string
  confidence: number // 0-100
  match_reason: string
}

export interface ReconciliationSummary {
  statement_balance: number
  book_balance: number
  uncleared_deposits: number
  uncleared_payments: number
  bank_charges: number
  adjusted_bank_balance: number
  adjusted_book_balance: number
  difference: number
  is_reconciled: boolean
}

export class BankReconciliationService {
  private db = require('../../database').getDatabase()

  /**
   * Get all bank accounts
   */
  getBankAccounts(): BankAccount[] {
    return this.db.prepare('SELECT * FROM bank_account WHERE is_active = 1 ORDER BY account_name').all()
  }

  /**
   * Create a bank account
   */
  createBankAccount(data: Omit<BankAccount, 'id' | 'created_at' | 'current_balance'>, userId: number): { success: boolean; id?: number; errors?: string[] } {
    if (!data.account_name?.trim()) return { success: false, errors: ['Account name is required'] }
    if (!data.account_number?.trim()) return { success: false, errors: ['Account number is required'] }
    if (!data.bank_name?.trim()) return { success: false, errors: ['Bank name is required'] }

    const result = this.db.prepare(`
      INSERT INTO bank_account (account_name, account_number, bank_name, branch, swift_code, currency, opening_balance, current_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.account_name,
      data.account_number,
      data.bank_name,
      data.branch || null,
      data.swift_code || null,
      data.currency || 'KES',
      data.opening_balance || 0,
      data.opening_balance || 0
    )

    logAudit(userId, 'CREATE', 'bank_account', result.lastInsertRowid as number, null, data)

    return { success: true, id: result.lastInsertRowid as number }
  }

  /**
   * Import bank statement (from CSV/Excel data)
   */
  importBankStatement(
    bankAccountId: number,
    statementDate: string,
    openingBalance: number,
    closingBalance: number,
    lines: Array<{
      transaction_date: string
      description: string
      reference?: string
      debit_amount?: number
      credit_amount?: number
    }>,
    userId: number
  ): { success: boolean; statementId?: number; linesImported?: number; errors?: string[] } {
    try {
      return this.db.transaction(() => {
        // Create statement
        const stmtResult = this.db.prepare(`
          INSERT INTO bank_statement (bank_account_id, statement_date, opening_balance, closing_balance, status)
          VALUES (?, ?, ?, ?, 'PENDING')
        `).run(bankAccountId, statementDate, openingBalance, closingBalance)

        const statementId = stmtResult.lastInsertRowid as number

        // Import lines
        const insertLine = this.db.prepare(`
          INSERT INTO bank_statement_line (bank_statement_id, transaction_date, description, reference, debit_amount, credit_amount)
          VALUES (?, ?, ?, ?, ?, ?)
        `)

        for (const line of lines) {
          insertLine.run(
            statementId,
            line.transaction_date,
            line.description,
            line.reference || null,
            line.debit_amount || 0,
            line.credit_amount || 0
          )
        }

        logAudit(userId, 'CREATE', 'bank_statement', statementId, null, {
          bank_account_id: bankAccountId,
          lines_count: lines.length
        })

        return { success: true, statementId, linesImported: lines.length }
      })()
    } catch (error) {
      return { success: false, errors: [error instanceof Error ? error.message : 'Import failed'] }
    }
  }

  /**
   * Get statement with lines
   */
  getStatement(statementId: number): BankStatement | null {
    const statement = this.db.prepare(`
      SELECT bs.*, ba.bank_name, ba.account_number,
        (SELECT COUNT(*) FROM bank_statement_line WHERE bank_statement_id = bs.id AND is_matched = 1) as matched_count,
        (SELECT COUNT(*) FROM bank_statement_line WHERE bank_statement_id = bs.id AND is_matched = 0) as unmatched_count
      FROM bank_statement bs
      JOIN bank_account ba ON bs.bank_account_id = ba.id
      WHERE bs.id = ?
    `).get(statementId) as BankStatement | undefined

    if (!statement) return null

    statement.lines = this.db.prepare(`
      SELECT * FROM bank_statement_line 
      WHERE bank_statement_id = ? 
      ORDER BY transaction_date, id
    `).all(statementId) as BankStatementLine[]

    return statement
  }

  /**
   * Find suggested matches for a bank statement line
   */
  findSuggestedMatches(lineId: number): SuggestedMatch[] {
    const line = this.db.prepare('SELECT * FROM bank_statement_line WHERE id = ?').get(lineId) as BankStatementLine | undefined
    if (!line) return []

    const amount = line.debit_amount || line.credit_amount
    const isDebit = line.debit_amount > 0

    // Search for transactions with matching amount (within tolerance) and date (within 5 days)
    const candidates = this.db.prepare(`
      SELECT 
        lt.id as transaction_id,
        lt.transaction_date,
        lt.amount,
        lt.description,
        lt.payment_reference
      FROM ledger_transaction lt
      LEFT JOIN bank_statement_line bsl ON bsl.matched_transaction_id = lt.id
      WHERE bsl.id IS NULL  -- Not already matched
        AND lt.is_voided = 0
        AND lt.debit_credit = ?
        AND ABS(lt.amount - ?) <= ?  -- Amount tolerance (1% or 100 KES)
        AND ABS(julianday(lt.transaction_date) - julianday(?)) <= 5  -- Date tolerance
      ORDER BY ABS(lt.amount - ?), ABS(julianday(lt.transaction_date) - julianday(?))
      LIMIT 10
    `).all(
      isDebit ? 'DEBIT' : 'CREDIT',
      amount,
      Math.max(amount * 0.01, 100),
      line.transaction_date,
      amount,
      line.transaction_date
    ) as Array<{
      transaction_id: number
      transaction_date: string
      amount: number
      description: string
      payment_reference: string | null
    }>

    return candidates.map(c => {
      let confidence = 50

      // Exact amount match
      if (c.amount === amount) confidence += 30

      // Exact date match
      if (c.transaction_date === line.transaction_date) confidence += 15

      // Reference match
      if (line.reference && c.payment_reference && 
          c.payment_reference.toLowerCase().includes(line.reference.toLowerCase())) {
        confidence += 20
      }

      // Description similarity (simple check)
      const lineWords = line.description.toLowerCase().split(/\s+/)
      const txWords = c.description.toLowerCase().split(/\s+/)
      const commonWords = lineWords.filter(w => txWords.includes(w)).length
      if (commonWords >= 2) confidence += 10

      return {
        transaction_id: c.transaction_id,
        transaction_date: c.transaction_date,
        amount: c.amount,
        description: c.description,
        confidence: Math.min(confidence, 100),
        match_reason: this.buildMatchReason(c.amount === amount, c.transaction_date === line.transaction_date)
      }
    }).sort((a, b) => b.confidence - a.confidence)
  }

  private buildMatchReason(amountMatch: boolean, dateMatch: boolean): string {
    const reasons: string[] = []
    if (amountMatch) reasons.push('Exact amount')
    if (dateMatch) reasons.push('Same date')
    return reasons.length > 0 ? reasons.join(', ') : 'Approximate match'
  }

  /**
   * Match a bank line to a transaction
   */
  matchLine(lineId: number, transactionId: number, userId: number): { success: boolean; errors?: string[] } {
    const line = this.db.prepare('SELECT * FROM bank_statement_line WHERE id = ?').get(lineId)
    if (!line) return { success: false, errors: ['Line not found'] }

    const transaction = this.db.prepare('SELECT * FROM ledger_transaction WHERE id = ?').get(transactionId)
    if (!transaction) return { success: false, errors: ['Transaction not found'] }

    this.db.prepare(`
      UPDATE bank_statement_line SET is_matched = 1, matched_transaction_id = ? WHERE id = ?
    `).run(transactionId, lineId)

    logAudit(userId, 'UPDATE', 'bank_statement_line', lineId, 
      { is_matched: false }, 
      { is_matched: true, matched_transaction_id: transactionId }
    )

    return { success: true }
  }

  /**
   * Unmatch a line
   */
  unmatchLine(lineId: number, userId: number): { success: boolean } {
    this.db.prepare(`
      UPDATE bank_statement_line SET is_matched = 0, matched_transaction_id = NULL WHERE id = ?
    `).run(lineId)

    logAudit(userId, 'UPDATE', 'bank_statement_line', lineId, 
      { is_matched: true }, 
      { is_matched: false }
    )

    return { success: true }
  }

  /**
   * Auto-match lines using the matching algorithm
   */
  autoMatch(statementId: number, userId: number): { matched: number; unmatched: number } {
    const statement = this.getStatement(statementId)
    if (!statement) return { matched: 0, unmatched: 0 }

    let matched = 0
    let unmatched = 0

    for (const line of statement.lines || []) {
      if (line.is_matched) {
        matched++
        continue
      }

      const suggestions = this.findSuggestedMatches(line.id)
      const bestMatch = suggestions.find(s => s.confidence >= 80)

      if (bestMatch) {
        this.matchLine(line.id, bestMatch.transaction_id, userId)
        matched++
      } else {
        unmatched++
      }
    }

    return { matched, unmatched }
  }

    /**
   * Calculate reconciliation summary
   */
  getReconciliationSummary(statementId: number): ReconciliationSummary {
    const statement = this.getStatement(statementId)
    if (!statement) {
      return {
        statement_balance: 0,
        book_balance: 0,
        uncleared_deposits: 0,
        uncleared_payments: 0,
        bank_charges: 0,
        adjusted_bank_balance: 0,
        adjusted_book_balance: 0,
        difference: 0,
        is_reconciled: false
      }
    }

    // Get book balance (from system transactions)
    const bookData = this.db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN debit_credit = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits,
        COALESCE(SUM(CASE WHEN debit_credit = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits
      FROM ledger_transaction
      WHERE is_voided = 0
        AND transaction_date <= ?
        AND payment_method IN ('BANK_TRANSFER', 'CHEQUE')
    `).get(statement.statement_date) as { total_credits: number; total_debits: number }

    const bookBalance = bookData.total_credits - bookData.total_debits

    // Uncleared deposits (in system, not yet on statement)
    const unclearedDeposits = this.db.prepare(`
      SELECT COALESCE(SUM(lt.amount), 0) as total
      FROM ledger_transaction lt
      LEFT JOIN bank_statement_line bsl ON bsl.matched_transaction_id = lt.id
      WHERE lt.is_voided = 0
        AND lt.debit_credit = 'CREDIT'
        AND lt.payment_method IN ('BANK_TRANSFER', 'CHEQUE')
        AND lt.transaction_date <= ?
        AND bsl.id IS NULL
    `).get(statement.statement_date) as { total: number }

    // Uncleared payments (in system, not yet on statement)
    const unclearedPayments = this.db.prepare(`
      SELECT COALESCE(SUM(lt.amount), 0) as total
      FROM ledger_transaction lt
      LEFT JOIN bank_statement_line bsl ON bsl.matched_transaction_id = lt.id
      WHERE lt.is_voided = 0
        AND lt.debit_credit = 'DEBIT'
        AND lt.payment_method IN ('BANK_TRANSFER', 'CHEQUE')
        AND lt.transaction_date <= ?
        AND bsl.id IS NULL
    `).get(statement.statement_date) as { total: number }

    // Bank charges from adjustments
    const adjustments = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM reconciliation_adjustment
      WHERE bank_statement_id = ?
        AND adjustment_type = 'BANK_CHARGE'
    `).get(statementId) as { total: number }

    const adjustedBankBalance = statement.closing_balance - unclearedDeposits.total + unclearedPayments.total
    const adjustedBookBalance = bookBalance - adjustments.total
    const difference = adjustedBankBalance - adjustedBookBalance

    return {
      statement_balance: statement.closing_balance,
      book_balance: bookBalance,
      uncleared_deposits: unclearedDeposits.total,
      uncleared_payments: unclearedPayments.total,
      bank_charges: adjustments.total,
      adjusted_bank_balance: adjustedBankBalance,
      adjusted_book_balance: adjustedBookBalance,
      difference,
      is_reconciled: Math.abs(difference) < 100 // Within 1 KES tolerance
    }
  }

  /**
   * Add reconciliation adjustment (bank charges, interest, errors)
   */
  addAdjustment(
    statementId: number,
    adjustmentType: 'BANK_CHARGE' | 'INTEREST' | 'ERROR' | 'TIMING' | 'OTHER',
    amount: number,
    description: string,
    userId: number
  ): { success: boolean; id?: number; errors?: string[] } {
    if (!description?.trim()) {
      return { success: false, errors: ['Description is required'] }
    }

    const result = this.db.prepare(`
      INSERT INTO reconciliation_adjustment (bank_statement_id, adjustment_type, amount, description, created_by_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(statementId, adjustmentType, amount, description, userId)

    logAudit(userId, 'CREATE', 'reconciliation_adjustment', result.lastInsertRowid as number, null, {
      statement_id: statementId,
      type: adjustmentType,
      amount,
      description
    })

    return { success: true, id: result.lastInsertRowid as number }
  }

  /**
   * Complete reconciliation
   */
  completeReconciliation(statementId: number, userId: number): { success: boolean; errors?: string[] } {
    const summary = this.getReconciliationSummary(statementId)

    if (!summary.is_reconciled) {
      return { 
        success: false, 
        errors: [`Reconciliation difference of ${summary.difference} exists. Please resolve all discrepancies.`] 
      }
    }

    this.db.prepare(`
      UPDATE bank_statement 
      SET status = 'RECONCILED', reconciled_by_user_id = ?, reconciled_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId, statementId)

    logAudit(userId, 'RECONCILE', 'bank_statement', statementId, { status: 'PENDING' }, { status: 'RECONCILED' })

    return { success: true }
  }

  /**
   * Get statements for a bank account
   */
  getStatements(bankAccountId: number): BankStatement[] {
    return this.db.prepare(`
      SELECT bs.*, ba.bank_name, ba.account_number,
        (SELECT COUNT(*) FROM bank_statement_line WHERE bank_statement_id = bs.id AND is_matched = 1) as matched_count,
        (SELECT COUNT(*) FROM bank_statement_line WHERE bank_statement_id = bs.id AND is_matched = 0) as unmatched_count
      FROM bank_statement bs
      JOIN bank_account ba ON bs.bank_account_id = ba.id
      WHERE bs.bank_account_id = ?
      ORDER BY bs.statement_date DESC
    `).all(bankAccountId) as BankStatement[]
  }
}

export const bankReconciliationService = new BankReconciliationService()
```

### Bank Reconciliation UI

```tsx name=src/pages/Finance/BankReconciliation/ReconciliationWorkspace.tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Check, X, Link2, Unlink, Zap,
  AlertCircle, CheckCircle, Clock, ArrowRight,
  DollarSign, TrendingUp, TrendingDown
} from 'lucide-react'
import { formatCurrency, formatDate } from '../../../utils/format'
import { useAuthStore } from '../../../stores'
import { StatCard } from '../../../components/patterns/StatCard'
import { Badge } from '../../../components/ui/Badge'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../contexts/ToastContext'

interface BankStatementLine {
  id: number
  transaction_date: string
  description: string
  reference: string | null
  debit_amount: number
  credit_amount: number
  is_matched: boolean
  matched_transaction_id: number | null
  suggested_matches?: SuggestedMatch[]
}

interface SuggestedMatch {
  transaction_id: number
  transaction_date: string
  amount: number
  description: string
  confidence: number
  match_reason: string
}

interface ReconciliationSummary {
  statement_balance: number
  book_balance: number
  uncleared_deposits: number
  uncleared_payments: number
  bank_charges: number
  adjusted_bank_balance: number
  adjusted_book_balance: number
  difference: number
  is_reconciled: boolean
}

export default function ReconciliationWorkspace() {
  const { statementId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { showToast } = useToast()

  const [statement, setStatement] = useState<any>(null)
  const [lines, setLines] = useState<BankStatementLine[]>([])
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedLine, setSelectedLine] = useState<BankStatementLine | null>(null)
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [autoMatching, setAutoMatching] = useState(false)
  const [completing, setCompleting] = useState(false)

  const loadData = useCallback(async () => {
    if (!statementId) return

    setLoading(true)
    try {
      const [stmtData, summaryData] = await Promise.all([
        window.electronAPI.getBankStatement(Number(statementId)),
        window.electronAPI.getReconciliationSummary(Number(statementId))
      ])

      setStatement(stmtData)
      setLines(stmtData?.lines || [])
      setSummary(summaryData)
    } catch (error) {
      console.error('Failed to load reconciliation data:', error)
      showToast('Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }, [statementId, showToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAutoMatch = async () => {
    setAutoMatching(true)
    try {
      const result = await window.electronAPI.autoMatchBankStatement(Number(statementId), user!.id)
      showToast(`Matched ${result.matched} transactions. ${result.unmatched} remain unmatched.`, 'success')
      loadData()
    } catch (error) {
      showToast('Auto-match failed', 'error')
    } finally {
      setAutoMatching(false)
    }
  }

  const handleMatchLine = async (lineId: number, transactionId: number) => {
    try {
      await window.electronAPI.matchBankLine(lineId, transactionId, user!.id)
      showToast('Transaction matched', 'success')
      setShowMatchModal(false)
      setSelectedLine(null)
      loadData()
    } catch (error) {
      showToast('Failed to match', 'error')
    }
  }

  const handleUnmatch = async (lineId: number) => {
    try {
      await window.electronAPI.unmatchBankLine(lineId, user!.id)
      showToast('Match removed', 'success')
      loadData()
    } catch (error) {
      showToast('Failed to unmatch', 'error')
    }
  }

  const handleComplete = async () => {
    setCompleting(true)
    try {
      const result = await window.electronAPI.completeReconciliation(Number(statementId), user!.id)
      if (result.success) {
        showToast('Reconciliation completed successfully!', 'success')
        navigate('/bank-reconciliation')
      } else {
        showToast(result.errors?.[0] || 'Cannot complete reconciliation', 'error')
      }
    } catch (error) {
      showToast('Failed to complete reconciliation', 'error')
    } finally {
      setCompleting(false)
    }
  }

  const openMatchModal = async (line: BankStatementLine) => {
    try {
      const suggestions = await window.electronAPI.findBankMatchSuggestions(line.id)
      setSelectedLine({ ...line, suggested_matches: suggestions })
      setShowMatchModal(true)
    } catch (error) {
      showToast('Failed to load suggestions', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!statement) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-16 h-16 mx-auto text-red-400 mb-4" />
        <p className="text-lg text-foreground/60">Statement not found</p>
      </div>
    )
  }

  const matchedCount = lines.filter(l => l.is_matched).length
  const unmatchedCount = lines.length - matchedCount

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/bank-reconciliation')}
            className="p-2 hover:bg-white/10 rounded-lg"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Bank Reconciliation
            </h1>
            <p className="text-foreground/50">
              {statement.bank_name} - {statement.account_number} • {formatDate(statement.statement_date)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAutoMatch}
            disabled={autoMatching || statement.status === 'RECONCILED'}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Zap className={`w-4 h-4 ${autoMatching ? 'animate-pulse' : ''}`} />
            {autoMatching ? 'Matching...' : 'Auto-Match'}
          </button>
          
          <button
            onClick={handleComplete}
            disabled={completing || !summary?.is_reconciled || statement.status === 'RECONCILED'}
            className="btn btn-primary flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            {completing ? 'Completing...' : 'Complete Reconciliation'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Statement Balance"
          value={formatCurrency(summary?.statement_balance || 0)}
          icon={DollarSign}
          color="from-blue-500/20 to-indigo-500/20 text-blue-400"
        />
        <StatCard
          label="Book Balance"
          value={formatCurrency(summary?.book_balance || 0)}
          icon={DollarSign}
          color="from-emerald-500/20 to-teal-500/20 text-emerald-400"
        />
        <StatCard
          label="Matched / Total"
          value={`${matchedCount} / ${lines.length}`}
          icon={Link2}
          color="from-purple-500/20 to-violet-500/20 text-purple-400"
        />
        <StatCard
          label="Difference"
          value={formatCurrency(Math.abs(summary?.difference || 0))}
          icon={summary?.is_reconciled ? CheckCircle : AlertCircle}
          color={summary?.is_reconciled 
            ? "from-green-500/20 to-emerald-500/20 text-green-400"
            : "from-red-500/20 to-rose-500/20 text-red-400"
          }
        />
      </div>

      {/* Reconciliation Details */}
      {summary && (
        <div className="card">
          <h3 className="text-lg font-bold text-white mb-4">Reconciliation Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-secondary/30 rounded-xl">
              <p className="text-xs text-foreground/40 uppercase font-bold mb-1">Uncleared Deposits</p>
              <p className="text-lg font-bold text-amber-400">
                {formatCurrency(summary.uncleared_deposits)}
              </p>
            </div>
            <div className="p-4 bg-secondary/30 rounded-xl">
              <p className="text-xs text-foreground/40 uppercase font-bold mb-1">Uncleared Payments</p>
              <p className="text-lg font-bold text-amber-400">
                {formatCurrency(summary.uncleared_payments)}
              </p>
            </div>
            <div className="p-4 bg-secondary/30 rounded-xl">
              <p className="text-xs text-foreground/40 uppercase font-bold mb-1">Adjusted Bank</p>
              <p className="text-lg font-bold text-white">
                {formatCurrency(summary.adjusted_bank_balance)}
              </p>
            </div>
            <div className="p-4 bg-secondary/30 rounded-xl">
              <p className="text-xs text-foreground/40 uppercase font-bold mb-1">Adjusted Book</p>
              <p className="text-lg font-bold text-white">
                {formatCurrency(summary.adjusted_book_balance)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Statement Lines */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Statement Lines</h3>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-green-400">
              <CheckCircle className="w-4 h-4" /> {matchedCount} Matched
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <Clock className="w-4 h-4" /> {unmatchedCount} Pending
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-bold text-foreground/40 uppercase border-b border-white/10">
                <th className="text-left py-3 px-4">Date</th>
                <th className="text-left py-3 px-4">Description</th>
                <th className="text-left py-3 px-4">Reference</th>
                <th className="text-right py-3 px-4">Debit</th>
                <th className="text-right py-3 px-4">Credit</th>
                <th className="text-center py-3 px-4">Status</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {lines.map(line => (
                <tr key={line.id} className={`hover:bg-white/5 ${line.is_matched ? 'bg-green-500/5' : ''}`}>
                  <td className="py-3 px-4 text-sm">{formatDate(line.transaction_date)}</td>
                  <td className="py-3 px-4 text-sm font-medium text-white">{line.description}</td>
                  <td className="py-3 px-4 text-sm text-foreground/60">{line.reference || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right font-mono text-red-400">
                    {line.debit_amount > 0 ? formatCurrency(line.debit_amount) : '-'}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-mono text-green-400">
                    {line.credit_amount > 0 ? formatCurrency(line.credit_amount) : '-'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {line.is_matched ? (
                      <Badge color="green" size="sm">Matched</Badge>
                    ) : (
                      <Badge color="amber" size="sm">Pending</Badge>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      {line.is_matched ? (
                        <button
                          onClick={() => handleUnmatch(line.id)}
                          className="p-1.5 hover:bg-red-500/20 text-red-400 rounded"
                          title="Remove match"
                          disabled={statement.status === 'RECONCILED'}
                        >
                          <Unlink className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => openMatchModal(line)}
                          className="p-1.5 hover:bg-primary/20 text-primary rounded"
                          title="Find match"
                          disabled={statement.status === 'RECONCILED'}
                        >
                          <Link2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Match Modal */}
      <Modal
        isOpen={showMatchModal}
        onClose={() => {
          setShowMatchModal(false)
          setSelectedLine(null)
        }}
        title="Match Transaction"
        size="lg"
      >
        {selectedLine && (
          <div className="space-y-6">
            {/* Bank Line Details */}
            <div className="p-4 bg-secondary/30 rounded-xl">
              <p className="text-xs text-foreground/40 uppercase font-bold mb-2">Bank Statement Entry</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-foreground/60">Date</p>
                  <p className="font-medium">{formatDate(selectedLine.transaction_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-foreground/60">Amount</p>
                  <p className="font-medium font-mono">
                    {formatCurrency(selectedLine.debit_amount || selectedLine.credit_amount)}
                    <span className={`ml-2 text-xs ${selectedLine.debit_amount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      ({selectedLine.debit_amount > 0 ? 'DR' : 'CR'})
                    </span>
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-foreground/60">Description</p>
                  <p className="font-medium">{selectedLine.description}</p>
                </div>
              </div>
            </div>

            {/* Suggested Matches */}
            <div>
              <p className="text-sm font-bold text-white mb-3">Suggested Matches</p>
              {selectedLine.suggested_matches?.length === 0 ? (
                <div className="text-center py-8 text-foreground/40">
                  No matching transactions found
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {selectedLine.suggested_matches?.map(match => (
                    <div
                      key={match.transaction_id}
                      className="p-4 border border-white/10 rounded-xl hover:border-primary/50 cursor-pointer transition-colors"
                      onClick={() => handleMatchLine(selectedLine.id, match.transaction_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-white">{match.description}</p>
                          <p className="text-sm text-foreground/60">
                            {formatDate(match.transaction_date)} • {formatCurrency(match.amount)}
                          </p>
                          <p className="text-xs text-foreground/40 mt-1">{match.match_reason}</p>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${
                            match.confidence >= 80 ? 'text-green-400' :
                            match.confidence >= 50 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {match.confidence}%
                          </div>
                          <p className="text-xs text-foreground/40">confidence</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
```

---

## 3.2 Approval Workflow Engine

### Objective
Implement configurable multi-level approval workflows for expenses, budgets, and void requests.

```typescript name=electron/main/services/workflows/ApprovalWorkflowService.ts
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface ApprovalWorkflow {
  id: number
  workflow_name: string
  entity_type: 'EXPENSE' | 'BUDGET' | 'INVOICE_VOID' | 'REFUND' | 'PAYROLL'
  is_active: boolean
  created_at: string
  steps?: ApprovalStep[]
}

export interface ApprovalStep {
  id: number
  workflow_id: number
  step_order: number
  approver_role: string
  min_amount: number
  max_amount: number | null
  is_mandatory: boolean
}

export interface ApprovalRequest {
  id: number
  workflow_id: number
  entity_type: string
  entity_id: number
  current_step: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  requested_by_user_id: number
  final_approver_user_id: number | null
  completed_at: string | null
  created_at: string
  // Computed
  workflow_name?: string
  requested_by_name?: string
  entity_details?: Record<string, unknown>
  actions?: ApprovalAction[]
  current_step_info?: ApprovalStep
  can_approve?: boolean
}

export interface ApprovalAction {
  id: number
  request_id: number
  step_id: number
  action: 'APPROVED' | 'REJECTED' | 'RETURNED'
  comments: string | null
  acted_by_user_id: number
  acted_at: string
  acted_by_name?: string
}

export class ApprovalWorkflowService {
  private db = getDatabase()

  /**
   * Get all workflows
   */
  getWorkflows(): ApprovalWorkflow[] {
    const workflows = this.db.prepare(`
      SELECT * FROM approval_workflow ORDER BY entity_type, workflow_name
    `).all() as ApprovalWorkflow[]

    for (const workflow of workflows) {
      workflow.steps = this.db.prepare(`
        SELECT * FROM approval_step WHERE workflow_id = ? ORDER BY step_order
      `).all(workflow.id) as ApprovalStep[]
    }

    return workflows
  }

  /**
   * Get workflow for entity type
   */
  getWorkflowForEntity(entityType: string, amount?: number): ApprovalWorkflow | null {
    const workflow = this.db.prepare(`
      SELECT * FROM approval_workflow 
      WHERE entity_type = ? AND is_active = 1
      LIMIT 1
    `).get(entityType) as ApprovalWorkflow | undefined

    if (!workflow) return null

    // Get applicable steps based on amount
    workflow.steps = this.db.prepare(`
      SELECT * FROM approval_step 
      WHERE workflow_id = ?
        AND (? IS NULL OR min_amount <= ?)
        AND (max_amount IS NULL OR max_amount >= ?)
      ORDER BY step_order
    `).all(workflow.id, amount, amount, amount) as ApprovalStep[]

    return workflow
  }

  /**
   * Create approval workflow
   */
  createWorkflow(
    name: string,
    entityType: ApprovalWorkflow['entity_type'],
    steps: Omit<ApprovalStep, 'id' | 'workflow_id'>[],
    userId: number
  ): { success: boolean; id?: number; errors?: string[] } {
    if (!name?.trim()) {
      return { success: false, errors: ['Workflow name is required'] }
    }

    if (steps.length === 0) {
      return { success: false, errors: ['At least one approval step is required'] }
    }

    try {
      return this.db.transaction(() => {
        const result = this.db.prepare(`
          INSERT INTO approval_workflow (workflow_name, entity_type, is_active)
          VALUES (?, ?, 1)
        `).run(name, entityType)

        const workflowId = result.lastInsertRowid as number

        const insertStep = this.db.prepare(`
          INSERT INTO approval_step (workflow_id, step_order, approver_role, min_amount, max_amount, is_mandatory)
          VALUES (?, ?, ?, ?, ?, ?)
        `)

        steps.forEach((step, index) => {
          insertStep.run(
            workflowId,
            index + 1,
            step.approver_role,
            step.min_amount || 0,
            step.max_amount || null,
            step.is_mandatory ? 1 : 0
          )
        })

        logAudit(userId, 'CREATE', 'approval_workflow', workflowId, null, { name, entityType, steps_count: steps.length })

        return { success: true, id: workflowId }
      })()
    } catch (error) {
      return { success: false, errors: [error instanceof Error ? error.message : 'Failed to create workflow'] }
    }
  }

  /**
   * Submit entity for approval
   */
  submitForApproval(
    entityType: string,
    entityId: number,
    amount: number,
    userId: number
  ): { success: boolean; requestId?: number; errors?: string[] } {
    const workflow = this.getWorkflowForEntity(entityType, amount)
    
    if (!workflow) {
      // No approval required
      return { success: true }
    }

    if (!workflow.steps || workflow.steps.length === 0) {
      // No applicable steps for this amount
      return { success: true }
    }

    // Check if already pending
    const existing = this.db.prepare(`
      SELECT id FROM approval_request 
      WHERE entity_type = ? AND entity_id = ? AND status = 'PENDING'
    `).get(entityType, entityId)

    if (existing) {
      return { success: false, errors: ['An approval request is already pending for this item'] }
    }

    const result = this.db.prepare(`
      INSERT INTO approval_request (workflow_id, entity_type, entity_id, current_step, status, requested_by_user_id)
      VALUES (?, ?, ?, 1, 'PENDING', ?)
    `).run(workflow.id, entityType, entityId, userId)

    logAudit(userId, 'SUBMIT_APPROVAL', entityType, entityId, null, {
      workflow_id: workflow.id,
      request_id: result.lastInsertRowid
    })

    return { success: true, requestId: result.lastInsertRowid as number }
  }

  /**
   * Get pending approval requests for a user based on their role
   */
  getPendingApprovals(userId: number): ApprovalRequest[] {
    const user = this.db.prepare('SELECT role FROM user WHERE id = ?').get(userId) as { role: string } | undefined
    if (!user) return []

    const requests = this.db.prepare(`
      SELECT 
        ar.*,
        aw.workflow_name,
        u.full_name as requested_by_name
      FROM approval_request ar
      JOIN approval_workflow aw ON ar.workflow_id = aw.id
      JOIN user u ON ar.requested_by_user_id = u.id
      JOIN approval_step ast ON ast.workflow_id = ar.workflow_id AND ast.step_order = ar.current_step
      WHERE ar.status = 'PENDING'
        AND ast.approver_role = ?
      ORDER BY ar.created_at DESC
    `).all(user.role) as ApprovalRequest[]

    // Enrich with entity details
    for (const request of requests) {
      request.entity_details = this.getEntityDetails(request.entity_type, request.entity_id)
      request.current_step_info = this.db.prepare(`
        SELECT * FROM approval_step 
        WHERE workflow_id = ? AND step_order = ?
      `).get(request.workflow_id, request.current_step) as ApprovalStep | undefined

      request.actions = this.db.prepare(`
        SELECT aa.*, u.full_name as acted_by_name
        FROM approval_action aa
        JOIN user u ON aa.acted_by_user_id = u.id
        WHERE aa.request_id = ?
        ORDER BY aa.acted_at
      `).all(request.id) as ApprovalAction[]
    }

    return requests
  }

  /**
   * Get entity details for display in approval list
   */
  private getEntityDetails(entityType: string, entityId: number): Record<string, unknown> {
    switch (entityType) {
      case 'EXPENSE':
        return this.db.prepare(`
          SELECT lt.*, tc.category_name
          FROM ledger_transaction lt
          LEFT JOIN transaction_category tc ON lt.category_id = tc.id
          WHERE lt.id = ?
        `).get(entityId) as Record<string, unknown> || {}

      case 'BUDGET':
        return this.db.prepare(`
          SELECT b.*, ay.year_name as academic_year_name
          FROM budget b
          LEFT JOIN academic_year ay ON b.academic_year_id = ay.id
          WHERE b.id = ?
        `).get(entityId) as Record<string, unknown> || {}

      case 'INVOICE_VOID':
        return this.db.prepare(`
          SELECT fi.*, s.first_name || ' ' || s.last_name as student_name
          FROM fee_invoice fi
          JOIN student s ON fi.student_id = s.id
          WHERE fi.id = ?
        `).get(entityId) as Record<string, unknown> || {}

      default:
        return {}
    }
  }

  /**
   * Process approval action
   */
  processApproval(
    requestId: number,
    action: 'APPROVED' | 'REJECTED' | 'RETURNED',
    comments: string | null,
    userId: number
  ): { success: boolean; completed?: boolean; errors?: string[] } {
    const request = this.db.prepare(`
      SELECT ar.*, aw.workflow_name
      FROM approval_request ar
      JOIN approval_workflow aw ON ar.workflow_id = aw.id
      WHERE ar.id = ?
    `).get(requestId) as ApprovalRequest | undefined

    if (!request) {
      return { success: false, errors: ['Approval request not found'] }
    }

    if (request.status !== 'PENDING') {
      return { success: false, errors: ['This request has already been processed'] }
    }

    // Get current step
    const currentStep = this.db.prepare(`
      SELECT * FROM approval_step 
      WHERE workflow_id = ? AND step_order = ?
    `).get(request.workflow_id, request.current_step) as ApprovalStep | undefined

    if (!currentStep) {
      return { success: false, errors: ['Invalid workflow step'] }
    }

    // Verify user can approve
    const user = this.db.prepare('SELECT role FROM user WHERE id = ?').get(userId) as { role: string } | undefined
    if (!user || user.role !== currentStep.approver_role) {
      return { success: false, errors: ['You are not authorized to process this approval'] }
    }

    try {
      return this.db.transaction(() => {
        // Record the action
        this.db.prepare(`
          INSERT INTO approval_action (request_id, step_id, action, comments, acted_by_user_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(requestId, currentStep.id, action, comments, userId)

        if (action === 'REJECTED') {
          // Rejection ends the process
          this.db.prepare(`
            UPDATE approval_request 
            SET status = 'REJECTED', completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(requestId)

          this.onRejection(request.entity_type, request.entity_id, userId)

          logAudit(userId, 'REJECT', 'approval_request', requestId, { status: 'PENDING' }, { status: 'REJECTED' })

          return { success: true, completed: true }
        }

        if (action === 'RETURNED') {
          // Return to previous step or requester
          if (request.current_step > 1) {
            this.db.prepare(`
              UPDATE approval_request SET current_step = current_step - 1 WHERE id = ?
            `).run(requestId)
          }
          return { success: true, completed: false }
        }

        // APPROVED - check if there are more steps
        const nextStep = this.db.prepare(`
          SELECT * FROM approval_step 
          WHERE workflow_id = ? AND step_order = ?
        `).get(request.workflow_id, request.current_step + 1) as ApprovalStep | undefined

        if (nextStep) {
          // Move to next step
          this.db.prepare(`
            UPDATE approval_request SET current_step = current_step + 1 WHERE id = ?
          `).run(requestId)

          return { success: true, completed: false }
        } else {
          // Final approval
          this.db.prepare(`
            UPDATE approval_request 
            SET status = 'APPROVED', final_approver_user_id = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(userId, requestId)

          this.onApproval(request.entity_type, request.entity_id, userId)

          logAudit(userId, 'APPROVE', 'approval_request', requestId, { status: 'PENDING' }, { status: 'APPROVED' })

          return { success: true, completed: true }
        }
      })()
    } catch (error) {
      return { success: false, errors: [error instanceof Error ? error.message : 'Processing failed'] }
    }
  }

  /**
   * Handle post-approval actions
   */
  private onApproval(entityType: string, entityId: number, userId: number): void {
    switch (entityType) {
      case 'BUDGET':
        this.db.prepare(`UPDATE budget SET status = 'APPROVED', approved_at = CURRENT_TIMESTAMP WHERE id = ?`).run(entityId)
        break
      case 'EXPENSE':
        this.db.prepare(`UPDATE ledger_transaction SET status = 'APPROVED' WHERE id = ?`).run(entityId)
        break
      case 'INVOICE_VOID':
        this.db.prepare(`UPDATE fee_invoice SET status = 'VOIDED' WHERE id = ?`).run(entityId)
        break
    }
  }

  /**
   * Handle post-rejection actions
   */
  private onRejection(entityType: string, entityId: number, userId: number): void {
    switch (entityType) {
      case 'BUDGET':
        this.db.prepare(`UPDATE budget SET status = 'REJECTED' WHERE id = ?`).run(entityId)
        break
      case 'EXPENSE':
        this.db.prepare(`UPDATE ledger_transaction SET status = 'REJECTED' WHERE id = ?`).run(entityId)
        break
    }
  }

  /**
   * Check if entity requires approval
   */
  requiresApproval(entityType: string, amount: number): boolean {
    const workflow = this.getWorkflowForEntity(entityType, amount)
    return workflow !== null && (workflow.steps?.length || 0) > 0
  }

  /**
   * Get approval history for an entity
   */
  getApprovalHistory(entityType: string, entityId: number): ApprovalRequest[] {
    return this.db.prepare(`
      SELECT 
        ar.*,
        aw.workflow_name,
        u1.full_name as requested_by_name,
        u2.full_name as final_approver_name
      FROM approval_request ar
      JOIN approval_workflow aw ON ar.workflow_id = aw.id
      JOIN user u1 ON ar.requested_by_user_id = u1.id
      LEFT JOIN user u2 ON ar.final_approver_user_id = u2.id
      WHERE ar.entity_type = ? AND ar.entity_id = ?
      ORDER BY ar.created_at DESC
    `).all(entityType, entityId) as ApprovalRequest[]
  }
}

export const approvalWorkflowService = new ApprovalWorkflowService()
```

---

## 3.3 Fixed Assets Register

### Objective
Track school assets, depreciation, and disposals.

```typescript name=electron/main/services/assets/FixedAssetService.ts
import { BaseService } from '../base/BaseService'
import { logAudit } from '../../database/utils/audit'

export interface AssetCategory {
  id: number
  category_name: string
  depreciation_method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE' | 'NONE'
  useful_life_years: number
  depreciation_rate: number | null
  is_active: boolean
}

export interface FixedAsset {
  id: number
  asset_code: string
  asset_name: string
  category_id: number
  description: string | null
  serial_number: string | null
  location: string | null
  acquisition_date: string
  acquisition_cost: number
  current_value: number
  accumulated_depreciation: number
  status: 'ACTIVE' | 'DISPOSED' | 'WRITTEN_OFF' | 'TRANSFERRED'
  disposed_date: string | null
  disposed_value: number | null
  disposal_reason: string | null
  supplier_id: number | null
  warranty_expiry: string | null
  last_depreciation_date: string | null
  created_by_user_id: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Computed
  category_name?: string
  depreciation_method?: string
  net_book_value?: number
  supplier_name?: string
}

export interface AssetFilters {
  category_id?: number
  status?: FixedAsset['status']
  location?: string
  search?: string
}

export interface DepreciationRun {
  period_id: number
  assets_processed: number
  total_depreciation: number
  run_date: string
}

export class FixedAssetService extends BaseService<FixedAsset, Partial<FixedAsset>, Partial<FixedAsset>, AssetFilters> {
  protected tableName = 'fixed_asset'
  protected primaryKey = 'id'

  protected buildSelectQuery(): string {
    return `
      SELECT 
        fa.*,
        ac.category_name,
        ac.depreciation_method,
        s.supplier_name,
        (fa.acquisition_cost - fa.accumulated_depreciation) as net_book_value
      FROM fixed_asset fa
      LEFT JOIN asset_category ac ON fa.category_id = ac.id
      LEFT JOIN supplier s ON fa.supplier_id = s.id
    `
  }

  protected mapRowToEntity(row: unknown): FixedAsset {
    return row as FixedAsset
  }

  protected validateCreate(data: Partial<FixedAsset>): string[] | null {
    const errors: string[] = []
    
    if (!data.asset_code?.trim()) errors.push('Asset code is required')
    if (!data.asset_name?.trim()) errors.push('Asset name is required')
    if (!data.category_id) errors.push('Category is required')
    if (!data.acquisition_date) errors.push('Acquisition date is required')
    if (!data.acquisition_cost || data.acquisition_cost <= 0) errors.push('Acquisition cost must be positive')

    // Check unique asset code
    if (data.asset_code) {
      const existing = this.db.prepare('SELECT id FROM fixed_asset WHERE asset_code = ?').get(data.asset_code)
      if (existing) errors.push('Asset code already exists')
    }

    return errors.length > 0 ? errors : null
  }

  protected async validateUpdate(id: number, data: Partial<FixedAsset>): Promise<string[] | null> {
    const asset = await this.findById(id)
    if (!asset) return ['Asset not found']
    if (asset.status !== 'ACTIVE') return ['Cannot modify disposed or written-off assets']
    return null
  }

  protected executeCreate(data: Partial<FixedAsset>): { lastInsertRowid: number | bigint } {
    return this.db.prepare(`
      INSERT INTO fixed_asset (
        asset_code, asset_name, category_id, description, serial_number,
        location, acquisition_date, acquisition_cost, current_value,
        supplier_id, warranty_expiry, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.asset_code,
      data.asset_name,
      data.category_id,
      data.description || null,
      data.serial_number || null,
      data.location || null,
      data.acquisition_date,
      data.acquisition_cost,
      data.acquisition_cost, // Current value starts as acquisition cost
      data.supplier_id || null,
      data.warranty_expiry || null,
      data.created_by_user_id || 1
    )
  }

  protected executeUpdate(id: number, data: Partial<FixedAsset>): void {
    const sets: string[] = []
    const params: unknown[] = []

    const fields = ['asset_name', 'description', 'serial_number', 'location', 'warranty_expiry']
    for (const field of fields) {
      if (data[field as keyof FixedAsset] !== undefined) {
        sets.push(`${field} = ?`)
        params.push(data[field as keyof FixedAsset])
      }
    }

    if (sets.length > 0) {
      sets.push('updated_at = CURRENT_TIMESTAMP')
      params.push(id)
      this.db.prepare(`UPDATE fixed_asset SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
  }

  protected applyFilters(filters: AssetFilters, conditions: string[], params: unknown[]): void {
    if (filters.category_id) {
      conditions.push('fa.category_id = ?')
      params.push(filters.category_id)
    }
    if (filters.status) {
      conditions.push('fa.status = ?')
      params.push(filters.status)
    }
    if (filters.location) {
      conditions.push('fa.location = ?')
      params.push(filters.location)
    }
    if (filters.search) {
      conditions.push('(fa.asset_code LIKE ? OR fa.asset_name LIKE ? OR fa.serial_number LIKE ?)')
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`)
    }
    conditions.push('fa.deleted_at IS NULL')
  }

  /**
   * Get asset categories
   */
  getCategories(): AssetCategory[] {
    return this.db.prepare('SELECT * FROM asset_category WHERE is_active = 1 ORDER BY category_name').all() as AssetCategory[]
  }

  /**
   * Create asset category
   */
  createCategory(
    name: string,
    method: AssetCategory['depreciation_method'],
    usefulLifeYears: number,
    depreciationRate: number | null,
    userId: number
  ): { success: boolean; id?: number; errors?: string[] } {
    if (!name?.trim()) return { success: false, errors: ['Category name is required'] }

    const result = this.db.prepare(`
      INSERT INTO asset_category (category_name, depreciation_method, useful_life_years, depreciation_rate)
      VALUES (?, ?, ?, ?)
    `).run(name, method, usefulLifeYears, depreciationRate)

    logAudit(userId, 'CREATE', 'asset_category', result.lastInsertRowid as number, null, { name, method })

    return { success: true, id: result.lastInsertRowid as number }
  }

  /**
   * Run depreciation for a period
   */
  runDepreciation(periodId: number, userId: number): DepreciationRun {
    const period = this.db.prepare('SELECT * FROM financial_period WHERE id = ?').get(periodId) as {
      id: number
      end_date: string
    } | undefined

    if (!period) {
      throw new Error('Financial period not found')
    }

    let assetsProcessed = 0
    let totalDepreciation = 0

    const assets = this.db.prepare(`
      SELECT fa.*, ac.depreciation_method, ac.useful_life_years, ac.depreciation_rate
      FROM fixed_asset fa
      JOIN asset_category ac ON fa.category_id = ac.id
      WHERE fa.status = 'ACTIVE'
        AND fa.current_value > 0
        AND ac.depreciation_method != 'NONE'
        AND (fa.last_depreciation_date IS NULL OR fa.last_depreciation_date < ?)
    `).all(period.end_date) as Array<FixedAsset & {
      depreciation_method: string
      useful_life_years: number
      depreciation_rate: number | null
    }>

    this.db.transaction(() => {
      for (const asset of assets) {
        const depreciationAmount = this.calculateDepreciation(asset)
        
        if (depreciationAmount <= 0) continue

        const newAccumulatedDepreciation = asset.accumulated_depreciation + depreciationAmount
        const newCurrentValue = Math.max(0, asset.acquisition_cost - newAccumulatedDepreciation)

        // Update asset
        this.db.prepare(`
          UPDATE fixed_asset 
          SET accumulated_depreciation = ?,
              current_value = ?,
              last_depreciation_date = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newAccumulatedDepreciation, newCurrentValue, period.end_date, asset.id)

        // Record depreciation entry
        this.db.prepare(`
          INSERT INTO asset_depreciation (asset_id, depreciation_date, amount, book_value_before, book_value_after, financial_period_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          asset.id,
          period.end_date,
          depreciationAmount,
          asset.current_value,
          newCurrentValue,
          periodId
        )

        assetsProcessed++
        totalDepreciation += depreciationAmount
      }

      logAudit(userId, 'RUN_DEPRECIATION', 'financial_period', periodId, null, {
        assets_processed: assetsProcessed,
        total_depreciation: totalDepreciation
      })
    })()

    return {
      period_id: periodId,
      assets_processed: assetsProcessed,
      total_depreciation: totalDepreciation,
      run_date: new Date().toISOString()
    }
  }

  private calculateDepreciation(asset: FixedAsset & {
    depreciation_method: string
    useful_life_years: number
    depreciation_rate: number | null
  }): number {
    if (asset.current_value <= 0) return 0

    switch (asset.depreciation_method) {
      case 'STRAIGHT_LINE': {
        // Annual depreciation / 12 for monthly
        const annualDepreciation = asset.acquisition_cost / asset.useful_life_years
        return Math.round(annualDepreciation / 12)
      }

      case 'DECLINING_BALANCE': {
        const rate = asset.depreciation_rate || (100 / asset.useful_life_years)
        const annualDepreciation = asset.current_value * (rate / 100)
        return Math.round(annualDepreciation / 12)
      }

      default:
        return 0
    }
  }

  /**
   * Dispose of an asset
   */
  disposeAsset(
    assetId: number,
    disposalDate: string,
    disposalValue: number,
    reason: string,
    userId: number
  ): { success: boolean; errors?: string[] } {
    const asset = this.db.prepare('SELECT * FROM fixed_asset WHERE id = ?').get(assetId) as FixedAsset | undefined
    
    if (!asset) return { success: false, errors: ['Asset not found'] }
    if (asset.status !== 'ACTIVE') return { success: false, errors: ['Asset is not active'] }

    this.db.prepare(`
      UPDATE fixed_asset 
      SET status = 'DISPOSED',
          disposed_date = ?,
          disposed_value = ?,
          disposal_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(disposalDate, disposalValue, reason, assetId)

    logAudit(userId, 'DISPOSE', 'fixed_asset', assetId, 
      { status: 'ACTIVE' },
      { status: 'DISPOSED', disposed_date: disposalDate, disposed_value: disposalValue }
    )

    return { success: true }
  }

  /**
   * Write off an asset
   */
  writeOffAsset(assetId: number, reason: string, userId: number): { success: boolean; errors?: string[] } {
    const asset = this.db.prepare('SELECT * FROM fixed_asset WHERE id = ?').get(assetId) as FixedAsset | undefined
    
    if (!asset) return { success: false, errors: ['Asset not found'] }
    if (asset.status !== 'ACTIVE') return { success: false, errors: ['Asset is not active'] }

    this.db.prepare(`
      UPDATE fixed_asset 
      SET status = 'WRITTEN_OFF',
          disposed_date = DATE('now'),
          disposed_value = 0,
          disposal_reason = ?,
          current_value = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason, assetId)

    logAudit(userId, 'WRITE_OFF', 'fixed_asset', assetId, 
      { status: 'ACTIVE', current_value: asset.current_value },
      { status: 'WRITTEN_OFF', current_value: 0 }
    )

    return { success: true }
  }

  /**
   * Get asset register summary
   */
  getAssetSummary(): {
    total_assets: number
    total_acquisition_cost: number
    total_accumulated_depreciation: number
    total_net_book_value: number
    by_category: Array<{
      category_name: string
      count: number
      acquisition_cost: number
      net_book_value: number
    }>
  } {
    const summary = this.db.prepare(`
      SELECT 
        COUNT(*) as total_assets,
        COALESCE(SUM(acquisition_cost), 0) as total_acquisition_cost,
        COALESCE(SUM(accumulated_depreciation), 0) as total_accumulated_depreciation,
        COALESCE(SUM(acquisition_cost - accumulated_depreciation), 0) as total_net_book_value
      FROM fixed_asset
      WHERE status = 'ACTIVE' AND deleted_at IS NULL
    `).get() as {
      total_assets: number
      total_acquisition_cost: number
      total_accumulated_depreciation: number
      total_net_book_value: number
    }

    const byCategory = this.db.prepare(`
      SELECT 
        ac.category_name,
        COUNT(*) as count,
        COALESCE(SUM(fa.acquisition_cost), 0) as acquisition_cost,
        COALESCE(SUM(fa.acquisition_cost - fa.accumulated_depreciation), 0) as net_book_value
      FROM fixed_asset fa
      JOIN asset_category ac ON fa.category_id = ac.id
      WHERE fa.status = 'ACTIVE' AND fa.deleted_at IS NULL
      GROUP BY ac.id
      ORDER BY net_book_value DESC
    `).all() as Array<{
      category_name: string
      count: number
      acquisition_cost: number
      net_book_value: number
    }>

    return { ...summary, by_category: byCategory }
  }

  /**
   * Get depreciation history for an asset
   */
  getDepreciationHistory(assetId: number): Array<{
    id: number
    depreciation_date: string
    amount: number
    book_value_before: number
    book_value_after: number
    period_name: string
  }> {
    return this.db.prepare(`
      SELECT ad.*, fp.period_name
      FROM asset_depreciation ad
      LEFT JOIN financial_period fp ON ad.financial_period_id = fp.id
      WHERE ad.asset_id = ?
      ORDER BY ad.depreciation_date DESC
    `).all(assetId) as Array<{
      id: number
      depreciation_date: string
      amount: number
      book_value_before: number
      book_value_after: number
      period_name: string
    }>
  }

  /**
   * Generate unique asset code
   */
  generateAssetCode(categoryId: number): string {
    const category = this.db.prepare('SELECT category_name FROM asset_category WHERE id = ?').get(categoryId) as { category_name: string } | undefined
    
    const prefix = category?.category_name.substring(0, 3).toUpperCase() || 'AST'
    
    const lastAsset = this.db.prepare(`
      SELECT asset_code FROM fixed_asset 
      WHERE asset_code LIKE ? 
      ORDER BY asset_code DESC LIMIT 1
    `).get(`${prefix}-%`) as { asset_code: string } | undefined

    let nextNumber = 1
    if (lastAsset) {
      const match = lastAsset.asset_code.match(/(\d+)$/)
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1
      }
    }

    return `${prefix}-${String(nextNumber).padStart(5, '0')}`
  }
}

export const fixedAssetService = new FixedAssetService()
```

---

## Phase 3 Deliverables Summary

| Deliverable | Status | Description |
|-------------|--------|-------------|
| Bank Account Management | 🆕 | Create/manage multiple bank accounts |
| Bank Statement Import | 🆕 | Import CSV/Excel bank statements |
| Auto-Matching Algorithm | 🆕 | Intelligent transaction matching with confidence scores |
| Manual Matching UI | 🆕 | Interactive reconciliation workspace |
| Reconciliation Summary | 🆕 | Adjusted balances and difference calculation |
| Approval Workflow Engine | 🆕 | Configurable multi-step approvals |
| Approval Dashboard | 🆕 | Pending approvals view by role |
| Fixed Asset Register | 🆕 | Complete asset lifecycle management |
| Depreciation Engine | 🆕 | Automated monthly depreciation calculation |
| Asset Disposal/Write-off | 🆕 | Track asset disposals |

---

# Phase 4: Attendance, Notifications & Integration
**Duration: 3-4 weeks**
**Goal: Complete missing modules and add communication features**

---

## 4.1 Attendance Module

### Objective
Build complete attendance tracking with a frontend UI that connects to existing backend handlers.

### Attendance Service

```typescript name=electron/main/services/academic/AttendanceService.ts
import { BaseService } from '../base/BaseService'
import { logAudit } from '../../database/utils/audit'

export interface AttendanceRecord {
  id: number
  student_id: number
  attendance_date: string
  stream_id: number
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
  check_in_time: string | null
  check_out_time: string | null
  remarks: string | null
  recorded_by_user_id: number
  created_at: string
  // Computed
  student_name?: string
  admission_number?: string
  stream_name?: string
  recorded_by_name?: string
}

export interface AttendanceFilters {
  stream_id?: number
  attendance_date?: string
  start_date?: string
  end_date?: string
  status?: AttendanceRecord['status']
}

export interface AttendanceSummary {
  student_id: number
  student_name: string
  admission_number: string
  stream_name: string
  total_days: number
  present_days: number
  absent_days: number
  late_days: number
  excused_days: number
  attendance_percentage: number
}

export interface DailyAttendanceSheet {
  date: string
  stream_id: number
  stream_name: string
  students: Array<{
    student_id: number
    admission_number: string
    student_name: string
    status: AttendanceRecord['status'] | null
    check_in_time: string | null
    remarks: string | null
  }>
  summary: {
    total: number
    present: number
    absent: number
    late: number
    excused: number
    not_marked: number
  }
}

export class AttendanceService extends BaseService<
  AttendanceRecord,
  Partial<AttendanceRecord>,
  Partial<AttendanceRecord>,
  AttendanceFilters
> {
  protected tableName = 'attendance'
  protected primaryKey = 'id'

  protected buildSelectQuery(): string {
    return `
      SELECT 
        a.*,
        s.first_name || ' ' || s.last_name as student_name,
        s.admission_number,
        st.stream_name,
        u.full_name as recorded_by_name
      FROM attendance a
      JOIN student s ON a.student_id = s.id
      JOIN stream st ON a.stream_id = st.id
      LEFT JOIN user u ON a.recorded_by_user_id = u.id
    `
  }

  protected mapRowToEntity(row: unknown): AttendanceRecord {
    return row as AttendanceRecord
  }

  protected validateCreate(data: Partial<AttendanceRecord>): string[] | null {
    const errors: string[] = []
    
    if (!data.student_id) errors.push('Student is required')
    if (!data.attendance_date) errors.push('Attendance date is required')
    if (!data.stream_id) errors.push('Stream is required')
    if (!data.status) errors.push('Status is required')

    return errors.length > 0 ? errors : null
  }

  protected async validateUpdate(id: number, data: Partial<AttendanceRecord>): Promise<string[] | null> {
    const existing = await this.findById(id)
    if (!existing) return ['Attendance record not found']
    return null
  }

  protected executeCreate(data: Partial<AttendanceRecord>): { lastInsertRowid: number | bigint } {
    return this.db.prepare(`
      INSERT INTO attendance (student_id, attendance_date, stream_id, status, check_in_time, check_out_time, remarks, recorded_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.student_id,
      data.attendance_date,
      data.stream_id,
      data.status,
      data.check_in_time || null,
      data.check_out_time || null,
      data.remarks || null,
      data.recorded_by_user_id || 1
    )
  }

  protected executeUpdate(id: number, data: Partial<AttendanceRecord>): void {
    const sets: string[] = []
    const params: unknown[] = []

    if (data.status !== undefined) {
      sets.push('status = ?')
      params.push(data.status)
    }
    if (data.check_in_time !== undefined) {
      sets.push('check_in_time = ?')
      params.push(data.check_in_time)
    }
    if (data.check_out_time !== undefined) {
      sets.push('check_out_time = ?')
      params.push(data.check_out_time)
    }
    if (data.remarks !== undefined) {
      sets.push('remarks = ?')
      params.push(data.remarks)
    }

    if (sets.length > 0) {
      params.push(id)
      this.db.prepare(`UPDATE attendance SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
  }

  protected applyFilters(filters: AttendanceFilters, conditions: string[], params: unknown[]): void {
    if (filters.stream_id) {
      conditions.push('a.stream_id = ?')
      params.push(filters.stream_id)
    }
    if (filters.attendance_date) {
      conditions.push('a.attendance_date = ?')
      params.push(filters.attendance_date)
    }
    if (filters.start_date && filters.end_date) {
      conditions.push('a.attendance_date BETWEEN ? AND ?')
      params.push(filters.start_date, filters.end_date)
    }
    if (filters.status) {
      conditions.push('a.status = ?')
      params.push(filters.status)
    }
  }

  /**
   * Get daily attendance sheet for a stream
   */
  getDailySheet(streamId: number, date: string): DailyAttendanceSheet {
    const stream = this.db.prepare('SELECT * FROM stream WHERE id = ?').get(streamId) as { id: number; stream_name: string } | undefined
    
    if (!stream) {
      throw new Error('Stream not found')
    }

    // Get all active students in this stream
    const students = this.db.prepare(`
      SELECT 
        s.id as student_id,
        s.admission_number,
        s.first_name || ' ' || s.last_name as student_name,
        a.status,
        a.check_in_time,
        a.remarks
      FROM student s
      JOIN enrollment e ON s.id = e.student_id
      LEFT JOIN attendance a ON s.id = a.student_id AND a.attendance_date = ?
      WHERE e.stream_id = ?
        AND s.is_active = 1
        AND e.id = (SELECT MAX(id) FROM enrollment WHERE student_id = s.id)
      ORDER BY s.admission_number
    `).all(date, streamId) as Array<{
      student_id: number
      admission_number: string
      student_name: string
      status: AttendanceRecord['status'] | null
      check_in_time: string | null
      remarks: string | null
    }>

    const summary = {
      total: students.length,
      present: students.filter(s => s.status === 'PRESENT').length,
      absent: students.filter(s => s.status === 'ABSENT').length,
      late: students.filter(s => s.status === 'LATE').length,
      excused: students.filter(s => s.status === 'EXCUSED').length,
      not_marked: students.filter(s => s.status === null).length,
    }

    return {
      date,
      stream_id: streamId,
      stream_name: stream.stream_name,
      students,
      summary
    }
  }

  /**
   * Mark attendance for multiple students at once
   */
  markBulkAttendance(
    streamId: number,
    date: string,
    records: Array<{
      student_id: number
      status: AttendanceRecord['status']
      check_in_time?: string
      remarks?: string
    }>,
    userId: number
  ): { success: boolean; marked: number; errors?: string[] } {
    try {
      let marked = 0

      this.db.transaction(() => {
        const upsert = this.db.prepare(`
          INSERT INTO attendance (student_id, attendance_date, stream_id, status, check_in_time, remarks, recorded_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(student_id, attendance_date) DO UPDATE SET
            status = excluded.status,
            check_in_time = excluded.check_in_time,
            remarks = excluded.remarks,
            recorded_by_user_id = excluded.recorded_by_user_id
        `)

        for (const record of records) {
          upsert.run(
            record.student_id,
            date,
            streamId,
            record.status,
            record.check_in_time || null,
            record.remarks || null,
            userId
          )
          marked++
        }

        logAudit(userId, 'BULK_ATTENDANCE', 'attendance', null, null, {
          stream_id: streamId,
          date,
          records_count: marked
        })
      })()

      return { success: true, marked }
    } catch (error) {
      return { success: false, marked: 0, errors: [error instanceof Error ? error.message : 'Failed to mark attendance'] }
    }
  }

  /**
   * Get attendance summary for students
   */
  getAttendanceSummary(streamId: number | null, startDate: string, endDate: string): AttendanceSummary[] {
    let query = `
      SELECT 
        s.id as student_id,
        s.first_name || ' ' || s.last_name as student_name,
        s.admission_number,
        st.stream_name,
        COUNT(a.id) as total_days,
        SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present_days,
        SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent_days,
        SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END) as late_days,
        SUM(CASE WHEN a.status = 'EXCUSED' THEN 1 ELSE 0 END) as excused_days
      FROM student s
      JOIN enrollment e ON s.id = e.student_id
      JOIN stream st ON e.stream_id = st.id
      LEFT JOIN attendance a ON s.id = a.student_id AND a.attendance_date BETWEEN ? AND ?
      WHERE s.is_active = 1
        AND e.id = (SELECT MAX(id) FROM enrollment WHERE student_id = s.id)
    `
    const params: unknown[] = [startDate, endDate]

    if (streamId) {
      query += ' AND e.stream_id = ?'
      params.push(streamId)
    }

    query += ' GROUP BY s.id ORDER BY st.stream_name, s.admission_number'

    const results = this.db.prepare(query).all(...params) as Array<{
      student_id: number
      student_name: string
      admission_number: string
      stream_name: string
      total_days: number
      present_days: number
      absent_days: number
      late_days: number
      excused_days: number
    }>

    return results.map(r => ({
      ...r,
      attendance_percentage: r.total_days > 0 
        ? Math.round(((r.present_days + r.late_days) / r.total_days) * 100)
        : 0
    }))
  }

  /**
   * Get students with low attendance
   */
  getLowAttendanceStudents(threshold: number, startDate: string, endDate: string): AttendanceSummary[] {
    const allSummaries = this.getAttendanceSummary(null, startDate, endDate)
    return allSummaries.filter(s => s.attendance_percentage < threshold && s.total_days > 0)
  }

  /**
   * Get attendance for a specific student
   */
  getStudentAttendance(studentId: number, startDate: string, endDate: string): AttendanceRecord[] {
    return this.db.prepare(`
      SELECT a.*, st.stream_name
      FROM attendance a
      JOIN stream st ON a.stream_id = st.id
      WHERE a.student_id = ?
        AND a.attendance_date BETWEEN ? AND ?
      ORDER BY a.attendance_date DESC
    `).all(studentId, startDate, endDate) as AttendanceRecord[]
  }
}

export const attendanceService = new AttendanceService()
```

### Attendance UI Component

```tsx name=src/pages/Attendance/index.tsx
import { useState, useEffect, useCallback } from 'react'
import { 
  Calendar, Users, Check, X, Clock, 
  AlertCircle, ChevronLeft, ChevronRight,
  Save, Loader2, UserCheck, UserX
} from 'lucide-react'
import { useAuthStore, useAppStore } from '../../stores'
import { useToast } from '../../contexts/ToastContext'
import { formatDate } from '../../utils/format'
import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | null

interface StudentAttendance {
  student_id: number
  admission_number: string
  student_name: string
  status: AttendanceStatus
  check_in_time: string | null
  remarks: string | null
}

interface DailySheet {
  date: string
  stream_id: number
  stream_name: string
  students: StudentAttendance[]
  summary: {
    total: number
    present: number
    absent: number
    late: number
    excused: number
    not_marked: number
  }
}

const statusConfig = {
  PRESENT: { label: 'Present', icon: Check, color: 'bg-green-500', textColor: 'text-green-400' },
  ABSENT: { label: 'Absent', icon: X, color: 'bg-red-500', textColor: 'text-red-400' },
  LATE: { label: 'Late', icon: Clock, color: 'bg-amber-500', textColor: 'text-amber-400' },
  EXCUSED: { label: 'Excused', icon: AlertCircle, color: 'bg-blue-500', textColor: 'text-blue-400' },
}

export default function Attendance() {
  const { user } = useAuthStore()
  const { showToast } = useToast()
  
  const [streams, setStreams] = useState<Array<{ id: number; stream_name: string }>>([])
  const [selectedStream, setSelectedStream] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [sheet, setSheet] = useState<DailySheet | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [changes, setChanges] = useState<Map<number, { status: AttendanceStatus; remarks?: string }>>(new Map())

  // Load streams on mount
  useEffect(() => {
    const loadStreams = async () => {
      try {
        const data = await window.electronAPI.getStreams()
        setStreams(data)
        if (data.length > 0) {
          setSelectedStream(data[0].id)
        }
      } catch (error) {
        console.error('Failed to load streams:', error)
      }
    }
    loadStreams()
  }, [])

  // Load attendance sheet when stream or date changes
  const loadSheet = useCallback(async () => {
    if (!selectedStream) return

    setLoading(true)
    setChanges(new Map())
    try {
      const data = await window.electronAPI.getDailyAttendanceSheet(selectedStream, selectedDate)
      setSheet(data)
    } catch (error) {
      console.error('Failed to load attendance:', error)
      showToast('Failed to load attendance', 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedStream, selectedDate, showToast])

  useEffect(() => {
    loadSheet()
  }, [loadSheet])

  // Handle status change
  const handleStatusChange = (studentId: number, status: AttendanceStatus) => {
    setChanges(prev => {
      const newChanges = new Map(prev)
      const existing = newChanges.get(studentId) || {}
      newChanges.set(studentId, { ...existing, status })
      return newChanges
    })
  }

  // Handle remarks change
  const handleRemarksChange = (studentId: number, remarks: string) => {
    setChanges(prev => {
      const newChanges = new Map(prev)
      const existing = newChanges.get(studentId) || { status: null }
      newChanges.set(studentId, { ...existing, remarks })
      return newChanges
    })
  }

  // Mark all students with a status
  const markAll = (status: AttendanceStatus) => {
    if (!sheet) return
    
    const newChanges = new Map<number, { status: AttendanceStatus; remarks?: string }>()
    sheet.students.forEach(student => {
      newChanges.set(student.student_id, { status })
    })
    setChanges(newChanges)
  }

  // Get current status for a student (from changes or original sheet)
  const getStudentStatus = (student: StudentAttendance): AttendanceStatus => {
    const change = changes.get(student.student_id)
    return change?.status !== undefined ? change.status : student.status
  }

  // Save attendance
  const handleSave = async () => {
    if (!selectedStream || changes.size === 0) return

    setSaving(true)
    try {
      const records = Array.from(changes.entries())
        .filter(([_, data]) => data.status !== null)
        .map(([studentId, data]) => ({
          student_id: studentId,
          status: data.status!,
          remarks: data.remarks
        }))

      const result = await window.electronAPI.markBulkAttendance(
        selectedStream,
        selectedDate,
        records,
        user!.id
      )

      if (result.success) {
        showToast(`Attendance saved for ${result.marked} students`, 'success')
        setChanges(new Map())
        loadSheet()
      } else {
        showToast(result.errors?.[0] || 'Failed to save', 'error')
      }
    } catch (error) {
      showToast('Failed to save attendance', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Navigate dates
  const navigateDate = (direction: 'prev' | 'next') => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() + (direction === 'next' ? 1 : -1))
    setSelectedDate(date.toISOString().slice(0, 10))
  }

  // Calculate current summary including unsaved changes
  const getCurrentSummary = () => {
    if (!sheet) return { total: 0, present: 0, absent: 0, late: 0, excused: 0, not_marked: 0 }

    let present = 0, absent = 0, late = 0, excused = 0, not_marked = 0

    sheet.students.forEach(student => {
      const status = getStudentStatus(student)
      switch (status) {
        case 'PRESENT': present++; break
        case 'ABSENT': absent++; break
        case 'LATE': late++; break
        case 'EXCUSED': excused++; break
        default: not_marked++
      }
    })

    return { total: sheet.students.length, present, absent, late, excused, not_marked }
  }

  const summary = getCurrentSummary()
  const hasChanges = changes.size > 0

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Attendance Management"
        subtitle="Record and track daily student attendance"
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Stream Selector */}
        <div className="flex-1 min-w-[200px]">
          <select
            value={selectedStream || ''}
            onChange={(e) => setSelectedStream(Number(e.target.value))}
            className="input w-full"
            aria-label="Select class"
          >
            <option value="">Select Class</option>
            {streams.map(stream => (
              <option key={stream.id} value={stream.id}>{stream.stream_name}</option>
            ))}
          </select>
        </div>

        {/* Date Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateDate('prev')}
            className="p-2 hover:bg-white/10 rounded-lg"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="input pl-10 w-48"
            />
          </div>
          
          <button
            onClick={() => navigateDate('next')}
            disabled={selectedDate >= new Date().toISOString().slice(0, 10)}
            className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30"
            aria-label="Next day"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => markAll('PRESENT')}
            className="btn btn-secondary text-sm flex items-center gap-1"
            disabled={!sheet}
          >
            <UserCheck className="w-4 h-4" />
            Mark All Present
          </button>
          <button
            onClick={() => markAll('ABSENT')}
            className="btn btn-secondary text-sm flex items-center gap-1"
            disabled={!sheet}
          >
            <UserX className="w-4 h-4" />
            Mark All Absent
          </button>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="btn btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Attendance'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total Students"
          value={summary.total}
          icon={Users}
          color="from-slate-500/20 to-slate-700/20 text-slate-300"
          compact
        />
        <StatCard
          label="Present"
          value={summary.present}
          icon={Check}
          color="from-green-500/20 to-emerald-500/20 text-green-400"
          compact
        />
        <StatCard
          label="Absent"
          value={summary.absent}
          icon={X}
          color="from-red-500/20 to-rose-500/20 text-red-400"
          compact
        />
        <StatCard
          label="Late"
          value={summary.late}
          icon={Clock}
          color="from-amber-500/20 to-orange-500/20 text-amber-400"
          compact
        />
        <StatCard
          label="Excused"
          value={summary.excused}
          icon={AlertCircle}
          color="from-blue-500/20 to-indigo-500/20 text-blue-400"
          compact
        />
        <StatCard
          label="Not Marked"
          value={summary.not_marked}
          icon={Users}
          color="from-gray-500/20 to-gray-700/20 text-gray-400"
          compact
        />
      </div>

      {/* Attendance Sheet */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !sheet ? (
          <div className="text-center py-16 text-foreground/40">
            <Calendar className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>Select a class to view attendance</p>
          </div>
        ) : sheet.students.length === 0 ? (
          <div className="text-center py-16 text-foreground/40">
            <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>No students enrolled in this class</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">{sheet.stream_name}</h3>
                <p className="text-sm text-foreground/50">{formatDate(selectedDate)}</p>
              </div>
              {hasChanges && (
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full">
                  {changes.size} unsaved changes
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs font-bold text-foreground/40 uppercase border-b border-white/10">
                    <th className="text-left py-3 px-4">Adm No</th>
                    <th className="text-left py-3 px-4">Student Name</th>
                    <th className="text-center py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sheet.students.map(student => {
                    const currentStatus = getStudentStatus(student)
                    const isChanged = changes.has(student.student_id)

                    return (
                      <tr 
                        key={student.student_id} 
                        className={`hover:bg-white/5 ${isChanged ? 'bg-primary/5' : ''}`}
                      >
                        <td className="py-3 px-4 text-sm font-mono">{student.admission_number}</td>
                        <td className="py-3 px-4 text-sm font-medium text-white">{student.student_name}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const).map(status => {
                              const config = statusConfig[status]
                              const Icon = config.icon
                              const isActive = currentStatus === status

                              return (
                                <button
                                  key={status}
                                  onClick={() => handleStatusChange(student.student_id, status)}
                                  className={`
                                    p-2 rounded-lg transition-all
                                    ${isActive 
                                      ? `${config.color} text-white shadow-lg` 
                                      : 'bg-secondary/50 text-foreground/40 hover:bg-secondary hover:text-white'
                                    }
                                  `}
                                  title={config.label}
                                >
                                  <Icon className="w-4 h-4" />
                                </button>
                              )
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={changes.get(student.student_id)?.remarks ?? student.remarks ?? ''}
                            onChange={(e) => handleRemarksChange(student.student_id, e.target.value)}
                            placeholder="Add remarks..."
                            className="input py-1 text-sm bg-transparent border-transparent focus:border-white/20"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

---

## 4.2 SMS/Email Notification System

### Objective
Implement a complete notification system with configurable providers and templates.

```typescript name=electron/main/services/notifications/NotificationService.ts
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface NotificationProvider {
  type: 'SMS' | 'EMAIL'
  name: string
  config: Record<string, string>
  isActive: boolean
}

export interface MessageTemplate {
  id: number
  template_name: string
  template_type: 'SMS' | 'EMAIL'
  category: 'FEE_REMINDER' | 'PAYMENT_RECEIPT' | 'ATTENDANCE' | 'GENERAL' | 'PAYSLIP'
  subject: string | null
  body: string
  variables: string[] // Extracted from {{variable}} patterns
  is_active: boolean
}

export interface NotificationRequest {
  recipientType: 'STUDENT' | 'STAFF' | 'GUARDIAN'
  recipientId: number
  templateId?: number
  channel: 'SMS' | 'EMAIL'
  to: string // Phone or email
  subject?: string
  message: string
  variables?: Record<string, string>
}

export interface NotificationResult {
  success: boolean
  messageId?: string
  error?: string
  provider?: string
}

export interface SMSProviderConfig {
  provider: 'AFRICASTALKING' | 'TWILIO' | 'NEXMO' | 'CUSTOM'
  apiKey: string
  apiSecret?: string
  senderId?: string
  baseUrl?: string
}

export interface EmailProviderConfig {
  provider: 'SMTP' | 'SENDGRID' | 'MAILGUN'
  host?: string
  port?: number
  user?: string
  password?: string
  apiKey?: string
  fromEmail: string
  fromName: string
}

export class NotificationService {
  private db = getDatabase()
  private smsConfig: SMSProviderConfig | null = null
  private emailConfig: EmailProviderConfig | null = null

  constructor() {
    this.loadConfig()
  }

  private loadConfig(): void {
    try {
      const settings = this.db.prepare('SELECT * FROM settings LIMIT 1').get() as Record<string, string> | undefined
      
      if (settings?.sms_provider_config) {
        this.smsConfig = JSON.parse(settings.sms_provider_config)
      }
      
      if (settings?.email_provider_config) {
        this.emailConfig = JSON.parse(settings.email_provider_config)
      }
    } catch (error) {
      console.error('Failed to load notification config:', error)
    }
  }

  /**
   * Send notification
   */
  async send(request: NotificationRequest, userId: number): Promise<NotificationResult> {
    try {
      // Process template if provided
      let message = request.message
      let subject = request.subject

      if (request.templateId) {
        const template = this.getTemplate(request.templateId)
        if (template) {
          message = this.processTemplate(template.body, request.variables || {})
          if (template.subject) {
            subject = this.processTemplate(template.subject, request.variables || {})
          }
        }
      }

      let result: NotificationResult

      if (request.channel === 'SMS') {
        result = await this.sendSMS(request.to, message)
      } else {
        result = await this.sendEmail(request.to, subject || 'Notification', message)
      }

      // Log the communication
      this.logCommunication({
        recipientType: request.recipientType,
        recipientId: request.recipientId,
        channel: request.channel,
        to: request.to,
        subject,
        message,
        status: result.success ? 'SENT' : 'FAILED',
        externalId: result.messageId,
        errorMessage: result.error,
        userId
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      this.logCommunication({
        recipientType: request.recipientType,
        recipientId: request.recipientId,
        channel: request.channel,
        to: request.to,
        subject: request.subject,
        message: request.message,
        status: 'FAILED',
        errorMessage,
        userId
      })

      return { success: false, error: errorMessage }
    }
  }

  /**
   * Send SMS
   */
  private async sendSMS(to: string, message: string): Promise<NotificationResult> {
    if (!this.smsConfig) {
      return { success: false, error: 'SMS provider not configured' }
    }

    const normalizedPhone = this.normalizePhone(to)

    switch (this.smsConfig.provider) {
      case 'AFRICASTALKING':
        return this.sendAfricasTalking(normalizedPhone, message)
      case 'TWILIO':
        return this.sendTwilio(normalizedPhone, message)
      default:
        return { success: false, error: 'Unsupported SMS provider' }
    }
  }

  private async sendAfricasTalking(to: string, message: string): Promise<NotificationResult> {
    const config = this.smsConfig!
    
    try {
      const response = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'apiKey': config.apiKey
        },
        body: new URLSearchParams({
          username: config.apiSecret || 'sandbox',
          to,
          message,
          from: config.senderId || ''
        })
      })

      const data = await response.json()

      if (data.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
        return { 
          success: true, 
          messageId: data.SMSMessageData.Recipients[0].messageId,
          provider: 'AFRICASTALKING'
        }
      }

      return { 
        success: false, 
        error: data.SMSMessageData?.Recipients?.[0]?.status || 'Unknown error',
        provider: 'AFRICASTALKING'
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'API request failed',
        provider: 'AFRICASTALKING'
      }
    }
  }

  private async sendTwilio(to: string, message: string): Promise<NotificationResult> {
    const config = this.smsConfig!
    const accountSid = config.apiKey
    const authToken = config.apiSecret
    
    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            To: to,
            From: config.senderId || '',
            Body: message
          })
        }
      )

      const data = await response.json()

      if (data.sid) {
        return { success: true, messageId: data.sid, provider: 'TWILIO' }
      }

      return { success: false, error: data.message || 'Unknown error', provider: 'TWILIO' }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'API request failed',
        provider: 'TWILIO'
      }
    }
  }

  /**
   * Send Email
   */
  private async sendEmail(to: string, subject: string, body: string): Promise<NotificationResult> {
    if (!this.emailConfig) {
      return { success: false, error: 'Email provider not configured' }
    }

    switch (this.emailConfig.provider) {
      case 'SENDGRID':
        return this.sendSendGrid(to, subject, body)
      case 'SMTP':
        return this.sendSMTP(to, subject, body)
      default:
        return { success: false, error: 'Unsupported email provider' }
    }
  }

  private async sendSendGrid(to: string, subject: string, body: string): Promise<NotificationResult> {
    const config = this.emailConfig!

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: config.fromEmail, name: config.fromName },
          subject,
          content: [{ type: 'text/html', value: body }]
        })
      })

      if (response.status === 202) {
        return { success: true, provider: 'SENDGRID' }
      }

      const data = await response.json()
      return { success: false, error: data.errors?.[0]?.message || 'Unknown error', provider: 'SENDGRID' }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'API request failed',
        provider: 'SENDGRID'
      }
    }
  }

  private async sendSMTP(to: string, subject: string, body: string): Promise<NotificationResult> {
    // Use nodemailer for SMTP
    const nodemailer = require('nodemailer')
    const config = this.emailConfig!

    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port || 587,
        secure: config.port === 465,
        auth: {
          user: config.user,
          pass: config.password
        }
      })

      const info = await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to,
        subject,
        html: body
      })

      return { success: true, messageId: info.messageId, provider: 'SMTP' }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'SMTP error',
        provider: 'SMTP'
      }
    }
  }

  /**
   * Process template with variables
   */
  private processTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match
    })
  }

  /**
   * Normalize phone number to international format
   */
  private normalizePhone(phone: string): string {
    // Remove spaces and dashes
    let normalized = phone.replace(/[\s-]/g, '')
    
    // Handle Kenya numbers
    if (normalized.startsWith('0')) {
      normalized = '+254' + normalized.substring(1)
    } else if (normalized.startsWith('254')) {
      normalized = '+' + normalized
    } else if (!normalized.startsWith('+')) {
      normalized = '+254' + normalized
    }

    return normalized
  }

  /**
   * Log communication to database
   */
  private logCommunication(data: {
    recipientType: string
    recipientId: number
    channel: string
    to: string
    subject?: string
    message: string
    status: string
    externalId?: string
    errorMessage?: string
    userId: number
  }): void {
    this.db.prepare(`
      INSERT INTO communication_log (
        recipient_type, recipient_id, message_type, subject, message_body,
        status, external_id, error_message, sent_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.recipientType,
      data.recipientId,
      data.channel,
      data.subject || null,
      data.message,
      data.status,
      data.externalId || null,
      data.errorMessage || null,
      data.userId
    )
  }

  // ==================== Template Management ====================

  /**
   * Get all templates
   */
  getTemplates(): MessageTemplate[] {
    return this.db.prepare(`
      SELECT * FROM message_template WHERE is_active = 1 ORDER BY category, template_name
    `).all() as MessageTemplate[]
  }

  /**
   * Get template by ID
   */
  getTemplate(id: number): MessageTemplate | null {
    return this.db.prepare('SELECT * FROM message_template WHERE id = ?').get(id) as MessageTemplate | undefined || null
  }

  /**
   * Create template
   */
  createTemplate(
    name: string,
    type: 'SMS' | 'EMAIL',
    category: MessageTemplate['category'],
    subject: string | null,
    body: string,
    userId: number
  ): { success: boolean; id?: number; errors?: string[] } {
    if (!name?.trim()) return { success: false, errors: ['Template name is required'] }
    if (!body?.trim()) return { success: false, errors: ['Template body is required'] }

    // Extract variables from body
    const variableMatches = body.match(/\{\{(\w+)\}\}/g) || []
    const variables = [...new Set(variableMatches.map(m => m.replace(/[{}]/g, '')))]

    const result = this.db.prepare(`
      INSERT INTO message_template (template_name, template_type, category, subject, body, variables)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, type, category, subject, body, JSON.stringify(variables))

    logAudit(userId, 'CREATE', 'message_template', result.lastInsertRowid as number, null, { name, type, category })

    return { success: true, id: result.lastInsertRowid as number }
  }

  /**
   * Get default templates for seeding
   */
  getDefaultTemplates(): Array<Omit<MessageTemplate, 'id' | 'variables' | 'is_active'>> {
    return [
      {
        template_name: 'Fee Reminder',
        template_type: 'SMS',
        category: 'FEE_REMINDER',
        subject: null,
        body: 'Dear {{guardian_name}}, this is a reminder that {{student_name}} has an outstanding fee balance of KES {{balance}}. Please settle at your earliest convenience. Thank you.'
      },
      {
        template_name: 'Payment Confirmation',
        template_type: 'SMS',
        category: 'PAYMENT_RECEIPT',
        subject: null,
        body: 'Payment Received: KES {{amount}} for {{student_name}}. Receipt No: {{receipt_number}}. New Balance: KES {{balance}}. Thank you for your payment.'
      },
      {
        template_name: 'Absence Notification',
        template_type: 'SMS',
        category: 'ATTENDANCE',
        subject: null,
        body: 'Dear {{guardian_name}}, this is to inform you that {{student_name}} was absent from school on {{date}}. Please contact the school for any concerns.'
      },
      {
        template_name: 'Fee Reminder Email',
        template_type: 'EMAIL',
        category: 'FEE_REMINDER',
        subject: 'Fee Payment Reminder - {{student_name}}',
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e40af;">Fee Payment Reminder</h2>
            <p>Dear {{guardian_name}},</p>
            <p>This is a reminder that <strong>{{student_name}}</strong> has an outstanding fee balance.</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Student:</strong> {{student_name}}</p>
              <p style="margin: 10px 0 0;"><strong>Admission No:</strong> {{admission_number}}</p>
              <p style="margin: 10px 0 0;"><strong>Class:</strong> {{class_name}}</p>
              <p style="margin: 10px 0 0;"><strong>Outstanding Balance:</strong> <span style="color: #dc2626; font-size: 18px;">KES {{balance}}</span></p>
            </div>
            <p>Please arrange for payment at your earliest convenience.</p>
            <p>Thank you for your continued support.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #6b7280; font-size: 12px;">{{school_name}}<br>{{school_address}}</p>
          </div>
        `
      },
      {
        template_name: 'Payslip Notification',
        template_type: 'SMS',
        category: 'PAYSLIP',
        subject: null,
        body: 'Salary Notification: Your salary for {{period}} has been processed. Net Pay: KES {{net_salary}}. Thank you.'
      }
    ]
  }

  // ==================== Bulk Operations ====================

  /**
   * Send bulk fee reminders to all defaulters
   */
  async sendBulkFeeReminders(
    templateId: number,
    defaulters: Array<{
      student_id: number
      student_name: string
      guardian_name: string
      guardian_phone: string
      admission_number: string
      class_name: string
      balance: number
    }>,
    userId: number
  ): Promise<{ sent: number; failed: number; errors: string[] }> {
    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const defaulter of defaulters) {
      if (!defaulter.guardian_phone) {
        failed++
        errors.push(`${defaulter.student_name}: No phone number`)
        continue
      }

      const result = await this.send({
        recipientType: 'GUARDIAN',
        recipientId: defaulter.student_id,
        templateId,
        channel: 'SMS',
        to: defaulter.guardian_phone,
        message: '', // Will use template
        variables: {
          student_name: defaulter.student_name,
          guardian_name: defaulter.guardian_name,
          admission_number: defaulter.admission_number,
          class_name: defaulter.class_name,
          balance: String(defaulter.balance / 100) // Convert cents
        }
      }, userId)

      if (result.success) {
        sent++
      } else {
        failed++
        errors.push(`${defaulter.student_name}: ${result.error}`)
      }

      // Rate limiting - wait 100ms between messages
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return { sent, failed, errors }
  }

  /**
   * Get communication history
   */
  getCommunicationHistory(filters?: {
    recipientType?: string
    recipientId?: number
    channel?: string
    status?: string
    startDate?: string
    endDate?: string
  }): Array<{
    id: number
    recipient_type: string
    recipient_id: number
    message_type: string
    subject: string | null
    message_body: string
    status: string
    error_message: string | null
    sent_by_user_id: number
    created_at: string
    sent_by_name?: string
  }> {
    let query = `
      SELECT cl.*, u.full_name as sent_by_name
      FROM communication_log cl
      LEFT JOIN user u ON cl.sent_by_user_id = u.id
      WHERE 1=1
    `
    const params: unknown[] = []

    if (filters?.recipientType) {
      query += ' AND cl.recipient_type = ?'
      params.push(filters.recipientType)
    }
    if (filters?.recipientId) {
      query += ' AND cl.recipient_id = ?'
      params.push(filters.recipientId)
    }
    if (filters?.channel) {
      query += ' AND cl.message_type = ?'
      params.push(filters.channel)
    }
    if (filters?.status) {
      query += ' AND cl.status = ?'
      params.push(filters.status)
    }
    if (filters?.startDate && filters?.endDate) {
      query += ' AND DATE(cl.created_at) BETWEEN ? AND ?'
      params.push(filters.startDate, filters.endDate)
    }

    query += ' ORDER BY cl.created_at DESC LIMIT 500'

    return this.db.prepare(query).all(...params) as Array<{
      id: number
      recipient_type: string
      recipient_id: number
      message_type: string
      subject: string | null
      message_body: string
      status: string
      error_message: string | null
      sent_by_user_id: number
      created_at: string
      sent_by_name?: string
    }>
  }
}

export const notificationService = new NotificationService()
```

---

## 4.3 Scheduled Report Generation

### Objective
Implement automated report generation and email delivery on a schedule.

```typescript name=electron/main/services/reports/ReportScheduler.ts
import { reportEngine } from './ReportEngine'
import { notificationService } from '../notifications/NotificationService'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import * as cron from 'node-cron'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

export interface ScheduledReport {
  id: number
  report_name: string
  report_type: string
  parameters: string // JSON
  schedule_type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'TERM_END' | 'YEAR_END'
  day_of_week: number | null
  day_of_month: number | null
  time_of_day: string
  recipients: string // JSON array of emails
  export_format: 'PDF' | 'EXCEL' | 'CSV'
  is_active: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_by_user_id: number
  created_at: string
}

export class ReportScheduler {
  private db = getDatabase()
  private scheduledJobs: Map<number, cron.ScheduledTask> = new Map()
  private isRunning = false

  /**
   * Initialize the scheduler
   */
  initialize(): void {
    if (this.isRunning) return

    console.log('Initializing report scheduler...')
    
    // Load all active schedules
    const schedules = this.getActiveSchedules()
    
    for (const schedule of schedules) {
      this.scheduleReport(schedule)
    }

    // Update next run times
    this.updateNextRunTimes()

    this.isRunning = true
    console.log(`Report scheduler initialized with ${schedules.length} active schedules`)
  }

  /**
   * Stop all scheduled jobs
   */
  shutdown(): void {
    for (const [id, task] of this.scheduledJobs) {
      task.stop()
    }
    this.scheduledJobs.clear()
    this.isRunning = false
    console.log('Report scheduler shutdown')
  }

  /**
   * Get all scheduled reports
   */
  getScheduledReports(): ScheduledReport[] {
    return this.db.prepare(`
      SELECT * FROM scheduled_report ORDER BY report_name
    `).all() as ScheduledReport[]
  }

  /**
   * Get active schedules
   */
  private getActiveSchedules(): ScheduledReport[] {
    return this.db.prepare(`
      SELECT * FROM scheduled_report WHERE is_active = 1
    `).all() as ScheduledReport[]
  }

  /**
   * Create a scheduled report
   */
  createSchedule(
    data: Omit<ScheduledReport, 'id' | 'last_run_at' | 'next_run_at' | 'created_at'>,
    userId: number
  ): { success: boolean; id?: number; errors?: string[] } {
    const errors = this.validateSchedule(data)
    if (errors.length > 0) {
      return { success: false, errors }
    }

    try {
      const result = this.db.prepare(`
        INSERT INTO scheduled_report (
          report_name, report_type, parameters, schedule_type, 
          day_of_week, day_of_month, time_of_day, recipients, 
          export_format, is_active, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.report_name,
        data.report_type,
        data.parameters,
        data.schedule_type,
        data.day_of_week,
        data.day_of_month,
        data.time_of_day,
        data.recipients,
        data.export_format,
        data.is_active ? 1 : 0,
        userId
      )

      const id = result.lastInsertRowid as number

      // Schedule the job if active
      if (data.is_active) {
        const schedule = this.db.prepare('SELECT * FROM scheduled_report WHERE id = ?').get(id) as ScheduledReport
        this.scheduleReport(schedule)
        this.updateNextRunTime(id)
      }

      logAudit(userId, 'CREATE', 'scheduled_report', id, null, { report_name: data.report_name })

      return { success: true, id }
    } catch (error) {
      return { success: false, errors: [error instanceof Error ? error.message : 'Failed to create schedule'] }
    }
  }

  /**
   * Update a scheduled report
   */
  updateSchedule(
    id: number,
    data: Partial<ScheduledReport>,
    userId: number
  ): { success: boolean; errors?: string[] } {
    const existing = this.db.prepare('SELECT * FROM scheduled_report WHERE id = ?').get(id) as ScheduledReport | undefined
    if (!existing) {
      return { success: false, errors: ['Schedule not found'] }
    }

    // Stop existing job
    this.stopSchedule(id)

    // Update database
    const sets: string[] = []
    const params: unknown[] = []

    const fields = ['report_name', 'report_type', 'parameters', 'schedule_type', 
                    'day_of_week', 'day_of_month', 'time_of_day', 'recipients', 
                    'export_format', 'is_active']
    
    for (const field of fields) {
      if (data[field as keyof ScheduledReport] !== undefined) {
        sets.push(`${field} = ?`)
        params.push(data[field as keyof ScheduledReport])
      }
    }

    if (sets.length > 0) {
      params.push(id)
      this.db.prepare(`UPDATE scheduled_report SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }

    // Restart job if active
    const updated = this.db.prepare('SELECT * FROM scheduled_report WHERE id = ?').get(id) as ScheduledReport
    if (updated.is_active) {
      this.scheduleReport(updated)
      this.updateNextRunTime(id)
    }

    logAudit(userId, 'UPDATE', 'scheduled_report', id, existing, data)

    return { success: true }
  }

  /**
   * Delete a scheduled report
   */
  deleteSchedule(id: number, userId: number): { success: boolean } {
    this.stopSchedule(id)
    this.db.prepare('DELETE FROM scheduled_report WHERE id = ?').run(id)
    logAudit(userId, 'DELETE', 'scheduled_report', id, null, null)
    return { success: true }
  }

  /**
   * Run a report immediately
   */
  async runNow(id: number, userId: number): Promise<{ success: boolean; error?: string }> {
    const schedule = this.db.prepare('SELECT * FROM scheduled_report WHERE id = ?').get(id) as ScheduledReport | undefined
    if (!schedule) {
      return { success: false, error: 'Schedule not found' }
    }

    return this.executeReport(schedule, userId)
  }

  /**
   * Schedule a report job
   */
  private scheduleReport(schedule: ScheduledReport): void {
    const cronExpression = this.buildCronExpression(schedule)
    if (!cronExpression) return

    const task = cron.schedule(cronExpression, async () => {
      console.log(`Running scheduled report: ${schedule.report_name}`)
      await this.executeReport(schedule, schedule.created_by_user_id)
    })

    this.scheduledJobs.set(schedule.id, task)
    console.log(`Scheduled report ${schedule.id}: ${schedule.report_name} with cron: ${cronExpression}`)
  }

  /**
   * Stop a scheduled job
   */
  private stopSchedule(id: number): void {
    const task = this.scheduledJobs.get(id)
    if (task) {
      task.stop()
      this.scheduledJobs.delete(id)
    }
  }

  /**
   * Build cron expression from schedule
   */
  private buildCronExpression(schedule: ScheduledReport): string | null {
    const [hours, minutes] = schedule.time_of_day.split(':').map(Number)

    switch (schedule.schedule_type) {
      case 'DAILY':
        return `${minutes} ${hours} * * *`
      
      case 'WEEKLY':
        const dayOfWeek = schedule.day_of_week ?? 1 // Default to Monday
        return `${minutes} ${hours} * * ${dayOfWeek}`
      
      case 'MONTHLY':
        const dayOfMonth = schedule.day_of_month ?? 1
        return `${minutes} ${hours} ${dayOfMonth} * *`
      
      // TERM_END and YEAR_END require external triggers
      default:
        return null
    }
  }

    /**
   * Execute a report
   */
  private async executeReport(schedule: ScheduledReport, userId: number): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now()
    let status: 'SUCCESS' | 'FAILED' | 'PARTIAL' = 'SUCCESS'
    let errorMessage: string | undefined
    let filePath: string | undefined
    let recipientsNotified = 0

    try {
      // Parse parameters
      const parameters = JSON.parse(schedule.parameters || '{}')
      
      // Adjust date parameters for relative dates
      const adjustedParams = this.adjustDateParameters(parameters, schedule.schedule_type)

      // Generate report
      const result = await reportEngine.generateReport({
        reportId: schedule.report_type,
        format: schedule.export_format.toLowerCase() as 'pdf' | 'excel' | 'csv',
        parameters: adjustedParams,
        saveToFile: false
      })

      if (!result.success) {
        throw new Error(result.error || 'Report generation failed')
      }

      // Save report to temp location
      const tempDir = path.join(app.getPath('temp'), 'school-erp-reports')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }

      const extension = schedule.export_format.toLowerCase() === 'excel' ? 'xlsx' : schedule.export_format.toLowerCase()
      const fileName = `${schedule.report_name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.${extension}`
      filePath = path.join(tempDir, fileName)

      fs.writeFileSync(filePath, result.data as Buffer)

      // Send to recipients
      const recipients = JSON.parse(schedule.recipients || '[]') as string[]
      
      if (recipients.length > 0) {
        for (const email of recipients) {
          try {
            await this.sendReportEmail(email, schedule, filePath)
            recipientsNotified++
          } catch (emailError) {
            console.error(`Failed to send report to ${email}:`, emailError)
            if (status === 'SUCCESS') status = 'PARTIAL'
          }
        }
      }

      // Update last run time
      this.db.prepare(`
        UPDATE scheduled_report 
        SET last_run_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(schedule.id)

      this.updateNextRunTime(schedule.id)

    } catch (error) {
      status = 'FAILED'
      errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`Scheduled report ${schedule.id} failed:`, error)
    }

    // Log execution
    this.db.prepare(`
      INSERT INTO report_execution_log (scheduled_report_id, execution_time, status, file_path, error_message, recipients_notified)
      VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
    `).run(schedule.id, status, filePath || null, errorMessage || null, recipientsNotified)

    // Cleanup temp file after a delay
    if (filePath && fs.existsSync(filePath)) {
      setTimeout(() => {
        try {
          fs.unlinkSync(filePath!)
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 60000) // Delete after 1 minute
    }

    return { 
      success: status !== 'FAILED', 
      error: errorMessage 
    }
  }

  /**
   * Send report via email
   */
  private async sendReportEmail(to: string, schedule: ScheduledReport, attachmentPath: string): Promise<void> {
    const nodemailer = require('nodemailer')
    
    // Get email config from settings
    const settings = this.db.prepare('SELECT email_provider_config FROM settings LIMIT 1').get() as { email_provider_config: string } | undefined
    if (!settings?.email_provider_config) {
      throw new Error('Email not configured')
    }

    const config = JSON.parse(settings.email_provider_config)
    
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port || 587,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.password
      }
    })

    const fileName = path.basename(attachmentPath)

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject: `Scheduled Report: ${schedule.report_name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Scheduled Report</h2>
          <p>Please find attached the scheduled report: <strong>${schedule.report_name}</strong></p>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Report:</strong> ${schedule.report_name}</p>
            <p style="margin: 10px 0 0;"><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p style="margin: 10px 0 0;"><strong>Format:</strong> ${schedule.export_format}</p>
          </div>
          <p style="color: #6b7280; font-size: 12px;">This is an automated message from your School ERP System.</p>
        </div>
      `,
      attachments: [{
        filename: fileName,
        path: attachmentPath
      }]
    })
  }

  /**
   * Adjust date parameters based on schedule type
   */
  private adjustDateParameters(
    params: Record<string, unknown>, 
    scheduleType: ScheduledReport['schedule_type']
  ): Record<string, unknown> {
    const today = new Date()
    const adjusted = { ...params }

    // If no dates specified, use defaults based on schedule type
    if (!params.startDate || !params.endDate) {
      switch (scheduleType) {
        case 'DAILY': {
          // Yesterday
          const yesterday = new Date(today)
          yesterday.setDate(yesterday.getDate() - 1)
          adjusted.startDate = yesterday.toISOString().slice(0, 10)
          adjusted.endDate = yesterday.toISOString().slice(0, 10)
          break
        }
        case 'WEEKLY': {
          // Last 7 days
          const weekAgo = new Date(today)
          weekAgo.setDate(weekAgo.getDate() - 7)
          adjusted.startDate = weekAgo.toISOString().slice(0, 10)
          adjusted.endDate = new Date(today.setDate(today.getDate() - 1)).toISOString().slice(0, 10)
          break
        }
        case 'MONTHLY': {
          // Last month
          const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
          const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
          adjusted.startDate = lastMonth.toISOString().slice(0, 10)
          adjusted.endDate = lastMonthEnd.toISOString().slice(0, 10)
          break
        }
      }
    }

    return adjusted
  }

  /**
   * Update next run time for a schedule
   */
  private updateNextRunTime(scheduleId: number): void {
    const schedule = this.db.prepare('SELECT * FROM scheduled_report WHERE id = ?').get(scheduleId) as ScheduledReport | undefined
    if (!schedule || !schedule.is_active) return

    const cronExpression = this.buildCronExpression(schedule)
    if (!cronExpression) return

    // Calculate next run time
    const cronParser = require('cron-parser')
    try {
      const interval = cronParser.parseExpression(cronExpression)
      const nextRun = interval.next().toDate()
      
      this.db.prepare(`
        UPDATE scheduled_report SET next_run_at = ? WHERE id = ?
      `).run(nextRun.toISOString(), scheduleId)
    } catch (error) {
      console.error(`Failed to calculate next run time for schedule ${scheduleId}:`, error)
    }
  }

  /**
   * Update all next run times
   */
  private updateNextRunTimes(): void {
    const schedules = this.getActiveSchedules()
    for (const schedule of schedules) {
      this.updateNextRunTime(schedule.id)
    }
  }

  /**
   * Validate schedule data
   */
  private validateSchedule(data: Partial<ScheduledReport>): string[] {
    const errors: string[] = []

    if (!data.report_name?.trim()) errors.push('Report name is required')
    if (!data.report_type) errors.push('Report type is required')
    if (!data.schedule_type) errors.push('Schedule type is required')
    if (!data.time_of_day) errors.push('Time of day is required')
    if (!data.export_format) errors.push('Export format is required')

    // Validate time format
    if (data.time_of_day && !/^\d{2}:\d{2}$/.test(data.time_of_day)) {
      errors.push('Time must be in HH:MM format')
    }

    // Validate recipients
    if (data.recipients) {
      try {
        const recipients = JSON.parse(data.recipients)
        if (!Array.isArray(recipients)) {
          errors.push('Recipients must be an array')
        } else {
          for (const email of recipients) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              errors.push(`Invalid email: ${email}`)
            }
          }
        }
      } catch {
        errors.push('Invalid recipients format')
      }
    }

    return errors
  }

  /**
   * Get execution history for a schedule
   */
  getExecutionHistory(scheduleId: number, limit = 20): Array<{
    id: number
    execution_time: string
    status: string
    file_path: string | null
    error_message: string | null
    recipients_notified: number
  }> {
    return this.db.prepare(`
      SELECT * FROM report_execution_log 
      WHERE scheduled_report_id = ? 
      ORDER BY execution_time DESC 
      LIMIT ?
    `).all(scheduleId, limit) as Array<{
      id: number
      execution_time: string
      status: string
      file_path: string | null
      error_message: string | null
      recipients_notified: number
    }>
  }
}

export const reportScheduler = new ReportScheduler()
```

---

## 4.4 Data Import/Export Utilities

### Objective
Enable bulk data import from CSV/Excel and standardized data exports.

```typescript name=electron/main/services/data/DataImportService.ts
import * as XLSX from 'xlsx'
import * as csv from 'csv-parse/sync'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface ImportResult {
  success: boolean
  totalRows: number
  imported: number
  skipped: number
  errors: ImportError[]
}

export interface ImportError {
  row: number
  field?: string
  message: string
  data?: Record<string, unknown>
}

export interface ImportMapping {
  sourceColumn: string
  targetField: string
  transform?: (value: unknown) => unknown
  required?: boolean
  validation?: (value: unknown) => string | null
}

export interface ImportConfig {
  entityType: 'STUDENT' | 'STAFF' | 'FEE_STRUCTURE' | 'BANK_STATEMENT' | 'INVENTORY'
  mappings: ImportMapping[]
  skipDuplicates?: boolean
  duplicateKey?: string
  preProcess?: (row: Record<string, unknown>) => Record<string, unknown>
  validate?: (row: Record<string, unknown>) => string[]
}

export class DataImportService {
  private db = getDatabase()

  /**
   * Import data from file buffer
   */
  async importFromFile(
    fileBuffer: Buffer,
    fileName: string,
    config: ImportConfig,
    userId: number
  ): Promise<ImportResult> {
    // Parse file based on extension
    const extension = fileName.split('.').pop()?.toLowerCase()
    let rows: Record<string, unknown>[]

    if (extension === 'csv') {
      rows = this.parseCSV(fileBuffer)
    } else if (extension === 'xlsx' || extension === 'xls') {
      rows = this.parseExcel(fileBuffer)
    } else {
      return {
        success: false,
        totalRows: 0,
        imported: 0,
        skipped: 0,
        errors: [{ row: 0, message: 'Unsupported file format. Use CSV or Excel.' }]
      }
    }

    return this.processImport(rows, config, userId)
  }

  /**
   * Parse CSV buffer
   */
  private parseCSV(buffer: Buffer): Record<string, unknown>[] {
    const content = buffer.toString('utf-8')
    return csv.parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    })
  }

  /**
   * Parse Excel buffer
   */
  private parseExcel(buffer: Buffer): Record<string, unknown>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    return XLSX.utils.sheet_to_json(sheet)
  }

  /**
   * Process import with validation and insertion
   */
  private async processImport(
    rows: Record<string, unknown>[],
    config: ImportConfig,
    userId: number
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      totalRows: rows.length,
      imported: 0,
      skipped: 0,
      errors: []
    }

    if (rows.length === 0) {
      result.errors.push({ row: 0, message: 'No data rows found in file' })
      result.success = false
      return result
    }

    // Validate column mappings
    const sourceColumns = Object.keys(rows[0])
    for (const mapping of config.mappings) {
      if (mapping.required && !sourceColumns.includes(mapping.sourceColumn)) {
        result.errors.push({
          row: 0,
          field: mapping.sourceColumn,
          message: `Required column "${mapping.sourceColumn}" not found in file`
        })
      }
    }

    if (result.errors.length > 0) {
      result.success = false
      return result
    }

    // Process rows
    this.db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2 // +2 for 1-based index + header row
        const sourceRow = rows[i]

        try {
          // Map source to target
          let mappedRow: Record<string, unknown> = {}
          const rowErrors: string[] = []

          for (const mapping of config.mappings) {
            let value = sourceRow[mapping.sourceColumn]

            // Apply transform
            if (mapping.transform && value !== undefined) {
              try {
                value = mapping.transform(value)
              } catch (e) {
                rowErrors.push(`Transform failed for ${mapping.sourceColumn}`)
                continue
              }
            }

            // Validate
            if (mapping.validation) {
              const validationError = mapping.validation(value)
              if (validationError) {
                rowErrors.push(validationError)
              }
            }

            // Check required
            if (mapping.required && (value === undefined || value === null || value === '')) {
              rowErrors.push(`${mapping.sourceColumn} is required`)
            }

            mappedRow[mapping.targetField] = value
          }

          // Apply pre-processing
          if (config.preProcess) {
            mappedRow = config.preProcess(mappedRow)
          }

          // Custom validation
          if (config.validate) {
            const customErrors = config.validate(mappedRow)
            rowErrors.push(...customErrors)
          }

          if (rowErrors.length > 0) {
            result.errors.push({
              row: rowNum,
              message: rowErrors.join('; '),
              data: sourceRow
            })
            result.skipped++
            continue
          }

          // Check duplicates
          if (config.skipDuplicates && config.duplicateKey) {
            const exists = this.checkDuplicate(config.entityType, config.duplicateKey, mappedRow[config.duplicateKey])
            if (exists) {
              result.skipped++
              continue
            }
          }

          // Insert record
          this.insertRecord(config.entityType, mappedRow, userId)
          result.imported++

        } catch (error) {
          result.errors.push({
            row: rowNum,
            message: error instanceof Error ? error.message : 'Unknown error',
            data: sourceRow
          })
          result.skipped++
        }
      }
    })()

    // Log the import
    logAudit(userId, 'IMPORT', config.entityType.toLowerCase(), null, null, {
      total_rows: result.totalRows,
      imported: result.imported,
      skipped: result.skipped,
      errors_count: result.errors.length
    })

    result.success = result.errors.length === 0 || result.imported > 0
    return result
  }

  /**
   * Check for duplicate record
   */
  private checkDuplicate(entityType: string, keyField: string, value: unknown): boolean {
    const tableName = this.getTableName(entityType)
    const result = this.db.prepare(`SELECT 1 FROM ${tableName} WHERE ${keyField} = ? LIMIT 1`).get(value)
    return !!result
  }

  /**
   * Insert a record
   */
  private insertRecord(entityType: string, data: Record<string, unknown>, userId: number): void {
    switch (entityType) {
      case 'STUDENT':
        this.insertStudent(data, userId)
        break
      case 'STAFF':
        this.insertStaff(data, userId)
        break
      case 'FEE_STRUCTURE':
        this.insertFeeStructure(data, userId)
        break
      case 'INVENTORY':
        this.insertInventoryItem(data, userId)
        break
      default:
        throw new Error(`Unsupported entity type: ${entityType}`)
    }
  }

  private insertStudent(data: Record<string, unknown>, userId: number): void {
    this.db.prepare(`
      INSERT INTO student (
        admission_number, first_name, middle_name, last_name,
        date_of_birth, gender, student_type, admission_date,
        guardian_name, guardian_phone, guardian_email, address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.admission_number,
      data.first_name,
      data.middle_name || null,
      data.last_name,
      data.date_of_birth,
      data.gender || 'MALE',
      data.student_type || 'DAY_SCHOLAR',
      data.admission_date || new Date().toISOString().slice(0, 10),
      data.guardian_name,
      data.guardian_phone,
      data.guardian_email || null,
      data.address || null
    )
  }

  private insertStaff(data: Record<string, unknown>, userId: number): void {
    this.db.prepare(`
      INSERT INTO staff (
        staff_number, first_name, middle_name, last_name,
        email, phone, department, job_title, basic_salary,
        date_of_joining
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.staff_number,
      data.first_name,
      data.middle_name || null,
      data.last_name,
      data.email || null,
      data.phone || null,
      data.department || null,
      data.job_title || null,
      data.basic_salary || 0,
      data.date_of_joining || new Date().toISOString().slice(0, 10)
    )
  }

  private insertFeeStructure(data: Record<string, unknown>, userId: number): void {
    this.db.prepare(`
      INSERT INTO fee_structure (
        academic_year_id, term_id, stream_id, student_type,
        fee_category_id, amount
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.academic_year_id,
      data.term_id,
      data.stream_id,
      data.student_type,
      data.fee_category_id,
      data.amount
    )
  }

  private insertInventoryItem(data: Record<string, unknown>, userId: number): void {
    this.db.prepare(`
      INSERT INTO inventory_item (
        item_code, item_name, category, unit, quantity_in_stock,
        reorder_level, unit_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.item_code,
      data.item_name,
      data.category || 'GENERAL',
      data.unit || 'PCS',
      data.quantity_in_stock || 0,
      data.reorder_level || 10,
      data.unit_price || 0
    )
  }

  private getTableName(entityType: string): string {
    const map: Record<string, string> = {
      'STUDENT': 'student',
      'STAFF': 'staff',
      'FEE_STRUCTURE': 'fee_structure',
      'INVENTORY': 'inventory_item'
    }
    return map[entityType] || entityType.toLowerCase()
  }

  /**
   * Get import template for an entity type
   */
  getImportTemplate(entityType: string): {
    columns: Array<{ name: string; required: boolean; description: string; example: string }>
    sampleData: Record<string, string>[]
  } {
    switch (entityType) {
      case 'STUDENT':
        return {
          columns: [
            { name: 'admission_number', required: true, description: 'Unique admission number', example: 'ADM001' },
            { name: 'first_name', required: true, description: 'Student first name', example: 'John' },
            { name: 'middle_name', required: false, description: 'Student middle name', example: 'Mwangi' },
            { name: 'last_name', required: true, description: 'Student last name', example: 'Kamau' },
            { name: 'date_of_birth', required: true, description: 'Date of birth (YYYY-MM-DD)', example: '2010-05-15' },
            { name: 'gender', required: true, description: 'MALE or FEMALE', example: 'MALE' },
            { name: 'student_type', required: true, description: 'BOARDER or DAY_SCHOLAR', example: 'DAY_SCHOLAR' },
            { name: 'guardian_name', required: true, description: 'Parent/Guardian name', example: 'Jane Kamau' },
            { name: 'guardian_phone', required: true, description: 'Guardian phone number', example: '0712345678' },
            { name: 'guardian_email', required: false, description: 'Guardian email', example: 'jane@email.com' },
            { name: 'address', required: false, description: 'Home address', example: 'Nairobi, Kenya' },
          ],
          sampleData: [
            {
              admission_number: 'ADM001',
              first_name: 'John',
              middle_name: 'Mwangi',
              last_name: 'Kamau',
              date_of_birth: '2010-05-15',
              gender: 'MALE',
              student_type: 'DAY_SCHOLAR',
              guardian_name: 'Jane Kamau',
              guardian_phone: '0712345678',
              guardian_email: 'jane@email.com',
              address: 'Nairobi'
            }
          ]
        }

      case 'STAFF':
        return {
          columns: [
            { name: 'staff_number', required: true, description: 'Unique staff number', example: 'STF001' },
            { name: 'first_name', required: true, description: 'First name', example: 'Mary' },
            { name: 'middle_name', required: false, description: 'Middle name', example: 'Wanjiku' },
            { name: 'last_name', required: true, description: 'Last name', example: 'Njoroge' },
            { name: 'email', required: false, description: 'Email address', example: 'mary@school.com' },
            { name: 'phone', required: true, description: 'Phone number', example: '0722345678' },
            { name: 'department', required: false, description: 'Department', example: 'Teaching' },
            { name: 'job_title', required: true, description: 'Job title', example: 'Teacher' },
            { name: 'basic_salary', required: true, description: 'Monthly salary in KES', example: '45000' },
          ],
          sampleData: [
            {
              staff_number: 'STF001',
              first_name: 'Mary',
              middle_name: 'Wanjiku',
              last_name: 'Njoroge',
              email: 'mary@school.com',
              phone: '0722345678',
              department: 'Teaching',
              job_title: 'Teacher',
              basic_salary: '45000'
            }
          ]
        }

      default:
        return { columns: [], sampleData: [] }
    }
  }

  /**
   * Generate import template file
   */
  generateTemplateFile(entityType: string): Buffer {
    const template = this.getImportTemplate(entityType)
    
    const workbook = XLSX.utils.book_new()
    
    // Create data sheet
    const dataSheet = XLSX.utils.json_to_sheet(template.sampleData)
    XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data')
    
    // Create instructions sheet
    const instructions = template.columns.map(col => ({
      'Column Name': col.name,
      'Required': col.required ? 'Yes' : 'No',
      'Description': col.description,
      'Example': col.example
    }))
    const instructionsSheet = XLSX.utils.json_to_sheet(instructions)
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions')
    
    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
  }
}

export const dataImportService = new DataImportService()
```

---

## Phase 4 Deliverables Summary

| Deliverable | Status | Description |
|-------------|--------|-------------|
| Attendance Service | 🆕 | Complete CRUD with bulk operations |
| Attendance UI | 🆕 | Daily sheet view with quick marking |
| Attendance Summary | 🆕 | Statistics and low attendance alerts |
| Notification Service | 🆕 | SMS & Email with multiple providers |
| Message Templates | 🆕 | Configurable templates with variables |
| Bulk Notifications | 🆕 | Mass fee reminders |
| Report Scheduler | 🆕 | Automated report generation on schedule |
| Email Delivery | 🆕 | Automatic report distribution |
| Data Import Service | 🆕 | CSV/Excel import with validation |
| Import Templates | 🆕 | Downloadable templates with instructions |

---

# Phase 5: UI/UX Enhancements & Desktop Features
**Duration: 3-4 weeks**
**Goal: Polish the desktop experience with professional UX patterns**

---

## 5.1 Window State Persistence

### Objective
Remember window size, position, and maximized state between sessions.

```typescript name=electron/main/utils/windowState.ts
import { app, BrowserWindow, screen } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

const DEFAULT_STATE: WindowState = {
  x: 0,
  y: 0,
  width: 1280,
  height: 800,
  isMaximized: false
}

export class WindowStateManager {
  private state: WindowState
  private window: BrowserWindow | null = null
  private stateFilePath: string
  private saveTimeout: NodeJS.Timeout | null = null

  constructor(windowName: string = 'main') {
    this.stateFilePath = path.join(app.getPath('userData'), `window-state-${windowName}.json`)
    this.state = this.loadState()
  }

  /**
   * Load state from file
   */
  private loadState(): WindowState {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath, 'utf-8')
        const savedState = JSON.parse(data) as WindowState
        
        // Validate state is within screen bounds
        if (this.isValidState(savedState)) {
          return savedState
        }
      }
    } catch (error) {
      console.error('Failed to load window state:', error)
    }
    
    return { ...DEFAULT_STATE }
  }

  /**
   * Validate that window position is visible on a screen
   */
  private isValidState(state: WindowState): boolean {
    const displays = screen.getAllDisplays()
    
    return displays.some(display => {
      const { x, y, width, height } = display.bounds
      return (
        state.x >= x &&
        state.y >= y &&
        state.x + state.width <= x + width &&
        state.y + state.height <= y + height
      )
    })
  }

  /**
   * Save state to file (debounced)
   */
  private saveState(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(() => {
      try {
        fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2))
      } catch (error) {
        console.error('Failed to save window state:', error)
      }
    }, 500)
  }

  /**
   * Update state from window
   */
  private updateState(): void {
    if (!this.window || this.window.isDestroyed()) return

    const isMaximized = this.window.isMaximized()
    
    if (!isMaximized) {
      const bounds = this.window.getBounds()
      this.state.x = bounds.x
      this.state.y = bounds.y
      this.state.width = bounds.width
      this.state.height = bounds.height
    }
    
    this.state.isMaximized = isMaximized
    this.saveState()
  }

  /**
   * Manage a window's state
   */
  manage(window: BrowserWindow): void {
    this.window = window

    // Apply saved state
    if (this.state.isMaximized) {
      window.maximize()
    } else {
      window.setBounds({
        x: this.state.x,
        y: this.state.y,
        width: this.state.width,
        height: this.state.height
      })
    }

    // Listen for state changes
    window.on('resize', () => this.updateState())
    window.on('move', () => this.updateState())
    window.on('maximize', () => this.updateState())
    window.on('unmaximize', () => this.updateState())
    window.on('close', () => this.updateState())
  }

  /**
   * Get current state for window creation
   */
  getState(): WindowState {
    return { ...this.state }
  }
}

// Usage in main process
export function createMainWindow(): BrowserWindow {
  const stateManager = new WindowStateManager('main')
  const state = stateManager.getState()

  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 1024,
    minHeight: 600,
    show: false, // Show after ready
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  stateManager.manage(win)

  win.once('ready-to-show', () => {
    win.show()
  })

  return win
}
```

---

## 5.2 Native Menu Integration

### Objective
Create native application menus with keyboard shortcuts.

```typescript name=electron/main/menu/applicationMenu.ts
import { Menu, MenuItemConstructorOptions, app, shell, BrowserWindow, dialog } from 'electron'

export function createApplicationMenu(mainWindow: BrowserWindow): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    // App Menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),

    // File Menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Student',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => mainWindow.webContents.send('navigate', '/students/new')
        },
        {
          label: 'Record Payment',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => mainWindow.webContents.send('navigate', '/fee-payment')
        },
        { type: 'separator' },
        {
          label: 'Import Data...',
          accelerator: 'CmdOrCtrl+I',
          click: () => mainWindow.webContents.send('open-import-dialog')
        },
        {
          label: 'Export Data...',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('open-export-dialog')
        },
        { type: 'separator' },
        {
          label: 'Print',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow.webContents.print()
        },
        { type: 'separator' },
        {
          label: 'Backup Database',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              title: 'Backup Database',
              defaultPath: `school-erp-backup-${new Date().toISOString().slice(0, 10)}.db`,
              filters: [{ name: 'Database', extensions: ['db'] }]
            })
            if (!result.canceled && result.filePath) {
              mainWindow.webContents.send('backup-database', result.filePath)
            }
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },

    // Edit Menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const }
        ])
      ]
    },

    // View Menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' },
        { role: 'togglefullscreen' as const }
      ]
    },

    // Navigate Menu
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow.webContents.send('navigate', '/')
        },
        {
          label: 'Students',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow.webContents.send('navigate', '/students')
        },
        {
          label: 'Fee Payment',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow.webContents.send('navigate', '/fee-payment')
        },
        {
          label: 'Invoices',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow.webContents.send('navigate', '/invoices')
        },
        {
          label: 'Reports',
          accelerator: 'CmdOrCtrl+5',
          click: () => mainWindow.webContents.send('navigate', '/reports')
        },
        { type: 'separator' },
        {
          label: 'Go Back',
          accelerator: 'CmdOrCtrl+[',
          click: () => mainWindow.webContents.goBack()
        },
        {
          label: 'Go Forward',
          accelerator: 'CmdOrCtrl+]',
          click: () => mainWindow.webContents.goForward()
        },
        { type: 'separator' },
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+K',
          click: () => mainWindow.webContents.send('open-command-palette')
        }
      ]
    },

    // Reports Menu
    {
      label: 'Reports',
      submenu: [
        {
          label: 'Fee Collection Report',
          click: () => mainWindow.webContents.send('navigate', '/reports?tab=fee-collection')
        },
        {
          label: 'Fee Defaulters',
          click: () => mainWindow.webContents.send('navigate', '/reports?tab=defaulters')
        },
        {
          label: 'Financial Summary',
          click: () => mainWindow.webContents.send('navigate', '/reports?tab=financial')
        },
        { type: 'separator' },
        {
          label: 'Attendance Report',
          click: () => mainWindow.webContents.send('navigate', '/reports/attendance')
        },
        {
          label: 'Student Enrollment',
          click: () => mainWindow.webContents.send('navigate', '/reports/enrollment')
        },
        { type: 'separator' },
        {
          label: 'Audit Log',
          click: () => mainWindow.webContents.send('navigate', '/audit-log')
        }
      ]
    },

    // Window Menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const }
        ])
      ]
    },

    // Help Menu
    {
      role: 'help' as const,
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => mainWindow.webContents.send('show-shortcuts-help')
        },
        {
          label: 'Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/Lameck1/mwingi-school-erp/wiki')
          }
        },
        {
          label: 'Report Issue',
          click: async () => {
            await shell.openExternal('https://github.com/Lameck1/mwingi-school-erp/issues')
          }
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => mainWindow.webContents.send('check-for-updates')
        },
        { type: 'separator' },
        {
          label: `About ${app.name}`,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: `About ${app.name}`,
              message: `${app.name}`,
              detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChrome: ${process.versions.chrome}`
            })
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
```

---

## 5.3 Auto-Update System

### Objective
Implement automatic updates for the desktop application.

```typescript name=electron/main/updates/autoUpdater.ts
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import log from 'electron-log'

// Configure logging
autoUpdater.logger = log
log.transports.file.level = 'info'

export class AutoUpdateManager {
  private mainWindow: BrowserWindow
  private isUpdateAvailable = false
  private downloadProgress = 0

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.setupAutoUpdater()
    this.setupIPC()
  }

  private setupAutoUpdater(): void {
    // Disable auto-download, we'll control it manually
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    // Check for updates on app start (after 5 seconds)
    setTimeout(() => {
      this.checkForUpdates(true)
    }, 5000)

    // Check for updates every 4 hours
    setInterval(() => {
      this.checkForUpdates(true)
    }, 4 * 60 * 60 * 1000)

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...')
      this.sendToRenderer('update-status', { status: 'checking' })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      log.info('Update available:', info.version)
      this.isUpdateAvailable = true
      this.sendToRenderer('update-status', { 
        status: 'available', 
        version: info.version,
        releaseNotes: info.releaseNotes
      })
      
      // Show notification to user
      this.showUpdateNotification(info)
    })

    autoUpdater.on('update-not-available', () => {
      log.info('No updates available')
      this.sendToRenderer('update-status', { status: 'not-available' })
    })

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.downloadProgress = progress.percent
      this.sendToRenderer('update-status', { 
        status: 'downloading', 
        progress: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      log.info('Update downloaded:', info.version)
      this.sendToRenderer('update-status', { 
        status: 'downloaded', 
        version: info.version 
      })
      
      // Prompt user to install
      this.promptInstall(info)
    })

    autoUpdater.on('error', (error: Error) => {
      log.error('Update error:', error)
      this.sendToRenderer('update-status', { 
        status: 'error', 
        error: error.message 
      })
    })
  }

  private setupIPC(): void {
    ipcMain.handle('check-for-updates', () => this.checkForUpdates(false))
    ipcMain.handle('download-update', () => this.downloadUpdate())
    ipcMain.handle('install-update', () => this.installUpdate())
    ipcMain.handle('get-update-status', () => ({
      isAvailable: this.isUpdateAvailable,
      downloadProgress: this.downloadProgress
    }))
  }

  async checkForUpdates(silent: boolean = true): Promise<void> {
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      if (!silent) {
        dialog.showErrorBox('Update Error', 'Failed to check for updates. Please try again later.')
      }
      log.error('Failed to check for updates:', error)
    }
  }

  async downloadUpdate(): Promise<void> {
    if (!this.isUpdateAvailable) return
    
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      log.error('Failed to download update:', error)
      this.sendToRenderer('update-status', { 
        status: 'error', 
        error: 'Download failed' 
      })
    }
  }

  installUpdate(): void {
    autoUpdater.quitAndInstall(false, true)
  }

  private showUpdateNotification(info: UpdateInfo): void {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available!`,
      detail: 'Would you like to download it now?',
      buttons: ['Download', 'Later'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        this.downloadUpdate()
      }
    })
  }

  private promptInstall(info: UpdateInfo): void {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'The application will restart to install the update.',
      buttons: ['Install Now', 'Install on Exit'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        this.installUpdate()
      }
    })
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }
}
```

---

## 5.4 Offline Indicators & Error Recovery

```tsx name=src/components/feedback/OfflineIndicator.tsx
import { useState, useEffect } from 'react'
import { WifiOff, AlertTriangle, RefreshCw } from 'lucide-react'

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [dbError, setDbError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Listen for database errors from main process
    const handleDbError = (_: unknown, error: string) => {
      setDbError(error)
    }

    window.electronAPI?.onDatabaseError?.(handleDbError)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await window.electronAPI?.retryDatabaseConnection?.()
      setDbError(null)
    } catch (error) {
      // Error will be handled by the error handler
    } finally {
      setRetrying(false)
    }
  }

  if (isOnline && !dbError) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOnline && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/90 text-white rounded-xl shadow-lg backdrop-blur-sm">
          <WifiOff className="w-5 h-5" />
          <div>
            <p className="font-bold text-sm">You're Offline</p>
            <p className="text-xs opacity-80">Some features may be limited</p>
          </div>
        </div>
      )}
      
      {dbError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/90 text-white rounded-xl shadow-lg backdrop-blur-sm mt-2">
          <AlertTriangle className="w-5 h-5" />
          <div className="flex-1">
            <p className="font-bold text-sm">Database Error</p>
            <p className="text-xs opacity-80">{dbError}</p>
          </div>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## 5.5 Print Optimization

```typescript name=src/utils/print.ts
import { useAppStore } from '../stores'

interface PrintOptions {
  title: string
  template: 'receipt' | 'invoice' | 'statement' | 'report' | 'payslip'
  data: Record<string, unknown>
  schoolSettings?: Record<string, unknown>
  orientation?: 'portrait' | 'landscape'
}

export function printDocument(options: PrintOptions): void {
  const { title, template, data, schoolSettings, orientation = 'portrait' } = options

  // Create a new window for printing
  const printWindow = window.open('', '_blank', 'width=800,height=600')
  if (!printWindow) {
    alert('Please allow popups to print documents')
    return
  }

  const html = generatePrintHTML(template, data, schoolSettings, title, orientation)
  
  printWindow.document.write(html)
  printWindow.document.close()

  // Wait for content to load then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }
}

function generatePrintHTML(
  template: string,
  data: Record<string, unknown>,
  settings: Record<string, unknown> | undefined,
  title: string,
  orientation: string
): string {
  const school = settings || {}
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page {
            size: A4 ${orientation};
            margin: 15mm;
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Segoe UI', Roboto, Arial, sans-serif;
            font-size: 11px;
            line-height: 1.5;
            color: #333;
            background: white;
          }
          
          .print-container {
            max-width: 100%;
            padding: 0;
          }
          
          /* Header */
          .print-header {
            display: flex;
            align-items: center;
            gap: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #1e40af;
            margin-bottom: 20px;
          }
          
          .print-logo {
            width: 60px;
            height: 60px;
            background: #1e40af;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 20px;
            font-weight: bold;
          }
          
          .print-school-info h1 {
            font-size: 18px;
            color: #1e40af;
            margin-bottom: 2px;
          }
          
          .print-school-info p {
            font-size: 10px;
            color: #666;
          }
          
          .print-title {
            text-align: center;
            font-size: 14px;
            font-weight: bold;
            color: #1e40af;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 20px;
            padding: 10px;
            background: #f3f4f6;
            border-radius: 4px;
          }
          
          /* Tables */
          .print-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          
          .print-table th {
            background: #1e40af;
            color: white;
            padding: 8px;
            text-align: left;
            font-size: 10px;
            text-transform: uppercase;
          }
          
          .print-table td {
            padding: 8px;
            border-bottom: 1px solid #e5e7eb;
          }
          
          .print-table tbody tr:nth-child(even) {
            background: #f9fafb;
          }
          
          .print-table .text-right {
            text-align: right;
          }
          
          .print-table .font-bold {
            font-weight: bold;
          }
          
          /* Summary box */
          .print-summary {
            background: #f3f4f6;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          
          .print-summary-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
          }
          
          .print-summary-row.total {
            border-top: 2px solid #1e40af;
            margin-top: 10px;
            padding-top: 10px;
            font-size: 14px;
            font-weight: bold;
          }
          
          /* Footer */
          .print-footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #e5e7eb;
            font-size: 9px;
            color: #666;
            text-align: center;
          }
          
          .print-signature {
            display: flex;
            justify-content: space-between;
            margin-top: 40px;
          }
          
          .print-signature-box {
            text-align: center;
            width: 150px;
          }
          
          .print-signature-line {
            border-top: 1px solid #333;
            margin-top: 40px;
            padding-top: 5px;
          }
          
          /* Receipt specific */
          .receipt-number {
            font-size: 12px;
            font-weight: bold;
            color: #1e40af;
          }
          
          /* Don't print certain elements */
          @media print {
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="print-container">
          ${generateHeader(school)}
          ${generateContent(template, data)}
          ${generateFooter(school)}
        </div>
      </body>
    </html>
  `
}

function generateHeader(school: Record<string, unknown>): string {
  return `
    <div class="print-header">
      <div class="print-logo">${String(school.school_name || 'S').charAt(0)}</div>
      <div class="print-school-info">
        <h1>${school.school_name || 'School Name'}</h1>
        <p>${school.address || ''}</p>
        <p>${school.phone || ''} ${school.email ? '• ' + school.email : ''}</p>
      </div>
    </div>
  `
}

function generateContent(template: string, data: Record<string, unknown>): string {
  switch (template) {
    case 'receipt':
      return generateReceiptContent(data)
    case 'invoice':
      return generateInvoiceContent(data)
    case 'statement':
      return generateStatementContent(data)
    case 'payslip':
      return generatePayslipContent(data)
    default:
      return generateReportContent(data)
  }
}

function generateReceiptContent(data: Record<string, unknown>): string {
  return `
    <div class="print-title">Fee Payment Receipt</div>
    
    <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
      <div>
        <p><strong>Receipt No:</strong> <span class="receipt-number">${data.receipt_number || '-'}</span></p>
        <p><strong>Date:</strong> ${data.date || new Date().toLocaleDateString()}</p>
      </div>
      <div style="text-align: right;">
        <p><strong>Student:</strong> ${data.studentName || '-'}</p>
        <p><strong>Adm No:</strong> ${data.admissionNumber || '-'}</p>
        <p><strong>Class:</strong> ${data.streamName || '-'}</p>
      </div>
    </div>
    
    <table class="print-table">
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-right">Amount (KES)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${data.description || 'Fee Payment'}</td>
          <td class="text-right font-bold">${formatCurrency(data.amount as number)}</td>
        </tr>
      </tbody>
    </table>
    
    <div class="print-summary">
      <div class="print-summary-row">
        <span>Payment Method:</span>
        <span>${data.payment_method || 'CASH'}</span>
      </div>
      ${data.payment_reference ? `
        <div class="print-summary-row">
          <span>Reference:</span>
          <span>${data.payment_reference}</span>
        </div>
      ` : ''}
      <div class="print-summary-row total">
        <span>Amount Paid:</span>
        <span>KES ${formatCurrency(data.amount as number)}</span>
      </div>
      <div class="print-summary-row">
        <span>New Balance:</span>
        <span>KES ${formatCurrency(data.newBalance as number || 0)}</span>
      </div>
    </div>
    
    <div class="print-signature">
      <div class="print-signature-box">
        <div class="print-signature-line">Received By</div>
      </div>
      <div class="print-signature-box">
        <div class="print-signature-line">Parent/Guardian</div>
      </div>
    </div>
  `
}

function generateInvoiceContent(data: Record<string, unknown>): string {
  const items = data.items as Array<{ description: string; amount: number }> || []
  
  return `
    <div class="print-title">Fee Invoice</div>
    
    <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
      <div>
        <p><strong>Invoice No:</strong> <span class="receipt-number">${data.invoice_number || '-'}</span></p>
        <p><strong>Date:</strong> ${data.invoice_date || new Date().toLocaleDateString()}</p>
        <p><strong>Due Date:</strong> ${data.due_date || '-'}</p>
      </div>
      <div style="text-align: right;">
        <p><strong>Student:</strong> ${data.studentName || '-'}</p>
        <p><strong>Adm No:</strong> ${data.admissionNumber || '-'}</p>
        <p><strong>Class:</strong> ${data.streamName || '-'}</p>
        <p><strong>Term:</strong> ${data.termName || '-'}</p>
      </div>
    </div>
    
    <table class="print-table">
      <thead>
        <tr>
          <th style="width: 60%">Description</th>
          <th class="text-right">Amount (KES)</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td>${item.description}</td>
            <td class="text-right">${formatCurrency(item.amount)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background: #f3f4f6;">
          <td class="font-bold">Total Amount</td>
          <td class="text-right font-bold">${formatCurrency(data.total_amount as number)}</td>
        </tr>
        <tr>
          <td>Amount Paid</td>
          <td class="text-right text-green-600">${formatCurrency(data.amount_paid as number || 0)}</td>
        </tr>
        <tr style="background: #fee2e2;">
          <td class="font-bold">Balance Due</td>
          <td class="text-right font-bold" style="color: #dc2626;">${formatCurrency(data.balance as number || 0)}</td>
        </tr>
      </tfoot>
    </table>
    
    <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 8px; font-size: 10px;">
      <p><strong>Payment Instructions:</strong></p>
      <p>Please make payment before the due date to avoid penalties. Payments can be made via M-Pesa, Bank Transfer, or Cash at the school bursar's office.</p>
      ${data.mpesa_paybill ? `<p><strong>M-Pesa Paybill:</strong> ${data.mpesa_paybill} | <strong>Account:</strong> ${data.admissionNumber}</p>` : ''}
    </div>
  `
}

function generateStatementContent(data: Record<string, unknown>): string {
  const ledger = data.ledger as Array<{
    date: string
    description: string
    debit: number
    credit: number
    balance: number
  }> || []

  return `
    <div class="print-title">Student Fee Statement</div>
    
    <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
      <div>
        <p><strong>Student:</strong> ${data.studentName || '-'}</p>
        <p><strong>Adm No:</strong> ${data.admissionNumber || '-'}</p>
        <p><strong>Class:</strong> ${data.streamName || '-'}</p>
      </div>
      <div style="text-align: right;">
        <p><strong>Statement Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Opening Balance:</strong> KES ${formatCurrency(data.openingBalance as number || 0)}</p>
      </div>
    </div>
    
    <table class="print-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th class="text-right">Charges</th>
          <th class="text-right">Payments</th>
          <th class="text-right">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${ledger.map(entry => `
          <tr>
            <td>${entry.date}</td>
            <td>${entry.description}</td>
            <td class="text-right">${entry.debit > 0 ? formatCurrency(entry.debit) : '-'}</td>
            <td class="text-right" style="color: #059669;">${entry.credit > 0 ? formatCurrency(entry.credit) : '-'}</td>
            <td class="text-right font-bold">${formatCurrency(entry.balance)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div class="print-summary">
      <div class="print-summary-row total">
        <span>Closing Balance:</span>
        <span style="color: ${(data.closingBalance as number) > 0 ? '#dc2626' : '#059669'}">
          KES ${formatCurrency(data.closingBalance as number || 0)}
        </span>
      </div>
    </div>
  `
}

function generatePayslipContent(data: Record<string, unknown>): string {
  const earnings = data.earnings as Array<{ name: string; amount: number }> || []
  const deductions = data.deductions as Array<{ name: string; amount: number }> || []
  
  return `
    <div class="print-title">Payslip - ${data.period || ''}</div>
    
    <div style="display: flex; justify-content: space-between; margin-bottom: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px;">
      <div>
        <p><strong>Employee:</strong> ${data.staffName || '-'}</p>
        <p><strong>Staff No:</strong> ${data.staffNumber || '-'}</p>
        <p><strong>Department:</strong> ${data.department || '-'}</p>
        <p><strong>Job Title:</strong> ${data.jobTitle || '-'}</p>
      </div>
      <div style="text-align: right;">
        <p><strong>Pay Period:</strong> ${data.period || '-'}</p>
        <p><strong>Pay Date:</strong> ${data.payDate || '-'}</p>
        <p><strong>Bank:</strong> ${data.bankName || '-'}</p>
        <p><strong>Account:</strong> ${data.bankAccount || '-'}</p>
      </div>
    </div>
    
    <div style="display: flex; gap: 20px;">
      <!-- Earnings -->
      <div style="flex: 1;">
        <h3 style="font-size: 12px; color: #059669; margin-bottom: 10px; text-transform: uppercase;">Earnings</h3>
        <table class="print-table">
          <tbody>
            <tr>
              <td>Basic Salary</td>
              <td class="text-right">${formatCurrency(data.basicSalary as number)}</td>
            </tr>
            ${earnings.map(e => `
              <tr>
                <td>${e.name}</td>
                <td class="text-right">${formatCurrency(e.amount)}</td>
              </tr>
            `).join('')}
            <tr style="background: #dcfce7; font-weight: bold;">
              <td>Gross Pay</td>
              <td class="text-right">${formatCurrency(data.grossPay as number)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- Deductions -->
      <div style="flex: 1;">
        <h3 style="font-size: 12px; color: #dc2626; margin-bottom: 10px; text-transform: uppercase;">Deductions</h3>
        <table class="print-table">
          <tbody>
            ${deductions.map(d => `
              <tr>
                <td>${d.name}</td>
                <td class="text-right">${formatCurrency(d.amount)}</td>
              </tr>
            `).join('')}
            <tr style="background: #fee2e2; font-weight: bold;">
              <td>Total Deductions</td>
              <td class="text-right">${formatCurrency(data.totalDeductions as number)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <div class="print-summary" style="margin-top: 20px; text-align: center;">
      <div class="print-summary-row total" style="justify-content: center; gap: 20px;">
        <span>NET PAY:</span>
        <span style="font-size: 18px; color: #1e40af;">KES ${formatCurrency(data.netPay as number)}</span>
      </div>
      <p style="font-size: 10px; color: #666; margin-top: 10px;">
        (${numberToWords(data.netPay as number)} Kenya Shillings Only)
      </p>
    </div>
    
    <div style="margin-top: 30px; font-size: 9px; color: #666; text-align: center;">
      <p>This is a computer-generated payslip and does not require a signature.</p>
    </div>
  `
}

function generateReportContent(data: Record<string, unknown>): string {
  const rows = data.rows as Array<Record<string, unknown>> || []
  const columns = data.columns as Array<{ key: string; header: string; align?: string }> || []
  
  return `
    <div class="print-title">${data.title || 'Report'}</div>
    
    ${data.subtitle ? `<p style="text-align: center; margin-bottom: 20px; color: #666;">${data.subtitle}</p>` : ''}
    
    ${data.summary ? `
      <div class="print-summary" style="display: grid; grid-template-columns: repeat(${(data.summaryColumns as number) || 3}, 1fr); gap: 15px; margin-bottom: 20px;">
        ${(data.summary as Array<{ label: string; value: string }>).map(s => `
          <div style="text-align: center; padding: 10px;">
            <p style="font-size: 10px; color: #666; text-transform: uppercase;">${s.label}</p>
            <p style="font-size: 16px; font-weight: bold; color: #1e40af;">${s.value}</p>
          </div>
        `).join('')}
      </div>
    ` : ''}
    
    <table class="print-table">
      <thead>
        <tr>
          ${columns.map(col => `<th class="${col.align === 'right' ? 'text-right' : ''}">${col.header}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            ${columns.map(col => `
              <td class="${col.align === 'right' ? 'text-right' : ''}">${row[col.key] ?? '-'}</td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    ${data.totals ? `
      <div class="print-summary">
        ${Object.entries(data.totals as Record<string, unknown>).map(([key, value]) => `
          <div class="print-summary-row">
            <span>${key}:</span>
            <span class="font-bold">${value}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `
}

function generateFooter(school: Record<string, unknown>): string {
  return `
    <div class="print-footer">
      <p>${school.school_name || 'School Name'} • ${school.address || ''}</p>
      <p>Printed on ${new Date().toLocaleString()}</p>
    </div>
  `
}

function formatCurrency(amount: number): string {
  if (amount === undefined || amount === null) return '0.00'
  // Assuming amount is stored in cents
  const value = amount / 100
  return new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

function numberToWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']

  const value = Math.floor(amount / 100) // Convert cents to whole currency

  if (value === 0) return 'Zero'
  if (value >= 1000000) return 'Over One Million'

  const convertHundreds = (n: number): string => {
    if (n === 0) return ''
    if (n < 10) return ones[n]
    if (n < 20) return teens[n - 10]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convertHundreds(n % 100) : '')
  }

  let result = ''
  if (value >= 1000) {
    result += convertHundreds(Math.floor(value / 1000)) + ' Thousand'
    if (value % 1000) result += ' ' + convertHundreds(value % 1000)
  } else {
    result = convertHundreds(value)
  }

  return result.trim()
}
```

---

## 5.6 Accessibility Improvements (WCAG 2.1)

```tsx name=src/components/accessibility/AccessibilityProvider.tsx
import React, { createContext, useContext, useState, useEffect } from 'react'

interface AccessibilitySettings {
  reduceMotion: boolean
  highContrast: boolean
  fontSize: 'normal' | 'large' | 'larger'
  focusIndicators: boolean
}

interface AccessibilityContextValue {
  settings: AccessibilitySettings
  updateSettings: (updates: Partial<AccessibilitySettings>) => void
}

const defaultSettings: AccessibilitySettings = {
  reduceMotion: false,
  highContrast: false,
  fontSize: 'normal',
  focusIndicators: true
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null)

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    const stored = localStorage.getItem('accessibility-settings')
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) }
    }
    
    // Check system preferences
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const prefersHighContrast = window.matchMedia('(prefers-contrast: more)').matches
    
    return {
      ...defaultSettings,
      reduceMotion: prefersReducedMotion,
      highContrast: prefersHighContrast
    }
  })

  useEffect(() => {
    localStorage.setItem('accessibility-settings', JSON.stringify(settings))
    
    // Apply settings to document
    const root = document.documentElement
    
    // Reduce motion
    if (settings.reduceMotion) {
      root.classList.add('reduce-motion')
    } else {
      root.classList.remove('reduce-motion')
    }
    
    // High contrast
    if (settings.highContrast) {
      root.classList.add('high-contrast')
    } else {
      root.classList.remove('high-contrast')
    }
    
    // Font size
    root.classList.remove('font-normal', 'font-large', 'font-larger')
    root.classList.add(`font-${settings.fontSize}`)
    
    // Focus indicators
    if (settings.focusIndicators) {
      root.classList.add('focus-visible')
    } else {
      root.classList.remove('focus-visible')
    }
  }, [settings])

  const updateSettings = (updates: Partial<AccessibilitySettings>) => {
    setSettings(prev => ({ ...prev, ...updates }))
  }

  return (
    <AccessibilityContext.Provider value={{ settings, updateSettings }}>
      {children}
    </AccessibilityContext.Provider>
  )
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext)
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider')
  }
  return context
}

// Skip link component
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg"
    >
      Skip to main content
    </a>
  )
}

// Screen reader only announcements
export function Announce({ message, priority = 'polite' }: { message: string; priority?: 'polite' | 'assertive' }) {
  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  )
}
```

### Accessibility CSS

```css name=src/styles/accessibility.css
/* Reduce motion for users who prefer it */
.reduce-motion *,
.reduce-motion *::before,
.reduce-motion *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}

/* High contrast mode */
.high-contrast {
  --background: 0 0% 0%;
  --foreground: 0 0% 100%;
  --card: 0 0% 5%;
  --card-foreground: 0 0% 100%;
  --primary: 210 100% 50%;
  --primary-foreground: 0 0% 100%;
  --border: 0 0% 40%;
}

.high-contrast .card {
  border-width: 2px;
}

.high-contrast .btn {
  border-width: 2px;
}

/* Font size adjustments */
.font-normal {
  font-size: 14px;
}

.font-large {
  font-size: 16px;
}

.font-larger {
  font-size: 18px;
}

/* Enhanced focus indicators */
.focus-visible :focus-visible {
  outline: 3px solid hsl(var(--primary));
  outline-offset: 2px;
}

.focus-visible button:focus-visible,
.focus-visible a:focus-visible,
.focus-visible input:focus-visible,
.focus-visible select:focus-visible,
.focus-visible textarea:focus-visible {
  outline: 3px solid hsl(var(--primary));
  outline-offset: 2px;
  box-shadow: 0 0 0 6px hsla(var(--primary) / 0.2);
}

/* Screen reader only content */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.sr-only.focusable:focus,
.sr-only.focusable:active {
  position: static;
  width: auto;
  height: auto;
  overflow: visible;
  clip: auto;
  white-space: normal;
}

/* Ensure sufficient color contrast for text */
.high-contrast .text-foreground\/40,
.high-contrast .text-foreground\/50,
.high-contrast .text-foreground\/60 {
  opacity: 1;
  color: hsl(0 0% 80%);
}

/* Larger click targets for touch/motor accessibility */
@media (pointer: coarse) {
  button, a, input, select {
    min-height: 44px;
    min-width: 44px;
  }
}
```

---

## Phase 5 Deliverables Summary

| Deliverable | Status | Description |
|-------------|--------|-------------|
| Window State Persistence | 🆕 | Remember size, position, maximized state |
| Native Menu Integration | 🆕 | Full application menu with shortcuts |
| Auto-Update System | 🆕 | Automatic updates via electron-updater |
| Offline Indicators | 🆕 | Visual feedback for connectivity issues |
| Print Optimization | 🆕 | Professional print templates |
| Accessibility (WCAG 2.1) | 🆕 | Reduced motion, high contrast, focus indicators |
| Skip Links | 🆕 | Keyboard navigation improvements |
| Screen Reader Support | 🆕 | ARIA labels and announcements |

---

# Phase 6: Testing, Documentation & Deployment
**Duration: 3-4 weeks**
**Goal: Ensure production readiness with comprehensive testing and documentation**

---

## 6.1 Testing Strategy

### Unit Tests

```typescript name=electron/main/services/finance/__tests__/PaymentService.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PaymentService } from '../PaymentService'
import { getDatabase } from '../../../database'

// Mock the database
vi.mock('../../../database', () => ({
  getDatabase: vi.fn()
}))

describe('PaymentService', () => {
  let service: PaymentService
  let mockDb: any

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
      get: vi.fn(),
      all: vi.fn().mockReturnValue([]),
      transaction: vi.fn((fn) => fn)
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb)
    service = new PaymentService()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('recordPayment', () => {
    it('should record a valid payment', async () => {
      mockDb.get.mockReturnValueOnce({ id: 1, total_amount: 50000, amount_paid: 20000 }) // Invoice
      mockDb.get.mockReturnValueOnce({ is_locked: false }) // Period check

      const result = await service.recordPayment({
        student_id: 1,
        invoice_id: 1,
        amount: 15000,
        payment_method: 'CASH',
        transaction_date: '2024-01-15'
      }, 1)

      expect(result.success).toBe(true)
      expect(result.receipt_number).toBeDefined()
    })

    it('should reject payment exceeding balance', async () => {
      mockDb.get.mockReturnValueOnce({ id: 1, total_amount: 50000, amount_paid: 45000 }) // Invoice

      const result = await service.recordPayment({
        student_id: 1,
        invoice_id: 1,
        amount: 10000, // More than 5000 balance
        payment_method: 'CASH',
        transaction_date: '2024-01-15'
      }, 1)

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Payment amount exceeds outstanding balance')
    })

    it('should reject payment in locked period', async () => {
      mockDb.get.mockReturnValueOnce({ id: 1, total_amount: 50000, amount_paid: 20000 }) // Invoice
      mockDb.get.mockReturnValueOnce({ is_locked: true }) // Period is locked

      const result = await service.recordPayment({
        student_id: 1,
        invoice_id: 1,
        amount: 15000,
        payment_method: 'CASH',
        transaction_date: '2024-01-15'
      }, 1)

      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toMatch(/locked period/i)
    })

    it('should validate required fields', async () => {
      const result = await service.recordPayment({
        student_id: 0,
        amount: 0,
        payment_method: '',
        transaction_date: ''
      }, 1)

      expect(result.success).toBe(false)
      expect(result.errors?.length).toBeGreaterThan(0)
    })
  })

  describe('voidPayment', () => {
    it('should void a payment with valid reason', async () => {
      mockDb.get.mockReturnValueOnce({
        id: 1,
        is_voided: 0,
        amount: 15000,
        invoice_id: 1
      })
      mockDb.get.mockReturnValueOnce({ is_locked: false })

      const result = await service.voidPayment(1, 'Duplicate entry', 1)

      expect(result.success).toBe(true)
    })

    it('should reject voiding without reason', async () => {
      const result = await service.voidPayment(1, '', 1)

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Void reason is required')
    })

    it('should reject voiding already voided payment', async () => {
      mockDb.get.mockReturnValueOnce({ id: 1, is_voided: 1 })

      const result = await service.voidPayment(1, 'Test reason', 1)

      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toMatch(/already voided/i)
    })
  })
})
```

### Integration Tests

```typescript name=electron/main/services/finance/__tests__/PaymentService.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { PaymentService } from '../PaymentService'
import { InvoiceService } from '../InvoiceService'
import path from 'path'
import fs from 'fs'

describe('PaymentService Integration', () => {
  let db: Database.Database
  let paymentService: PaymentService
  let invoiceService: InvoiceService
  const testDbPath = path.join(__dirname, 'test.db')

  beforeAll(() => {
    // Create test database with schema
    db = new Database(testDbPath)
    
    // Run migrations
    const schema = fs.readFileSync(
      path.join(__dirname, '../../../../database/migrations/schema.sql'),
      'utf-8'
    )
    db.exec(schema)

    // Seed test data
    db.exec(`
      INSERT INTO academic_year (year_name, start_date, end_date, is_current)
      VALUES ('2024', '2024-01-01', '2024-12-31', 1);

      INSERT INTO term (term_name, academic_year_id, start_date, end_date, is_current)
      VALUES ('Term 1', 1, '2024-01-01', '2024-04-30', 1);

      INSERT INTO student (admission_number, first_name, last_name, date_of_birth, gender, guardian_name, guardian_phone)
      VALUES ('ADM001', 'John', 'Doe', '2010-01-01', 'MALE', 'Jane Doe', '0712345678');

      INSERT INTO fee_invoice (student_id, term_id, invoice_number, invoice_date, due_date, total_amount, amount_paid, status)
      VALUES (1, 1, 'INV-2024-001', '2024-01-15', '2024-02-15', 5000000, 0, 'PENDING');

      INSERT INTO user (username, password_hash, full_name, role)
      VALUES ('admin', 'hash', 'Admin User', 'ADMIN');
    `)

    // Initialize services
    paymentService = new PaymentService()
    invoiceService = new InvoiceService()
  })

  afterAll(() => {
    db.close()
    fs.unlinkSync(testDbPath)
  })

  beforeEach(() => {
    // Reset invoice state
    db.exec(`UPDATE fee_invoice SET amount_paid = 0, status = 'PENDING' WHERE id = 1`)
    db.exec(`DELETE FROM ledger_transaction`)
    db.exec(`DELETE FROM receipt`)
  })

  it('should record payment and update invoice balance', async () => {
    const result = await paymentService.recordPayment({
      student_id: 1,
      invoice_id: 1,
      amount: 2000000, // 20,000 KES in cents
      payment_method: 'MPESA',
      payment_reference: 'QJK2L3M4N5',
      transaction_date: '2024-01-20'
    }, 1)

    expect(result.success).toBe(true)
    expect(result.receipt_number).toMatch(/^RCP-/)

    // Verify invoice was updated
    const invoice = db.prepare('SELECT * FROM fee_invoice WHERE id = 1').get() as any
    expect(invoice.amount_paid).toBe(2000000)
    expect(invoice.status).toBe('PARTIAL')
  })

  it('should mark invoice as PAID when fully paid', async () => {
    // Pay full amount
    const result = await paymentService.recordPayment({
      student_id: 1,
      invoice_id: 1,
      amount: 5000000, // Full amount
      payment_method: 'BANK_TRANSFER',
      transaction_date: '2024-01-20'
    }, 1)

    expect(result.success).toBe(true)

    const invoice = db.prepare('SELECT * FROM fee_invoice WHERE id = 1').get() as any
    expect(invoice.amount_paid).toBe(5000000)
    expect(invoice.status).toBe('PAID')
  })

  it('should create audit log entry for payment', async () => {
    await paymentService.recordPayment({
      student_id: 1,
      invoice_id: 1,
      amount: 1000000,
      payment_method: 'CASH',
      transaction_date: '2024-01-20'
    }, 1)

    const auditLog = db.prepare(`
      SELECT * FROM audit_log WHERE table_name = 'ledger_transaction' ORDER BY id DESC LIMIT 1
    `).get() as any

    expect(auditLog).toBeDefined()
    expect(auditLog.action_type).toBe('CREATE')
    expect(auditLog.user_id).toBe(1)
  })

  it('should handle concurrent payments correctly', async () => {
    // Simulate concurrent payments
    const payment1 = paymentService.recordPayment({
      student_id: 1,
      invoice_id: 1,
      amount: 3000000,
      payment_method: 'CASH',
      transaction_date: '2024-01-20'
    }, 1)

    const payment2 = paymentService.recordPayment({
      student_id: 1,
      invoice_id: 1,
      amount: 3000000,
      payment_method: 'MPESA',
      transaction_date: '2024-01-20'
    }, 1)

    const [result1, result2] = await Promise.all([payment1, payment2])

    // One should succeed, one should fail (exceeds balance)
    const successCount = [result1.success, result2.success].filter(Boolean).length
    
    // At least one should succeed
    expect(successCount).toBeGreaterThanOrEqual(1)

    // Total paid should not exceed invoice amount
    const invoice = db.prepare('SELECT amount_paid FROM fee_invoice WHERE id = 1').get() as any
    expect(invoice.amount_paid).toBeLessThanOrEqual(5000000)
  })
})
```

### E2E Tests (Playwright)

```typescript name=tests/e2e/fee-payment.spec.ts
import { test, expect } from '@playwright/test'
import { ElectronApplication, Page, _electron as electron } from 'playwright'
import path from 'path'

let electronApp: ElectronApplication
let page: Page

test.describe('Fee Payment Flow', () => {
  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist/electron/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('should login and navigate to fee payment', async () => {
    // Login
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')

    // Wait for dashboard
    await expect(page.locator('h1:has-text("Financial Overview")')).toBeVisible()

    // Navigate to fee payment
    await page.click('a[href="/fee-payment"]')
    await expect(page.locator('h1:has-text("Fee Payment")')).toBeVisible()
  })

  test('should search and select a student', async () => {
    await page.fill('input[placeholder*="search"]', 'ADM001')
    await page.click('button:has-text("Search")') // or press Enter
    
    // Wait for search results
    await expect(page.locator('text=John Doe')).toBeVisible()
    
    // Select student
    await page.click('text=John Doe')
    
    // Verify student details loaded
    await expect(page.locator('text=ADM001')).toBeVisible()
  })

  test('should record a payment', async () => {
    // Fill payment form
    await page.fill('input[name="amount"]', '10000')
    await page.selectOption('select[name="payment_method"]', 'MPESA')
    await page.fill('input[name="payment_reference"]', 'TEST123456')

    // Submit
    await page.click('button:has-text("Record Payment")')

    // Wait for success
    await expect(page.locator('text=Payment recorded successfully')).toBeVisible({ timeout: 5000 })

    // Verify receipt is generated
    await expect(page.locator('text=RCP-')).toBeVisible()
  })

  test('should print receipt', async () => {
    // Click print button
    const printPromise = page.waitForEvent('popup')
    await page.click('button:has-text("Print Receipt")')
    
    const printWindow = await printPromise
    await expect(printWindow.locator('text=Fee Payment Receipt')).toBeVisible()
    await printWindow.close()
  })

  test('should show updated balance', async () => {
    // Balance should be reduced by 10000
    const balanceText = await page.locator('.balance-display').textContent()
    expect(balanceText).not.toContain('50,000') // Original balance
  })
})
```

---

## 6.2 Documentation Structure

```markdown name=docs/README.md
# Mwingi School ERP Documentation

## Table of Contents

1. [Getting Started](./getting-started.md)
   - Installation
   - Initial Setup
   - First Login

2. [User Guide](./user-guide/README.md)
   - [Dashboard Overview](./user-guide/dashboard.md)
   - [Student Management](./user-guide/students.md)
   - [Fee Management](./user-guide/fees.md)
   - [Reports](./user-guide/reports.md)
   - [Payroll](./user-guide/payroll.md)
   - [Inventory](./user-guide/inventory.md)

3. [Administrator Guide](./admin-guide/README.md)
   - [User Management](./admin-guide/users.md)
   - [System Settings](./admin-guide/settings.md)
   - [Backup & Restore](./admin-guide/backup.md)
   - [Academic Year Setup](./admin-guide/academic-setup.md)

4. [Developer Guide](./developer-guide/README.md)
   - [Architecture Overview](./developer-guide/architecture.md)
   - [Database Schema](./developer-guide/database.md)
   - [API Reference](./developer-guide/api.md)
   - [Contributing](./developer-guide/contributing.md)

5. [Troubleshooting](./troubleshooting.md)

6. [Changelog](./CHANGELOG.md)
```

---

## 6.3 Deployment Configuration

```yaml name=.github/workflows/build.yml
name: Build and Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    runs-on: ${{ matrix.os }}
    
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Build application
        run: npm run build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Build Electron app
        run: npm run electron:build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist-${{ matrix.os }}
          path: |
            dist/*.exe
            dist/*.dmg
            dist/*.AppImage
            dist/*.deb
            
  release:
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/')
    
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            dist-*/*
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Phase 6 Deliverables Summary

| Deliverable | Status | Description |
|-------------|--------|-------------|
| Unit Tests | 🆕 | Service-level tests with mocks |
| Integration Tests | 🆕 | Database integration tests |
| E2E Tests (Playwright) | 🆕 | Full user flow testing |
| User Documentation | 🆕 | Complete user guide |
| Admin Documentation | 🆕 | System administration guide |
| Developer Documentation | 🆕 | API reference, architecture |
| CI/CD Pipeline | 🆕 | Automated build and release |
| Release Automation | 🆕 | GitHub releases with installers |

---

# Implementation Timeline Summary

| Phase | Duration | Focus Area | Key Deliverables |
|-------|----------|------------|------------------|
| **Phase 1** | 4-5 weeks | Foundation & Architecture | Service layer, database schema, UI components, theme system |
| **Phase 2** | 5-6 weeks | Financial Core | Budgeting, PDF/Excel export, period locking, report engine |
| **Phase 3** | 4-5 weeks | Advanced Financial | Bank reconciliation, approval workflows, fixed assets |
| **Phase 4** | 3-4 weeks | Attendance & Notifications | Attendance module, SMS/Email, report scheduling, data import |
| **Phase 5** | 3-4 weeks | UI/UX & Desktop | Window state, menus, auto-update, accessibility |
| **Phase 6** | 3-4 weeks | Testing & Deployment | Unit/E2E tests, documentation, CI/CD |

**Total Estimated Duration: 22-28 weeks**

---

# Priority Recommendations

## High Priority (Do First)
1. Service layer architecture (enables everything else)
2. PDF/Excel export (most requested missing feature)
3. Period locking (data integrity critical)
4. Attendance UI (backend exists, easy win)

## Medium Priority
1. Budgeting module
2. Bank reconciliation
3. Approval workflows
4. Report scheduling

## Lower Priority (Nice to Have)
1. Fixed assets register
2. Advanced accessibility
3. Auto-updates
4. Multi-branch support (future phase)

---

This comprehensive roadmap provides a complete blueprint for transforming the Mwingi School ERP from a prototype into a production-ready professional application. Each phase builds upon the previous, ensuring a stable foundation while progressively adding advanced features.