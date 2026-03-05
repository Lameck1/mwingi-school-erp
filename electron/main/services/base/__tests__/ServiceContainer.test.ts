import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * ServiceContainer is a module-level singleton (`container`).
 * We use dynamic imports + vi.resetModules() so each test gets a fresh module.
 */

const createMockDatabase = () => ({
  prepare: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(), run: vi.fn() }))
})

async function freshContainer() {
  vi.resetModules()

  // Mock every heavy service import so the module loads cleanly in tests.
  // The container only stores whatever the caller registers, so stubs are fine.
  const serviceModules = [
    '../academic/AcademicSystemService',
    '../academic/AttendanceService',
    '../academic/CBCReportCardService',
    '../academic/ExamAnalysisService',
    '../academic/ExamSchedulerService',
    '../academic/MeritListService',
    '../academic/PerformanceAnalysisService',
    '../academic/PromotionService',
    '../academic/ReportCardAnalyticsService',
    '../academic/ReportCardService',
    '../accounting/BudgetEnforcementService',
    '../accounting/DoubleEntryJournalService',
    '../accounting/OpeningBalanceService',
    '../accounting/ProfitAndLossService',
    '../accounting/ReconciliationService',
    '../cbc/CBCStrandService',
    '../cbc/JSSTransitionService',
    '../data/DataImportService',
    '../finance/BankReconciliationService',
    '../finance/BudgetService',
    '../finance/CashFlowService',
    '../finance/CreditAutoApplicationService',
    '../finance/ExemptionService',
    '../finance/FeeProrationService',
    '../finance/FixedAssetService',
    '../finance/GLAccountService',
    '../finance/HireService',
    '../finance/PaymentService',
    '../finance/ScholarshipService',
    '../inventory/InventoryService',
    '../notifications/NotificationService',
    '../operations/BoardingCostService',
    '../operations/GrantTrackingService',
    '../operations/StudentCostService',
    '../operations/TransportCostService',
    '../reports/NEMISExportService',
    '../SystemMaintenanceService',
    '../workflow/ApprovalService',
  ]

  for (const mod of serviceModules) {
    vi.doMock(mod, () => {
      // Return a mock class as default + named export
      const MockClass = vi.fn()
      return { default: MockClass, [mod.split('/').pop()!.replace(/Service$/, 'Service')]: MockClass }
    })
  }

  const { container } = await import('../ServiceContainer')
  return container
}

async function freshContainerWithRegisterServices() {
  vi.resetModules()

  // Mock database so constructors don't crash
  vi.doMock('../../../database', () => ({
    getDatabase: createMockDatabase
  }))

  const serviceModules = [
    '../academic/AcademicSystemService',
    '../academic/AttendanceService',
    '../academic/CBCReportCardService',
    '../academic/ExamAnalysisService',
    '../academic/ExamSchedulerService',
    '../academic/MeritListService',
    '../academic/PerformanceAnalysisService',
    '../academic/PromotionService',
    '../academic/ReportCardAnalyticsService',
    '../academic/ReportCardService',
    '../accounting/BudgetEnforcementService',
    '../accounting/DoubleEntryJournalService',
    '../accounting/OpeningBalanceService',
    '../accounting/ProfitAndLossService',
    '../accounting/ReconciliationService',
    '../cbc/CBCStrandService',
    '../cbc/JSSTransitionService',
    '../data/DataImportService',
    '../finance/BankReconciliationService',
    '../finance/BudgetService',
    '../finance/CashFlowService',
    '../finance/CreditAutoApplicationService',
    '../finance/ExemptionService',
    '../finance/FeeProrationService',
    '../finance/FixedAssetService',
    '../finance/GLAccountService',
    '../finance/HireService',
    '../finance/PaymentService',
    '../finance/ScholarshipService',
    '../inventory/InventoryService',
    '../notifications/NotificationService',
    '../operations/BoardingCostService',
    '../operations/GrantTrackingService',
    '../operations/StudentCostService',
    '../operations/TransportCostService',
    '../reports/NEMISExportService',
    '../SystemMaintenanceService',
    '../workflow/ApprovalService',
  ]

  for (const mod of serviceModules) {
    vi.doMock(mod, () => {
      const MockClass = vi.fn()
      return { default: MockClass, [mod.split('/').pop()!.replace(/Service$/, 'Service')]: MockClass }
    })
  }

  return await import('../ServiceContainer')
}

