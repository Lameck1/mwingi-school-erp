/**
 * Simple dependency injection container.
 * Follows Dependency Inversion Principle: High-level modules depend on abstractions.
 */

import { StudentService } from '../academic/StudentService'
import { BudgetService } from '../finance/BudgetService'
import { InventoryService } from '../inventory/InventoryService'
import { FixedAssetService } from '../finance/FixedAssetService'
import { SystemMaintenanceService } from '../SystemMaintenanceService'

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

// Service registration helper
export function registerServices(): void {
    container.register('StudentService', () => new StudentService())
    container.register('BudgetService', () => new BudgetService())
    container.register('InventoryService', () => new InventoryService())
    container.register('FixedAssetService', () => new FixedAssetService())
    container.register('SystemMaintenanceService', () => new SystemMaintenanceService())
}
