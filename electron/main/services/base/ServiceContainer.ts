/**
 * Simple dependency injection container.
 * Follows Dependency Inversion Principle: High-level modules depend on abstractions.
 */

import { AcademicSystemService } from '../academic/AcademicSystemService'
import { AttendanceService } from '../academic/AttendanceService'
import { CBCReportCardService } from '../academic/CBCReportCardService'
import { ExamAnalysisService } from '../academic/ExamAnalysisService'
import examSchedulerService from '../academic/ExamSchedulerService'
import { MeritListService } from '../academic/MeritListService'
import { PerformanceAnalysisService } from '../academic/PerformanceAnalysisService'
import { PromotionService } from '../academic/PromotionService'
import reportCardAnalyticsService from '../academic/ReportCardAnalyticsService'
import { ReportCardService } from '../academic/ReportCardService'
import { BudgetEnforcementService } from '../accounting/BudgetEnforcementService'
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService'
import { OpeningBalanceService } from '../accounting/OpeningBalanceService'
import { ProfitAndLossService } from '../accounting/ProfitAndLossService'
import { ReconciliationService } from '../accounting/ReconciliationService'
import { CBCStrandService } from '../cbc/CBCStrandService'
import { JSSTransitionService } from '../cbc/JSSTransitionService'
import { DataImportService } from '../data/DataImportService'
import { BankReconciliationService } from '../finance/BankReconciliationService'
import { BudgetService } from '../finance/BudgetService'
import { CashFlowService } from '../finance/CashFlowService'
import { CreditAutoApplicationService } from '../finance/CreditAutoApplicationService'
import { ExemptionService } from '../finance/ExemptionService'
import { FeeProrationService } from '../finance/FeeProrationService'
import { FixedAssetService } from '../finance/FixedAssetService'
import { GLAccountService } from '../finance/GLAccountService'
import { HireService } from '../finance/HireService'
import { PaymentService } from '../finance/PaymentService'
import { ScholarshipService } from '../finance/ScholarshipService'
import { InventoryService } from '../inventory/InventoryService'
import { NotificationService } from '../notifications/NotificationService'
import { BoardingCostService } from '../operations/BoardingCostService'
import { GrantTrackingService } from '../operations/GrantTrackingService'
import { StudentCostService } from '../operations/StudentCostService'
import { TransportCostService } from '../operations/TransportCostService'
import { NEMISExportService } from '../reports/NEMISExportService'
import { ApprovalService } from '../workflow/ApprovalService'
import { SystemMaintenanceService } from '../SystemMaintenanceService'

export interface ServiceMap {
    AcademicSystemService: AcademicSystemService
    AttendanceService: AttendanceService
    ExamAnalysisService: ExamAnalysisService
    MeritListService: MeritListService
    PerformanceAnalysisService: PerformanceAnalysisService
    PromotionService: PromotionService
    ReportCardService: ReportCardService
    CBCReportCardService: CBCReportCardService
    ExamSchedulerService: typeof examSchedulerService
    ReportCardAnalyticsService: typeof reportCardAnalyticsService
    CBCStrandService: CBCStrandService
    JSSTransitionService: JSSTransitionService
    BudgetService: BudgetService
    CashFlowService: CashFlowService
    ExemptionService: ExemptionService
    FixedAssetService: FixedAssetService
    GLAccountService: GLAccountService
    HireService: HireService
    PaymentService: PaymentService
    BankReconciliationService: BankReconciliationService
    CreditAutoApplicationService: CreditAutoApplicationService
    FeeProrationService: FeeProrationService
    ScholarshipService: ScholarshipService
    DoubleEntryJournalService: DoubleEntryJournalService
    OpeningBalanceService: OpeningBalanceService
    ProfitAndLossService: ProfitAndLossService
    ReconciliationService: ReconciliationService
    BudgetEnforcementService: BudgetEnforcementService
    BoardingCostService: BoardingCostService
    TransportCostService: TransportCostService
    GrantTrackingService: GrantTrackingService
    StudentCostService: StudentCostService
    NEMISExportService: NEMISExportService
    ApprovalService: ApprovalService
    DataImportService: DataImportService
    InventoryService: InventoryService
    SystemMaintenanceService: unknown
    NotificationService: NotificationService
}