describe('ServiceContainer', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('getInstance returns the same instance (singleton)', async () => {
    const c = await freshContainer()
    // The container is a module-level singleton. freshContainer() calls
    // vi.resetModules() then imports, so the module is cached. A second import
    // WITHOUT resetting returns the same module from the vitest module cache.
    const mod = await import('../ServiceContainer')
    expect(c).toBe(mod.container)
  }, 30_000)

  /* ---------------------------------------------------------------- */
  /*  registerInstance / resolve                                       */
  /* ---------------------------------------------------------------- */
  it('registerInstance stores and resolves an object', async () => {
    const c = await freshContainer()
    const fake = { myService: true } as never
    c.registerInstance('BudgetService', fake)
    expect(c.resolve('BudgetService')).toBe(fake)
  })

  /* ---------------------------------------------------------------- */
  /*  register (factory) / resolve                                     */
  /* ---------------------------------------------------------------- */
  it('register stores a factory that is lazily invoked on resolve', async () => {
    const c = await freshContainer()
    const factory = vi.fn(() => ({ lazy: true }) as never)
    c.register('CashFlowService', factory)

    // Factory should not have been called yet
    expect(factory).not.toHaveBeenCalled()

    const resolved = c.resolve('CashFlowService')
    expect(factory).toHaveBeenCalledOnce()
    expect(resolved).toEqual({ lazy: true })
  })

  it('factory result is cached (singleton per-name)', async () => {
    const c = await freshContainer()
    let callCount = 0
    c.register('ExemptionService', () => {
      callCount++
      return { count: callCount } as never
    })

    const a = c.resolve('ExemptionService')
    const b = c.resolve('ExemptionService')
    expect(a).toBe(b)
    expect(callCount).toBe(1)
  })

  /* ---------------------------------------------------------------- */
  /*  resolve – error when not registered                              */
  /* ---------------------------------------------------------------- */
  it('throws when resolving an unregistered service', async () => {
    const c = await freshContainer()
    expect(() => c.resolve('BudgetService')).toThrowError(/not registered/)
  })

  /* ---------------------------------------------------------------- */
  /*  registerInstance takes precedence over factory                    */
  /* ---------------------------------------------------------------- */
  it('instance takes precedence over factory', async () => {
    const c = await freshContainer()
    c.register('GLAccountService', () => ({ from: 'factory' }) as never)
    c.registerInstance('GLAccountService', { from: 'instance' } as never)

    expect(c.resolve('GLAccountService')).toEqual({ from: 'instance' })
  })

  /* ---------------------------------------------------------------- */
  /*  clear – removes all services and factories                       */
  /* ---------------------------------------------------------------- */
  it('clear removes all registered services and factories', async () => {
    const c = await freshContainer()
    c.registerInstance('BudgetService', { x: 1 } as never)
    c.register('CashFlowService', () => ({ y: 2 }) as never)

    c.clear()

    expect(() => c.resolve('BudgetService')).toThrowError(/not registered/)
    expect(() => c.resolve('CashFlowService')).toThrowError(/not registered/)
  })

  /* ---------------------------------------------------------------- */
  /*  overwriting a factory                                            */
  /* ---------------------------------------------------------------- */
  it('re-registering a factory replaces the previous one', async () => {
    const c = await freshContainer()
    c.register('HireService', () => ({ v: 1 }) as never)
    c.register('HireService', () => ({ v: 2 }) as never)

    expect(c.resolve('HireService')).toEqual({ v: 2 })
  })

  /* ---------------------------------------------------------------- */
  /*  overwriting an instance                                          */
  /* ---------------------------------------------------------------- */
  it('re-registering an instance replaces the previous one', async () => {
    const c = await freshContainer()
    c.registerInstance('PaymentService', { v: 'a' } as never)
    c.registerInstance('PaymentService', { v: 'b' } as never)

    expect(c.resolve('PaymentService')).toEqual({ v: 'b' })
  })

  /* ---------------------------------------------------------------- */
  /*  registerServices() integration                                   */
  /* ---------------------------------------------------------------- */

  it('registerServices registers all academic, finance, and operational services', async () => {
    const { container, registerServices } = await freshContainerWithRegisterServices()
    registerServices()

    // After registering, all services should be resolvable without throwing
    const knownServices = [
      'AcademicSystemService',
      'AttendanceService',
      'ExamAnalysisService',
      'MeritListService',
      'PerformanceAnalysisService',
      'PromotionService',
      'ReportCardService',
      'CBCReportCardService',
      'ExamSchedulerService',
      'ReportCardAnalyticsService',
      'CBCStrandService',
      'JSSTransitionService',
      'BudgetService',
      'CashFlowService',
      'ExemptionService',
      'FixedAssetService',
      'GLAccountService',
      'HireService',
      'PaymentService',
      'BankReconciliationService',
      'CreditAutoApplicationService',
      'FeeProrationService',
      'ScholarshipService',
      'DoubleEntryJournalService',
      'OpeningBalanceService',
      'ProfitAndLossService',
      'ReconciliationService',
      'BudgetEnforcementService',
      'BoardingCostService',
      'TransportCostService',
      'GrantTrackingService',
      'StudentCostService',
      'NEMISExportService',
      'ApprovalService',
      'DataImportService',
      'InventoryService',
      'SystemMaintenanceService',
      'NotificationService',
    ] as const

    for (const name of knownServices) {
      expect(() => container.resolve(name)).not.toThrow()
    }
  }, 30_000)

  it('registerServices factories produce instances lazily', async () => {
    const { container, registerServices } = await freshContainerWithRegisterServices()
    registerServices()

    // Resolve a factory-registered service twice → same cached instance
    const a = container.resolve('BudgetService')
    const b = container.resolve('BudgetService')
    expect(a).toBe(b)
  }, 30_000)

  it('registerServices can be called on a cleared container', async () => {
    const { container, registerServices } = await freshContainerWithRegisterServices()
    registerServices()
    container.clear()

    // After clear, nothing is registered
    expect(() => container.resolve('BudgetService')).toThrowError(/not registered/)

    // Re-register and verify
    registerServices()
    expect(() => container.resolve('BudgetService')).not.toThrow()
  }, 30_000)
})
