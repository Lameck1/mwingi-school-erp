import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw, safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

import type { FixedAssetService } from '../../services/finance/FixedAssetService'

type FixedAssetFilters = Parameters<FixedAssetService['findAll']>[0]
type FixedAssetCreateInput = Parameters<FixedAssetService['create']>[0]
type FixedAssetUpdateInput = Parameters<FixedAssetService['update']>[1]

export function registerFixedAssetHandlers() {
    safeHandleRaw('assets:get-categories', async () => {
        const service = container.resolve('FixedAssetService')
        return await service.getCategories()
    })

    safeHandleRaw('assets:get-financial-periods', async () => {
        const service = container.resolve('FixedAssetService')
        return await service.getFinancialPeriods()
    })

    safeHandleRaw('assets:get-all', async (_event, filters?: FixedAssetFilters) => {
        const service = container.resolve('FixedAssetService')
        return await service.findAll(filters)
    })

    safeHandleRaw('assets:get-one', async (_event, id: number) => {
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
