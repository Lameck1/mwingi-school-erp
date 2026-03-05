import { z } from 'zod'

import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    ClientFilterSchema, HireClientUpdateSchema,
    AssetFilterSchema, HireAssetSchema, CheckAvailabilityTuple,
    BookingFilterSchema, CreateBookingTuple, UpdateBookingStatusTuple,
    RecordPaymentTuple
} from '../schemas/hire-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { HireAsset, HireBooking, HireClient } from '../../services/finance/HireService'

const svc = () => container.resolve('HireService')

export function registerHireHandlers(): void {
    // ========== CLIENTS ==========
    validatedHandler('hire:getClients', ROLES.STAFF, ClientFilterSchema, (_event, filters) => {
        if (!filters) {
            return svc().getClients()
        }
        const normalized: { search?: string; isActive?: boolean } = {}
        if (filters.search !== undefined) {
            normalized.search = filters.search
        }
        if (filters.isActive !== undefined) {
            normalized.isActive = filters.isActive
        }
        return svc().getClients(normalized)
    })

    validatedHandler('hire:getClientById', ROLES.STAFF, z.number().int().positive(), (_event, id) => {
        return svc().getClientById(id)
    })

    validatedHandler('hire:createClient', ROLES.STAFF, HireClientUpdateSchema, (_event, data) => {
        const normalized: Partial<HireClient> = {}
        if (data.client_name !== undefined) {
            normalized.client_name = data.client_name
        }
        if (data.contact_phone !== undefined) {
            normalized.contact_phone = data.contact_phone
        }
        if (data.contact_email !== undefined) {
            normalized.contact_email = data.contact_email
        }
        if (data.is_active !== undefined) {
            normalized.is_active = data.is_active
        }
        return svc().createClient(normalized)
    })

    validatedHandlerMulti('hire:updateClient', ROLES.STAFF, z.tuple([z.number().int().positive(), HireClientUpdateSchema]), (_event, [id, data]) => {
        const normalized: Partial<HireClient> = {}
        if (data.client_name !== undefined) {
            normalized.client_name = data.client_name
        }
        if (data.contact_phone !== undefined) {
            normalized.contact_phone = data.contact_phone
        }
        if (data.contact_email !== undefined) {
            normalized.contact_email = data.contact_email
        }
        if (data.is_active !== undefined) {
            normalized.is_active = data.is_active
        }
        return svc().updateClient(id, normalized)
    })

    // ========== ASSETS ==========
    validatedHandler('hire:getAssets', ROLES.STAFF, AssetFilterSchema, (_event, filters) => {
        if (!filters) {
            return svc().getAssets()
        }
        const normalized: { type?: string; isActive?: boolean } = {}
        if (filters.type !== undefined) {
            normalized.type = filters.type
        }
        if (filters.isActive !== undefined) {
            normalized.isActive = filters.isActive
        }
        return svc().getAssets(normalized)
    })

    validatedHandler('hire:getAssetById', ROLES.STAFF, z.number().int().positive(), (_event, id) => {
        return svc().getAssetById(id)
    })

    validatedHandler('hire:createAsset', ROLES.STAFF, HireAssetSchema, (_event, data) => {
        const normalized: Partial<HireAsset> = {}
        if (data.asset_name !== undefined) {
            normalized.asset_name = data.asset_name
        }
        if (data.asset_type !== undefined) {
            normalized.asset_type = data.asset_type
        }
        if (data.default_rate !== undefined) {
            normalized.default_rate = data.default_rate
        }
        if (data.is_active !== undefined) {
            normalized.is_active = data.is_active
        }
        return svc().createAsset(normalized)
    })

    validatedHandlerMulti('hire:updateAsset', ROLES.STAFF, z.tuple([z.number().int().positive(), HireAssetSchema]), (_event, [id, data]) => {
        const normalized: Partial<HireAsset> = {}
        if (data.asset_name !== undefined) {
            normalized.asset_name = data.asset_name
        }
        if (data.asset_type !== undefined) {
            normalized.asset_type = data.asset_type
        }
        if (data.default_rate !== undefined) {
            normalized.default_rate = data.default_rate
        }
        if (data.is_active !== undefined) {
            normalized.is_active = data.is_active
        }
        return svc().updateAsset(id, normalized)
    })

    validatedHandlerMulti('hire:checkAvailability', ROLES.STAFF, CheckAvailabilityTuple, (_event, [assetId, hireDate, returnDate]) => {
        return svc().checkAssetAvailability(assetId, hireDate, returnDate)
    })

    // ========== BOOKINGS ==========
    validatedHandler('hire:getBookings', ROLES.STAFF, BookingFilterSchema, (_event, filters) => {
        if (!filters) {
            return svc().getBookings()
        }
        const normalized: { status?: string; assetId?: number; clientId?: number } = {}
        if (filters.status !== undefined) {
            normalized.status = filters.status
        }
        if (filters.assetId !== undefined) {
            normalized.assetId = filters.assetId
        }
        if (filters.clientId !== undefined) {
            normalized.clientId = filters.clientId
        }
        return svc().getBookings(normalized)
    })

    validatedHandler('hire:getBookingById', ROLES.STAFF, z.number().int().positive(), (_event, id) => {
        return svc().getBookingById(id)
    })

    validatedHandlerMulti('hire:createBooking', ROLES.STAFF, CreateBookingTuple, (_event, [data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const normalized: Partial<HireBooking> = {
            asset_id: data.asset_id,
            client_id: data.client_id,
            hire_date: data.hire_date,
            total_amount: data.total_amount,
            ...(data.return_date === undefined ? {} : { return_date: data.return_date }),
            ...(data.status === undefined ? {} : { status: data.status })
        }
        return svc().createBooking(normalized, actor.id)
    })

    validatedHandlerMulti('hire:updateBookingStatus', ROLES.STAFF, UpdateBookingStatusTuple, (_event, [id, status]) => {
        return svc().updateBookingStatus(id, status)
    })

    // ========== PAYMENTS ==========
    validatedHandlerMulti('hire:recordPayment', ROLES.STAFF, RecordPaymentTuple, (_event, [bookingId, data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return svc().recordPayment(bookingId, data, actor.id)
    })

    validatedHandler('hire:getPaymentsByBooking', ROLES.STAFF, z.number().int().positive(), (_event, bookingId) => {
        return svc().getPaymentsByBooking(bookingId)
    })

    // ========== STATS ==========
    validatedHandler('hire:getStats', ROLES.STAFF, z.void(), () => {
        return svc().getHireStats()
    })
}
