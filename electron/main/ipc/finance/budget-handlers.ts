import { z } from 'zod'

import { BudgetEnforcementService } from '../../services/accounting/BudgetEnforcementService'
import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    BudgetFilterSchema, CreateBudgetTuple, UpdateBudgetTuple,
    PeriodProcessTuple, ValidateTransactionTuple, SetAllocationTuple,
    BudgetAlertsTuple, FiscalYearSchema
} from '../schemas/finance-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

export function registerBudgetHandlers(): void {
    validatedHandler('budget:getAll', ROLES.FINANCE, BudgetFilterSchema, (_event, filters) => {
        const service = container.resolve('BudgetService')
        return service.findAll(filters || {})
    })

    validatedHandler('budget:getById', ROLES.FINANCE, z.number().int().positive(), (_event, id) => {
        const service = container.resolve('BudgetService')
        return service.getBudgetWithLineItems(id)
    })

    validatedHandlerMulti('budget:create', ROLES.FINANCE, CreateBudgetTuple, (event, [data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const service = container.resolve('BudgetService')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return service.create(data as any, actor.id)
    })

    validatedHandlerMulti('budget:update', ROLES.FINANCE, UpdateBudgetTuple, (event, [id, data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const service = container.resolve('BudgetService')
        return service.update(id, data, actor.id)
    })

    validatedHandlerMulti('budget:submit', ROLES.FINANCE, PeriodProcessTuple, (event, [budgetId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const service = container.resolve('BudgetService')
        return service.submitForApproval(budgetId, actor.id)
    })

    validatedHandlerMulti('budget:approve', ROLES.MANAGEMENT, PeriodProcessTuple, (event, [budgetId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const service = container.resolve('BudgetService')
        return service.approve(budgetId, actor.id)
    })

    const enforcement = new BudgetEnforcementService()

    validatedHandlerMulti('budget:validateTransaction', ROLES.FINANCE, ValidateTransactionTuple, async (_event, [glAccountCode, amount, fiscalYear, department]) => {
        // Zod validates types.
        return enforcement.validateTransaction(glAccountCode, amount, fiscalYear, department || null)
    })

    validatedHandler('budget:getAllocations', ROLES.FINANCE, FiscalYearSchema, async (_event, fiscalYear) => {
        return enforcement.getBudgetAllocations(fiscalYear)
    })

    validatedHandlerMulti('budget:setAllocation', ROLES.FINANCE, SetAllocationTuple, async (event, [glAccountCode, fiscalYear, allocatedAmount, department, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return enforcement.setBudgetAllocation(glAccountCode, fiscalYear, allocatedAmount, department, actor.id)
    })

    validatedHandler('budget:varianceReport', ROLES.FINANCE, FiscalYearSchema, async (_event, fiscalYear) => {
        return enforcement.generateBudgetVarianceReport(fiscalYear)
    })

    validatedHandlerMulti('budget:alerts', ROLES.FINANCE, BudgetAlertsTuple, async (_event, [fiscalYear, threshold]) => {
        return enforcement.getBudgetAlerts(fiscalYear, threshold)
    })
}
