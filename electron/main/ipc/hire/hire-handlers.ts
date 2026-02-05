import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { HireService } from '../../services/finance/HireService'

// Local interfaces to avoid importing from src/ which is not in electron tsconfig
interface HireClient {
    id: number; client_name: string; contact_phone?: string; contact_email?: string; is_active: number;
}
interface HireAsset {
    id: number; asset_name: string; asset_type: 'VEHICLE' | 'FACILITY' | 'EQUIPMENT' | 'OTHER'; default_rate?: number; is_active: number;
}
interface HireBooking {
    id: number; asset_id: number; client_id: number; hire_date: string; total_amount: number; status: 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}
interface HirePayment {
    id: number; booking_id: number; amount: number; payment_date: string;
}

export function registerHireHandlers(): void {
    const hireService = new HireService()

    // ========== CLIENTS ==========
    ipcMain.handle('hire:getClients', async (_event: IpcMainInvokeEvent, filters?: { search?: string; isActive?: boolean }) => {
        return hireService.getClients(filters)
    })

    ipcMain.handle('hire:getClientById', async (_event: IpcMainInvokeEvent, id: number) => {
        return hireService.getClientById(id)
    })

    ipcMain.handle('hire:createClient', async (_event: IpcMainInvokeEvent, data: Partial<HireClient>) => {
        return hireService.createClient(data)
    })

    ipcMain.handle('hire:updateClient', async (_event: IpcMainInvokeEvent, id: number, data: Partial<HireClient>) => {
        return hireService.updateClient(id, data)
    })

    // ========== ASSETS ==========
    ipcMain.handle('hire:getAssets', async (_event: IpcMainInvokeEvent, filters?: { type?: string; isActive?: boolean }) => {
        return hireService.getAssets(filters)
    })

    ipcMain.handle('hire:getAssetById', async (_event: IpcMainInvokeEvent, id: number) => {
        return hireService.getAssetById(id)
    })

    ipcMain.handle('hire:createAsset', async (_event: IpcMainInvokeEvent, data: Partial<HireAsset>) => {
        return hireService.createAsset(data)
    })

    ipcMain.handle('hire:updateAsset', async (_event: IpcMainInvokeEvent, id: number, data: Partial<HireAsset>) => {
        return hireService.updateAsset(id, data)
    })

    ipcMain.handle('hire:checkAvailability', async (_event: IpcMainInvokeEvent, assetId: number, hireDate: string, returnDate?: string) => {
        return hireService.checkAssetAvailability(assetId, hireDate, returnDate)
    })

    // ========== BOOKINGS ==========
    ipcMain.handle('hire:getBookings', async (_event: IpcMainInvokeEvent, filters?: { status?: string; assetId?: number; clientId?: number }) => {
        return hireService.getBookings(filters)
    })

    ipcMain.handle('hire:getBookingById', async (_event: IpcMainInvokeEvent, id: number) => {
        return hireService.getBookingById(id)
    })

    ipcMain.handle('hire:createBooking', async (_event: IpcMainInvokeEvent, data: Partial<HireBooking>, userId: number) => {
        return hireService.createBooking(data, userId)
    })

    ipcMain.handle('hire:updateBookingStatus', async (_event: IpcMainInvokeEvent, id: number, status: string) => {
        return hireService.updateBookingStatus(id, status)
    })

    // ========== PAYMENTS ==========
    ipcMain.handle('hire:recordPayment', async (_event: IpcMainInvokeEvent, bookingId: number, data: Partial<HirePayment>, userId: number) => {
        return hireService.recordPayment(bookingId, data, userId)
    })

    ipcMain.handle('hire:getPaymentsByBooking', async (_event: IpcMainInvokeEvent, bookingId: number) => {
        return hireService.getPaymentsByBooking(bookingId)
    })

    // ========== STATS ==========
    ipcMain.handle('hire:getStats', async () => {
        return hireService.getHireStats()
    })
}