type ServiceFactory<T> = () => T

class ServiceContainer {
    private static instance: ServiceContainer | undefined
    private readonly services: Map<string, unknown> = new Map()
    private readonly factories: Map<string, ServiceFactory<unknown>> = new Map()

    private constructor() { }

    static getInstance(): ServiceContainer {
        ServiceContainer.instance ??= new ServiceContainer()
        return ServiceContainer.instance
    }

    /**
     * Register a service factory (lazy instantiation).
     */
    register<K extends keyof ServiceMap>(name: K, factory: ServiceFactory<ServiceMap[K]>): void {
        this.factories.set(name, factory as ServiceFactory<unknown>)
    }

    /**
     * Register a singleton instance.
     */
    registerInstance<K extends keyof ServiceMap>(name: K, instance: ServiceMap[K]): void {
        this.services.set(name, instance)
    }

    /**
     * Resolve a service by name (type-safe).
     */
    resolve<K extends keyof ServiceMap>(name: K): ServiceMap[K] {
        // Check for existing instance
        if (this.services.has(name)) {
            return this.services.get(name) as ServiceMap[K]
        }

        // Check for factory
        const factory = this.factories.get(name)
        if (factory) {
            const instance = factory() as ServiceMap[K]
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

function registerAcademicServices(): void {
    container.register('AcademicSystemService', () => new AcademicSystemService())
    container.register('AttendanceService', () => new AttendanceService())
    container.register('ExamAnalysisService', () => new ExamAnalysisService())
    container.register('MeritListService', () => new MeritListService())
    container.register('PerformanceAnalysisService', () => new PerformanceAnalysisService())
    container.register('PromotionService', () => new PromotionService())
    container.register('ReportCardService', () => new ReportCardService())
    container.register('CBCReportCardService', () => new CBCReportCardService())
    container.registerInstance('ExamSchedulerService', examSchedulerService)
    container.registerInstance('ReportCardAnalyticsService', reportCardAnalyticsService)
    container.register('CBCStrandService', () => new CBCStrandService())
    container.register('JSSTransitionService', () => new JSSTransitionService())
}

function registerFinanceAndAccountingServices(): void {
    container.register('BudgetService', () => new BudgetService())
    container.register('CashFlowService', () => new CashFlowService())
    container.register('ExemptionService', () => new ExemptionService())
    container.register('FixedAssetService', () => new FixedAssetService())
    container.register('GLAccountService', () => new GLAccountService())
    container.register('HireService', () => new HireService())
    container.register('PaymentService', () => new PaymentService())
    container.register('BankReconciliationService', () => new BankReconciliationService())
    container.register('CreditAutoApplicationService', () => new CreditAutoApplicationService())
    container.register('FeeProrationService', () => new FeeProrationService())
    container.register('ScholarshipService', () => new ScholarshipService())
    container.register('DoubleEntryJournalService', () => new DoubleEntryJournalService())
    container.register('OpeningBalanceService', () => new OpeningBalanceService())
    container.register('ProfitAndLossService', () => new ProfitAndLossService())
    container.register('ReconciliationService', () => new ReconciliationService())
    container.register('BudgetEnforcementService', () => new BudgetEnforcementService())
}

function registerOperationalServices(): void {
    container.register('BoardingCostService', () => new BoardingCostService())
    container.register('TransportCostService', () => new TransportCostService())
    container.register('GrantTrackingService', () => new GrantTrackingService())
    container.register('StudentCostService', () => new StudentCostService())
    container.register('NEMISExportService', () => new NEMISExportService())
    container.register('ApprovalService', () => new ApprovalService())
    container.register('DataImportService', () => new DataImportService())
    container.register('InventoryService', () => new InventoryService())
    container.register('SystemMaintenanceService', () => new SystemMaintenanceService())
    container.register('NotificationService', () => new NotificationService())
}

// Service registration helper - all services registered for DI
export function registerServices(): void {
    registerAcademicServices()
    registerFinanceAndAccountingServices()
    registerOperationalServices()
}
