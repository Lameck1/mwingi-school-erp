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

import type { BudgetFilters, CreateBudgetData } from '../../services/finance/BudgetService'

function normalizeBudgetFilters(filters: z.infer<typeof BudgetFilterSchema>): BudgetFilters {
    const normalized: BudgetFilters = {}
    if (filters?.fiscal_year !== undefined) {
        normalized.academic_year_id = filters.fiscal_year
    }
    if (filters?.status !== undefined) {
        normalized.status = filters.status
    }
    return normalized
}

function normalizeCreateBudgetData(data: z.infer<typeof CreateBudgetTuple>[0]): CreateBudgetData {
    const normalizedLineItems: CreateBudgetData['line_items'] = data.line_items.map((item) => {
        const normalizedItem: {
            category_id: number
            description: string
            budgeted_amount: number
            notes?: string
        } = {
            category_id: item.category_id,
            description: item.description,
            budgeted_amount: item.budgeted_amount
        }
        if (item.notes !== undefined) {
            normalizedItem.notes = item.notes
        }
        return normalizedItem
    })

    const normalized: CreateBudgetData = {
        budget_name: data.budget_name,
        academic_year_id: data.academic_year_id,
        line_items: normalizedLineItems
    }
    if (data.term_id !== undefined) {
        normalized.term_id = data.term_id
    }
    if (data.notes !== undefined) {
        normalized.notes = data.notes
    }
    return normalized
}

function normalizeUpdateBudgetData(data: z.infer<typeof UpdateBudgetTuple>[1]): Partial<CreateBudgetData> {
    const normalized: Partial<CreateBudgetData> = {}

    if (data.budget_name !== undefined) { normalized.budget_name = data.budget_name }
    if (data.academic_year_id !== undefined) { normalized.academic_year_id = data.academic_year_id }
    if (data.term_id !== undefined) { normalized.term_id = data.term_id }
    if (data.notes !== undefined) { normalized.notes = data.notes }
    if (data.line_items !== undefined) {
        normalized.line_items = data.line_items.map((item) => {
            const normalizedItem: {
                category_id: number
                description: string
                budgeted_amount: number
                notes?: string
            } = {
                category_id: item.category_id,
                description: item.description,
                budgeted_amount: item.budgeted_amount
            }
            if (item.notes !== undefined) {
                normalizedItem.notes = item.notes
            }
            return normalizedItem
        })
    }

    return normalized
}

export function registerBudgetHandlers(): void {
    validatedHandler('budget:getAll', ROLES.FINANCE, BudgetFilterSchema, (_event, filters) => {
        const service = container.resolve('BudgetService')
        return service.findAll(normalizeBudgetFilters(filters))
    })

    validatedHandler('budget:getById', ROLES.FINANCE, z.number().int().positive(), (_event, id) => {
        const service = container.resolve('BudgetService')
        return service.getBudgetWithLineItems(id)
    })

    validatedHandlerMulti('budget:create', ROLES.FINANCE, CreateBudgetTuple, (_event, [data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error('Unauthorized: renderer user mismatch')
        }
        const service = container.resolve('BudgetService')
        return service.create(normalizeCreateBudgetData(data), actor.id)
    })

    validatedHandlerMulti('budget:update', ROLES.FINANCE, UpdateBudgetTuple, (_event, [id, data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error('Unauthorized: renderer user mismatch')
        }
        const service = container.resolve('BudgetService')
        return service.update(id, normalizeUpdateBudgetData(data), actor.id)
    })

    validatedHandlerMulti('budget:submit', ROLES.FINANCE, PeriodProcessTuple, (_event, [budgetId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error('Unauthorized: renderer user mismatch')
        }
        const service = container.resolve('BudgetService')
        return service.submitForApproval(budgetId, actor.id)
    })

    validatedHandlerMulti('budget:approve', ROLES.MANAGEMENT, PeriodProcessTuple, (_event, [budgetId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error('Unauthorized: renderer user mismatch')
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

    validatedHandlerMulti('budget:setAllocation', ROLES.FINANCE, SetAllocationTuple, async (_event, [glAccountCode, fiscalYear, allocatedAmount, department, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error('Unauthorized: renderer user mismatch')
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
