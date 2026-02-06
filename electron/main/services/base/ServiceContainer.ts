/**
 * Simple dependency injection container.
 * Follows Dependency Inversion Principle: High-level modules depend on abstractions.
 */

// Academic Services
import { StudentService } from '../academic/StudentService'
import { AcademicSystemService } from '../academic/AcademicSystemService'
import { AttendanceService } from '../academic/AttendanceService'
import { ExamAnalysisService } from '../academic/ExamAnalysisService'
import { MeritListService } from '../academic/MeritListService'
import { PerformanceAnalysisService } from '../academic/PerformanceAnalysisService'
import { PromotionService } from '../academic/PromotionService'
import { ReportCardService } from '../academic/ReportCardService'

// Finance Services
import { BudgetService } from '../finance/BudgetService'
import { CashFlowService } from '../finance/CashFlowService'
import { ExemptionService } from '../finance/ExemptionService'
import { FixedAssetService } from '../finance/FixedAssetService'
import { GLAccountService } from '../finance/GLAccountService'
import { HireService } from '../finance/HireService'
import { PaymentService } from '../finance/PaymentService'

// Accounting Services
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService'
import { OpeningBalanceService } from '../accounting/OpeningBalanceService'
import { ProfitAndLossService } from '../accounting/ProfitAndLossService'
import { ReconciliationService } from '../accounting/ReconciliationService'
import { BudgetEnforcementService } from '../accounting/BudgetEnforcementService'

// Other Services
import { InventoryService } from '../inventory/InventoryService'
import { SystemMaintenanceService } from '../SystemMaintenanceService'
import { NotificationService } from '../notifications/NotificationService'

type ServiceFactory<T> = () => T
type ServiceInstance = unknown

class ServiceContainer {
    private static instance: ServiceContainer
    private services: Map<string, ServiceInstance> = new Map()
    private factories: Map<string, ServiceFactory<unknown>> = new Map()

    private constructor() { }

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

// Service registration helper - all services registered for DI
export function registerServices(): void {
    // Academic
    container.register('StudentService', () => new StudentService())
    container.register('AcademicSystemService', () => new AcademicSystemService())
    container.register('AttendanceService', () => new AttendanceService())
    container.register('ExamAnalysisService', () => new ExamAnalysisService())
    container.register('MeritListService', () => new MeritListService())
    container.register('PerformanceAnalysisService', () => new PerformanceAnalysisService())
    container.register('PromotionService', () => new PromotionService())
    container.register('ReportCardService', () => new ReportCardService())

    // Finance
    container.register('BudgetService', () => new BudgetService())
    container.register('CashFlowService', () => new CashFlowService())
    container.register('ExemptionService', () => new ExemptionService())
    container.register('FixedAssetService', () => new FixedAssetService())
    container.register('GLAccountService', () => new GLAccountService())
    container.register('HireService', () => new HireService())
    container.register('PaymentService', () => new PaymentService())

    // Accounting
    container.register('DoubleEntryJournalService', () => new DoubleEntryJournalService())
    container.register('OpeningBalanceService', () => new OpeningBalanceService())
    container.register('ProfitAndLossService', () => new ProfitAndLossService())
    container.register('ReconciliationService', () => new ReconciliationService())
    container.register('BudgetEnforcementService', () => new BudgetEnforcementService())

    // Other
    container.register('InventoryService', () => new InventoryService())
    container.register('SystemMaintenanceService', () => new SystemMaintenanceService())
    container.register('NotificationService', () => new NotificationService())
}
