import { BudgetEnforcementService } from '../../services/accounting/BudgetEnforcementService'
import { container } from '../../services/base/ServiceContainer'
import { type BudgetFilters, type CreateBudgetData } from '../../services/finance/BudgetService'
import { validateId } from '../../utils/validation'
import { safeHandleRaw, safeHandleRawWithRole, ROLES } from '../ipc-result'

export function registerBudgetHandlers(): void {
    safeHandleRaw('budget:getAll', (_event, filters: BudgetFilters = {}) => {
        const service = container.resolve('BudgetService')
        return service.findAll(filters)
    })

    safeHandleRaw('budget:getById', (_event, id: number) => {
        const v = validateId(id, 'Budget ID')
        if (!v.success) { return { success: false, error: v.error } }
        const service = container.resolve('BudgetService')
        return service.getBudgetWithLineItems(v.data!)
    })

    safeHandleRaw('budget:create', (_event, data: CreateBudgetData, userId: number) => {
        const vUser = validateId(userId, 'User ID')
        if (!vUser.success) { return { success: false, error: vUser.error } }
        const service = container.resolve('BudgetService')
        return service.create(data, vUser.data!)
    })

    safeHandleRaw('budget:update', (_event, id: number, data: Partial<CreateBudgetData>, userId: number) => {
        const vId = validateId(id, 'Budget ID')
        const vUser = validateId(userId, 'User ID')
        if (!vId.success) { return { success: false, error: vId.error } }
        if (!vUser.success) { return { success: false, error: vUser.error } }
        const service = container.resolve('BudgetService')
        return service.update(vId.data!, data, vUser.data!)
    })

    safeHandleRawWithRole('budget:submit', ROLES.FINANCE, (_event, budgetId: number, userId: number) => {
        const vId = validateId(budgetId, 'Budget ID')
        const vUser = validateId(userId, 'User ID')
        if (!vId.success) { return { success: false, error: vId.error } }
        if (!vUser.success) { return { success: false, error: vUser.error } }
        const service = container.resolve('BudgetService')
        return service.submitForApproval(vId.data!, vUser.data!)
    })

    safeHandleRawWithRole('budget:approve', ROLES.MANAGEMENT, (_event, budgetId: number, userId: number) => {
        const vId = validateId(budgetId, 'Budget ID')
        const vUser = validateId(userId, 'User ID')
        if (!vId.success) { return { success: false, error: vId.error } }
        if (!vUser.success) { return { success: false, error: vUser.error } }
        const service = container.resolve('BudgetService')
        return service.approve(vId.data!, vUser.data!)
    })

    const enforcement = new BudgetEnforcementService()

    safeHandleRaw('budget:validateTransaction', async (_event, glAccountCode: string, amount: number, fiscalYear: number, department?: string) => {
        return enforcement.validateTransaction(glAccountCode, amount, fiscalYear, department || null)
    })

    safeHandleRaw('budget:getAllocations', async (_event, fiscalYear: number) => {
        return enforcement.getBudgetAllocations(fiscalYear)
    })

    safeHandleRawWithRole('budget:setAllocation', ROLES.FINANCE, async (_event, glAccountCode: string, fiscalYear: number, allocatedAmount: number, department: string | null, userId: number) => {
        return enforcement.setBudgetAllocation(glAccountCode, fiscalYear, allocatedAmount, department, userId)
    })

    safeHandleRaw('budget:varianceReport', async (_event, fiscalYear: number) => {
        return enforcement.generateBudgetVarianceReport(fiscalYear)
    })

    safeHandleRaw('budget:alerts', async (_event, fiscalYear: number, threshold?: number) => {
        return enforcement.getBudgetAlerts(fiscalYear, threshold)
    })
}
