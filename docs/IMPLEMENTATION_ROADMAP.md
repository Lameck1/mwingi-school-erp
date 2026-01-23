# Mwingi School ERP - Complete Implementation Roadmap

## Document Overview

This document contains the complete implementation roadmap for transforming the Mwingi School ERP from a prototype into a production-ready, professional-grade school financial management system. The plan spans **6 development phases** over approximately **24-32 weeks**.

---

## Table of Contents

1. [Strategic Overview](#strategic-overview)
2. [Architecture Principles](#architecture-principles)
3. [Phase 1: Foundation & Architecture Refactoring](#phase-1-foundation--architecture-refactoring)
4. [Phase 2: Financial Core Enhancements](#phase-2-financial-core-enhancements)
5. [Phase 3: Advanced Financial Features](#phase-3-advanced-financial-features)
6. [Phase 4: Attendance, Notifications & Integration](#phase-4-attendance-notifications--integration)
7. [Phase 5: UI/UX Enhancements & Desktop Features](#phase-5-uiux-enhancements--desktop-features)
8. [Phase 6: Testing, Documentation & Deployment](#phase-6-testing-documentation--deployment)
9. [Implementation Timeline Summary](#implementation-timeline-summary)
10. [Priority Recommendations](#priority-recommendations)

---

## Strategic Overview

This roadmap addresses the following critical gaps identified in the audit:

| Gap Category | Issues Identified |
|--------------|-------------------|
| **Shallow Financial Reporting** | No budgeting, no comparative reports, no aged receivables, no cash flow analysis |
| **Non-Functional Exports** | PDF/Excel export buttons exist but don't work |
| **Half-Implemented Features** | Attendance backend exists without frontend, SMS UI without integration |
| **Missing Financial Controls** | No period locking, no approval workflows, no transaction locking |
| **UI/UX Gaps** | No keyboard shortcuts, inconsistent theming, no desktop-specific features |
| **Data Integrity Concerns** | No bank reconciliation, unencrypted database, manual backups only |

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

## Phase 1: Foundation & Architecture Refactoring

**Duration: 4-5 weeks**  
**Goal: Establish robust architecture patterns and fix existing inconsistencies**

### 1.1 Service Layer Architecture

#### Objective

Introduce a proper service layer that separates business logic from IPC handlers and database operations.

#### Directory Structure

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

#### Implementation: Base Service Interfaces

```typescript
// electron/main/services/base/interfaces/IService.ts

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
}
```

#### Implementation: Abstract Base Service

```typescript
// electron/main/services/base/BaseService.ts

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

#### Implementation: Dependency Injection Container

```typescript
// electron/main/services/base/ServiceContainer.ts

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
