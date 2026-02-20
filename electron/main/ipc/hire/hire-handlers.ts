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

const svc = () => container.resolve('HireService')

export function registerHireHandlers(): void {
    // ========== CLIENTS ==========
    validatedHandler('hire:getClients', ROLES.STAFF, ClientFilterSchema, (_event, filters) => {
        return svc().getClients(filters)
    })

    validatedHandler('hire:getClientById', ROLES.STAFF, z.number().int().positive(), (_event, id) => {
        return svc().getClientById(id)
    })

    validatedHandler('hire:createClient', ROLES.STAFF, HireClientUpdateSchema, (_event, data) => {
        return svc().createClient(data)
    })

    validatedHandlerMulti('hire:updateClient', ROLES.STAFF, z.tuple([z.number().int().positive(), HireClientUpdateSchema]), (_event, [id, data]) => {
        return svc().updateClient(id, data)
    })

    // ========== ASSETS ==========
    validatedHandler('hire:getAssets', ROLES.STAFF, AssetFilterSchema, (_event, filters) => {
        return svc().getAssets(filters)
    })

    validatedHandler('hire:getAssetById', ROLES.STAFF, z.number().int().positive(), (_event, id) => {
        return svc().getAssetById(id)
    })

    validatedHandler('hire:createAsset', ROLES.STAFF, HireAssetSchema, (_event, data) => {
        return svc().createAsset(data)
    })

    validatedHandlerMulti('hire:updateAsset', ROLES.STAFF, z.tuple([z.number().int().positive(), HireAssetSchema]), (_event, [id, data]) => {
        return svc().updateAsset(id, data)
    })

    validatedHandlerMulti('hire:checkAvailability', ROLES.STAFF, CheckAvailabilityTuple, (_event, [assetId, hireDate, returnDate]) => {
        return svc().checkAssetAvailability(assetId, hireDate, returnDate)
    })

    // ========== BOOKINGS ==========
    validatedHandler('hire:getBookings', ROLES.STAFF, BookingFilterSchema, (_event, filters) => {
        return svc().getBookings(filters)
    })

    validatedHandler('hire:getBookingById', ROLES.STAFF, z.number().int().positive(), (_event, id) => {
        return svc().getBookingById(id)
    })

    validatedHandlerMulti('hire:createBooking', ROLES.STAFF, CreateBookingTuple, (_event, [data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        // Validation handled by schema (dates, amounts)
        // Need to ensure data matches Partial<HireBooking> expected by service
        // The schema matches structure.
        return svc().createBooking(data as Record<string, unknown>, actor.id)
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
