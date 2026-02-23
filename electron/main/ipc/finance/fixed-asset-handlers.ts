import { z } from 'zod'

import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    CreateFixedAssetTuple,
    FixedAssetFilterSchema,
    UpdateFixedAssetTuple, RunDepreciationTuple
} from '../schemas/finance-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { AssetFilters, CreateAssetData, UpdateAssetData } from '../../services/finance/FixedAssetService'

function toCreateAssetData(data: z.infer<typeof CreateFixedAssetTuple>[0]): CreateAssetData {
    const normalized: CreateAssetData = {
        asset_name: data.asset_name,
        category_id: data.category_id,
        acquisition_date: data.acquisition_date,
        acquisition_cost: data.acquisition_cost
    }

    if (data.accumulated_depreciation !== undefined) { normalized.accumulated_depreciation = data.accumulated_depreciation }
    if (data.asset_code !== undefined) { normalized.asset_code = data.asset_code }
    if (data.description !== undefined) { normalized.description = data.description }
    if (data.serial_number !== undefined) { normalized.serial_number = data.serial_number }
    if (data.location !== undefined) { normalized.location = data.location }
    if (data.supplier_id !== undefined) { normalized.supplier_id = data.supplier_id }
    if (data.warranty_expiry !== undefined) { normalized.warranty_expiry = data.warranty_expiry }

    return normalized
}

function toUpdateAssetData(data: z.infer<typeof UpdateFixedAssetTuple>[1]): UpdateAssetData {
    const normalized: UpdateAssetData = {}

    if (data.asset_name !== undefined) { normalized.asset_name = data.asset_name }
    if (data.category_id !== undefined) { normalized.category_id = data.category_id }
    if (data.acquisition_date !== undefined) { normalized.acquisition_date = data.acquisition_date }
    if (data.acquisition_cost !== undefined) { normalized.acquisition_cost = data.acquisition_cost }
    if (data.accumulated_depreciation !== undefined) { normalized.accumulated_depreciation = data.accumulated_depreciation }
    if (data.asset_code !== undefined) { normalized.asset_code = data.asset_code }
    if (data.description !== undefined) { normalized.description = data.description }
    if (data.serial_number !== undefined) { normalized.serial_number = data.serial_number }
    if (data.location !== undefined) { normalized.location = data.location }
    if (data.supplier_id !== undefined) { normalized.supplier_id = data.supplier_id }
    if (data.warranty_expiry !== undefined) { normalized.warranty_expiry = data.warranty_expiry }

    return normalized
}

function toAssetFilters(filters: z.infer<typeof FixedAssetFilterSchema>): AssetFilters | undefined {
    if (!filters) {
        return undefined
    }
    const normalized: AssetFilters = {}
    if (filters.category_id !== undefined) { normalized.category_id = filters.category_id }
    if (filters.status !== undefined) { normalized.status = filters.status }
    return Object.keys(normalized).length === 0 ? undefined : normalized
}

export function registerFixedAssetHandlers() {
    validatedHandler('assets:get-categories', ROLES.FINANCE, z.void(), async () => {
        const service = container.resolve('FixedAssetService')
        return await service.getCategories()
    })

    validatedHandler('assets:get-financial-periods', ROLES.FINANCE, z.void(), async () => {
        const service = container.resolve('FixedAssetService')
        return await service.getFinancialPeriods()
    })

    validatedHandler('assets:get-all', ROLES.FINANCE, FixedAssetFilterSchema, async (_event, filters) => {
        const service = container.resolve('FixedAssetService')
        return await service.findAll(toAssetFilters(filters))
    })

    validatedHandler('assets:get-one', ROLES.FINANCE, z.number().int().positive(), async (_event, id) => {
        const service = container.resolve('FixedAssetService')
        return await service.findById(id)
    })

    validatedHandlerMulti('assets:create', ROLES.FINANCE, CreateFixedAssetTuple, async (_event, [data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error('Unauthorized: renderer user mismatch')
        }
        const service = container.resolve('FixedAssetService')
        return await service.create(toCreateAssetData(data), actor.id)
    })

    validatedHandlerMulti('assets:update', ROLES.FINANCE, UpdateFixedAssetTuple, async (_event, [id, data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error('Unauthorized: renderer user mismatch')
        }
        const service = container.resolve('FixedAssetService')
        return await service.update(id, toUpdateAssetData(data), actor.id)
    })

    validatedHandlerMulti('assets:run-depreciation', ROLES.FINANCE, RunDepreciationTuple, async (_event, [assetId, periodId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error('Unauthorized: renderer user mismatch')
        }
        const service = container.resolve('FixedAssetService')
        return await service.runDepreciation(assetId, periodId, actor.id)
    })
}
