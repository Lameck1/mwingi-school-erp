import { ipcMain } from '../../electron-env'
import { container } from '../../services/base/ServiceContainer'

import type { FixedAssetService } from '../../services/finance/FixedAssetService'
import type { IpcMainInvokeEvent } from 'electron'

type FixedAssetFilters = Parameters<FixedAssetService['findAll']>[0]
type FixedAssetCreateInput = Parameters<FixedAssetService['create']>[0]
type FixedAssetUpdateInput = Parameters<FixedAssetService['update']>[1]

export function registerFixedAssetHandlers() {
    ipcMain.handle('assets:get-all', async (_event: IpcMainInvokeEvent, filters?: FixedAssetFilters) => {
        const service = container.resolve<FixedAssetService>('FixedAssetService')
        return await service.findAll(filters)
    })

    ipcMain.handle('assets:get-one', async (_event: IpcMainInvokeEvent, id: number) => {
        const service = container.resolve<FixedAssetService>('FixedAssetService')
        return await service.findById(id)
    })

    ipcMain.handle('assets:create', async (_event: IpcMainInvokeEvent, data: FixedAssetCreateInput, userId: number) => {
        const service = container.resolve<FixedAssetService>('FixedAssetService')
        return await service.create(data, userId)
    })

    ipcMain.handle('assets:update', async (_event: IpcMainInvokeEvent, id: number, data: FixedAssetUpdateInput, userId: number) => {
        const service = container.resolve<FixedAssetService>('FixedAssetService')
        return await service.update(id, data, userId)
    })

    ipcMain.handle('assets:run-depreciation', async (_event: IpcMainInvokeEvent, assetId: number, periodId: number, userId: number) => {
        const service = container.resolve<FixedAssetService>('FixedAssetService')
        return await service.runDepreciation(assetId, periodId, userId)
    })

    // Add delete/dispose handlers if needed
}
