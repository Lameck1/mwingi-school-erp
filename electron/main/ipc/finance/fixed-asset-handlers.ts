import { container } from '../../services/base/ServiceContainer'
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

import type { FixedAssetService } from '../../services/finance/FixedAssetService'

type FixedAssetFilters = Parameters<FixedAssetService['findAll']>[0]
type FixedAssetCreateInput = Parameters<FixedAssetService['create']>[0]
type FixedAssetUpdateInput = Parameters<FixedAssetService['update']>[1]

export function registerFixedAssetHandlers() {
    safeHandleRawWithRole('assets:get-categories', ROLES.FINANCE, async () => {
        const service = container.resolve('FixedAssetService')
        return await service.getCategories()
    })

    safeHandleRawWithRole('assets:get-financial-periods', ROLES.FINANCE, async () => {
        const service = container.resolve('FixedAssetService')
        return await service.getFinancialPeriods()
    })

    safeHandleRawWithRole('assets:get-all', ROLES.FINANCE, async (_event, filters?: FixedAssetFilters) => {
        const service = container.resolve('FixedAssetService')
        return await service.findAll(filters)
    })

    safeHandleRawWithRole('assets:get-one', ROLES.FINANCE, async (_event, id: number) => {
        const service = container.resolve('FixedAssetService')
        return await service.findById(id)
    })

    safeHandleRawWithRole('assets:create', ROLES.FINANCE, async (event, data: FixedAssetCreateInput, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        const service = container.resolve('FixedAssetService')
        return await service.create(data, actor.actorId)
    })

    safeHandleRawWithRole('assets:update', ROLES.FINANCE, async (event, id: number, data: FixedAssetUpdateInput, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        const service = container.resolve('FixedAssetService')
        return await service.update(id, data, actor.actorId)
    })

    safeHandleRawWithRole('assets:run-depreciation', ROLES.FINANCE, async (event, assetId: number, periodId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        const service = container.resolve('FixedAssetService')
        return await service.runDepreciation(assetId, periodId, actor.actorId)
    })

    // Add delete/dispose handlers if needed
}
