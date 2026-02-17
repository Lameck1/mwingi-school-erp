import { BudgetEnforcementService } from '../../services/accounting/BudgetEnforcementService'
import { container } from '../../services/base/ServiceContainer'
import { type BudgetFilters, type CreateBudgetData } from '../../services/finance/BudgetService'
import { validateId } from '../../utils/validation'
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

export function registerBudgetHandlers(): void {
    safeHandleRawWithRole('budget:getAll', ROLES.FINANCE, (_event, filters: BudgetFilters = {}) => {
        const service = container.resolve('BudgetService')
        return service.findAll(filters)
    })

    safeHandleRawWithRole('budget:getById', ROLES.FINANCE, (_event, id: number) => {
        const v = validateId(id, 'Budget ID')
        if (!v.success) { return { success: false, error: v.error } }
        const service = container.resolve('BudgetService')
        return service.getBudgetWithLineItems(v.data!)
    })

    safeHandleRawWithRole('budget:create', ROLES.FINANCE, (event, data: CreateBudgetData, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return { success: false, error: actor.error } }
        const service = container.resolve('BudgetService')
        return service.create(data, actor.actorId)
    })

    safeHandleRawWithRole('budget:update', ROLES.FINANCE, (event, id: number, data: Partial<CreateBudgetData>, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return { success: false, error: actor.error } }
        const vId = validateId(id, 'Budget ID')
        if (!vId.success) { return { success: false, error: vId.error } }
        const service = container.resolve('BudgetService')
        return service.update(vId.data!, data, actor.actorId)
    })

    safeHandleRawWithRole('budget:submit', ROLES.FINANCE, (event, budgetId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return { success: false, error: actor.error } }
        const vId = validateId(budgetId, 'Budget ID')
        if (!vId.success) { return { success: false, error: vId.error } }
        const service = container.resolve('BudgetService')
        return service.submitForApproval(vId.data!, actor.actorId)
    })

    safeHandleRawWithRole('budget:approve', ROLES.MANAGEMENT, (event, budgetId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return { success: false, error: actor.error } }
        const vId = validateId(budgetId, 'Budget ID')
        if (!vId.success) { return { success: false, error: vId.error } }
        const service = container.resolve('BudgetService')
        return service.approve(vId.data!, actor.actorId)
    })

    const enforcement = new BudgetEnforcementService()

    safeHandleRawWithRole('budget:validateTransaction', ROLES.FINANCE, async (_event, glAccountCode: string, amount: number, fiscalYear: number, department?: string) => {
        return enforcement.validateTransaction(glAccountCode, amount, fiscalYear, department || null)
    })

    safeHandleRawWithRole('budget:getAllocations', ROLES.FINANCE, async (_event, fiscalYear: number) => {
        return enforcement.getBudgetAllocations(fiscalYear)
    })

    safeHandleRawWithRole('budget:setAllocation', ROLES.FINANCE, async (event, glAccountCode: string, fiscalYear: number, allocatedAmount: number, department: string | null, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        return enforcement.setBudgetAllocation(glAccountCode, fiscalYear, allocatedAmount, department, actor.actorId)
    })

    safeHandleRawWithRole('budget:varianceReport', ROLES.FINANCE, async (_event, fiscalYear: number) => {
        return enforcement.generateBudgetVarianceReport(fiscalYear)
    })

    safeHandleRawWithRole('budget:alerts', ROLES.FINANCE, async (_event, fiscalYear: number, threshold?: number) => {
        return enforcement.getBudgetAlerts(fiscalYear, threshold)
    })
}
