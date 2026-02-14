import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw } from '../ipc-result'

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

    safeHandleRaw('assets:create', async (_event, data: FixedAssetCreateInput, userId: number) => {
        const service = container.resolve('FixedAssetService')
        return await service.create(data, userId)
    })

    safeHandleRaw('assets:update', async (_event, id: number, data: FixedAssetUpdateInput, userId: number) => {
        const service = container.resolve('FixedAssetService')
        return await service.update(id, data, userId)
    })

    safeHandleRaw('assets:run-depreciation', async (_event, assetId: number, periodId: number, userId: number) => {
        const service = container.resolve('FixedAssetService')
        return await service.runDepreciation(assetId, periodId, userId)
    })

    // Add delete/dispose handlers if needed
}
