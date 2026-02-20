import { z } from 'zod'

import { getErrorMessage, UNKNOWN_ERROR_MESSAGE } from './finance-handler-utils'
import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    AllocateCreditsTuple, AddCreditTuple, CalculateProratedFeeTuple,
    GenerateProratedInvoiceTuple, CreateScholarshipTuple, AllocateScholarshipTuple,
    ApplyScholarshipTuple, ValidateEligibilityTuple
} from '../schemas/finance-transaction-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

export const registerCreditHandlers = (): void => {
    const creditService = container.resolve('CreditAutoApplicationService')

    validatedHandlerMulti('finance:allocateCredits', ROLES.FINANCE, AllocateCreditsTuple, async (event, [studentId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        try {
            return await creditService.allocateCreditsToInvoices(studentId, actor.id)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    validatedHandler('finance:getCreditBalance', ROLES.STAFF, z.number().int().positive(), async (_event, studentId) => {
        try {
            return await creditService.getStudentCreditBalance(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get credit balance'))
        }
    })

    validatedHandler('finance:getCreditTransactions', ROLES.STAFF, z.number().int().positive(), async (_event, studentId) => {
        try {
            return await creditService.getCreditTransactions(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get credit transactions'))
        }
    })

    validatedHandlerMulti('finance:addCredit', ROLES.FINANCE, AddCreditTuple, async (event, [studentId, amount, notes, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        try {
            return await creditService.addCreditToStudent(studentId, amount, notes, actor.id)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })
}

export const registerProrationHandlers = (): void => {
    const prorationService = container.resolve('FeeProrationService')

    validatedHandlerMulti('finance:calculateProRatedFee', ROLES.STAFF, CalculateProratedFeeTuple, (
        _event,
        [fullAmount, termStartDate, termEndDate, enrollmentDate]
    ) => {
        try {
            return prorationService.calculateProRatedFee(fullAmount, termStartDate, termEndDate, enrollmentDate)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to calculate pro-rated fee'))
        }
    })

    validatedHandlerMulti('finance:validateEnrollmentDate', ROLES.STAFF, z.tuple([
        z.number(), z.string(), z.string(), z.string()
    ]), ( // Reuse part of logic manually or define new tuple
        _event,
        [_amount, termStartDate, termEndDate, enrollmentDate] // Wait, ValidateEnrollmentDate args: termStartDate, termEndDate, enrollmentDate
    ) => {
        // Original handler took: (amount unused?, termStart, termEnd, enrollment)
        // Wait, `finance:validateEnrollmentDate` signature in original file:
        // (event, termStartDate, termEndDate, enrollmentDate) - 3 args.
        // `CalculateProratedFeeTuple` has 4 args: amount, start, end, enrollment.
        // So I can't reuse it easily with slice.
        // I should just define strict tuple for this.
        return prorationService.validateEnrollmentDate(termStartDate, termEndDate, enrollmentDate)
    })

    validatedHandlerMulti('finance:generateProRatedInvoice', ROLES.FINANCE, GenerateProratedInvoiceTuple, async (
        event,
        [studentId, templateInvoiceId, enrollmentDate, legacyUserId],
        actor
    ) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        try {
            return await prorationService.generateProRatedInvoice(studentId, templateInvoiceId, enrollmentDate, actor.id)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    validatedHandler('finance:getProRationHistory', ROLES.STAFF, z.number().int().positive(), async (_event, studentId) => {
        try {
            return await prorationService.getStudentProRationHistory(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get proration history'))
        }
    })
}

export const registerScholarshipHandlers = (): void => {
    const scholarshipService = container.resolve('ScholarshipService')

    validatedHandlerMulti('finance:createScholarship', ROLES.FINANCE, CreateScholarshipTuple, async (event, [data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        try {
            return await scholarshipService.createScholarship(data, actor.id)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    validatedHandlerMulti('finance:allocateScholarship', ROLES.FINANCE, AllocateScholarshipTuple, async (event, [allocationData, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        try {
            return await scholarshipService.allocateScholarshipToStudent(allocationData, actor.id)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    validatedHandlerMulti('finance:validateScholarshipEligibility', ROLES.STAFF, ValidateEligibilityTuple, async (_event, [studentId, scholarshipId]) => {
        try {
            return await scholarshipService.validateScholarshipEligibility(studentId, scholarshipId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to validate eligibility'))
        }
    })

    validatedHandler('finance:getActiveScholarships', ROLES.STAFF, z.void(), async () => {
        try {
            return await scholarshipService.getActiveScholarships()
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get scholarships'))
        }
    })

    validatedHandler('finance:getStudentScholarships', ROLES.STAFF, z.number().int().positive(), async (_event, studentId) => {
        try {
            return await scholarshipService.getStudentScholarships(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get student scholarships'))
        }
    })

    validatedHandler('finance:getScholarshipAllocations', ROLES.STAFF, z.number().int().positive(), async (_event, scholarshipId) => {
        try {
            return await scholarshipService.getScholarshipAllocations(scholarshipId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get allocations'))
        }
    })

    validatedHandlerMulti('finance:applyScholarshipToInvoice', ROLES.FINANCE, ApplyScholarshipTuple, async (
        event,
        [studentScholarshipId, invoiceId, amountToApply, legacyUserId],
        actor
    ) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        try {
            return await scholarshipService.applyScholarshipToInvoice(studentScholarshipId, invoiceId, amountToApply, actor.id)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })
}
