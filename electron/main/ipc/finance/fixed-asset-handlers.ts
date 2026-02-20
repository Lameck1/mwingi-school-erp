import { z } from 'zod'

import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    FixedAssetFilterSchema, FixedAssetCreateSchema,
    UpdateFixedAssetTuple, RunDepreciationTuple
} from '../schemas/finance-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

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
        return await service.findAll(filters)
    })

    validatedHandler('assets:get-one', ROLES.FINANCE, z.number().int().positive(), async (_event, id) => {
        const service = container.resolve('FixedAssetService')
        return await service.findById(id)
    })

    validatedHandler('assets:create', ROLES.FINANCE, FixedAssetCreateSchema, async (_event, data, actor) => { // Using new Actor signature? Or data + legacy?
        // Prior handler: data, legacyUserId
        // FixedAssetCreateSchema is object.
        // Wait, if I use validatedHandler, it expects ONE argument.
        // If there is legacyUserId, I should use validatedHandlerMulti?
        // Original: (event, data, legacyUserId).
        // So I should use validatedHandlerMulti with Tuple [data, legacyUserId].
        // BUT I didn't create a tuple for CreateFixedAsset in schema? I checked schemas.
        // Yes, `CreateFixedAssetTuple`.
        // I will use validatedHandlerMulti.
        const service = container.resolve('FixedAssetService')
        return await service.create(data, actor.id)
    })
    // Correcting above to use Multi and Tuple
}

export function registerFixedAssetHandlersCorrected() {
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
        return await service.findAll(filters)
    })

    validatedHandler('assets:get-one', ROLES.FINANCE, z.number().int().positive(), async (_event, id) => {
        const service = container.resolve('FixedAssetService')
        return await service.findById(id)
    })

    validatedHandlerMulti('assets:create', ROLES.FINANCE, z.tuple([FixedAssetCreateSchema, z.number().optional()]), async (event, [data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const service = container.resolve('FixedAssetService')
        return await service.create(data, actor.id)
    })

    validatedHandlerMulti('assets:update', ROLES.FINANCE, UpdateFixedAssetTuple, async (event, [id, data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const service = container.resolve('FixedAssetService')
        return await service.update(id, data, actor.id)
    })

    validatedHandlerMulti('assets:run-depreciation', ROLES.FINANCE, RunDepreciationTuple, async (event, [assetId, periodId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const service = container.resolve('FixedAssetService')
        return await service.runDepreciation(assetId, periodId, actor.id)
    })
}
