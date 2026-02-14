import { container } from '../../services/base/ServiceContainer'
import { type BudgetFilters, type CreateBudgetData } from '../../services/finance/BudgetService'
import { validateId } from '../../utils/validation'
import { safeHandleRaw } from '../ipc-result'

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

    safeHandleRaw('budget:submit', (_event, budgetId: number, userId: number) => {
        const vId = validateId(budgetId, 'Budget ID')
        const vUser = validateId(userId, 'User ID')
        if (!vId.success) { return { success: false, error: vId.error } }
        if (!vUser.success) { return { success: false, error: vUser.error } }
        const service = container.resolve('BudgetService')
        return service.submitForApproval(vId.data!, vUser.data!)
    })

    safeHandleRaw('budget:approve', (_event, budgetId: number, userId: number) => {
        const vId = validateId(budgetId, 'Budget ID')
        const vUser = validateId(userId, 'User ID')
        if (!vId.success) { return { success: false, error: vId.error } }
        if (!vUser.success) { return { success: false, error: vUser.error } }
        const service = container.resolve('BudgetService')
        return service.approve(vId.data!, vUser.data!)
    })
}
