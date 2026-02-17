import { getErrorMessage, UNKNOWN_ERROR_MESSAGE } from './finance-handler-utils'
import { container } from '../../services/base/ServiceContainer'
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

import type { ScholarshipData, AllocationData } from '../../services/finance/ScholarshipService'

export const registerCreditHandlers = (): void => {
    const creditService = container.resolve('CreditAutoApplicationService')

    safeHandleRawWithRole('finance:allocateCredits', ROLES.FINANCE, async (event, studentId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        try {
            return await creditService.allocateCreditsToInvoices(studentId, actor.actorId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    safeHandleRawWithRole('finance:getCreditBalance', ROLES.STAFF, async (_event, studentId: number) => {
        try {
            return await creditService.getStudentCreditBalance(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get credit balance'))
        }
    })

    safeHandleRawWithRole('finance:getCreditTransactions', ROLES.STAFF, async (_event, studentId: number, limit?: number) => {
        try {
            return await creditService.getCreditTransactions(studentId, limit)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get credit transactions'))
        }
    })

    safeHandleRawWithRole('finance:addCredit', ROLES.FINANCE, async (event, studentId: number, amount: number, notes: string, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        try {
            return await creditService.addCreditToStudent(studentId, amount, notes, actor.actorId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })
}

export const registerProrationHandlers = (): void => {
    const prorationService = container.resolve('FeeProrationService')

    safeHandleRawWithRole('finance:calculateProRatedFee', ROLES.STAFF, (
        _event,
        fullAmount: number,
        termStartDate: string,
        termEndDate: string,
        enrollmentDate: string
    ) => {
        try {
            return prorationService.calculateProRatedFee(fullAmount, termStartDate, termEndDate, enrollmentDate)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to calculate pro-rated fee'))
        }
    })

    safeHandleRawWithRole('finance:validateEnrollmentDate', ROLES.STAFF, (
        _event,
        termStartDate: string,
        termEndDate: string,
        enrollmentDate: string
    ) => {
        try {
            return prorationService.validateEnrollmentDate(termStartDate, termEndDate, enrollmentDate)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to validate enrollment date'))
        }
    })

    safeHandleRawWithRole('finance:generateProRatedInvoice', ROLES.FINANCE, async (
        event,
        studentId: number,
        templateInvoiceId: number,
        enrollmentDate: string,
        legacyUserId?: number
    ) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        try {
            return await prorationService.generateProRatedInvoice(studentId, templateInvoiceId, enrollmentDate, actor.actorId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    safeHandleRawWithRole('finance:getProRationHistory', ROLES.STAFF, async (_event, studentId: number) => {
        try {
            return await prorationService.getStudentProRationHistory(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get proration history'))
        }
    })
}

export const registerScholarshipHandlers = (): void => {
    const scholarshipService = container.resolve('ScholarshipService')

    safeHandleRawWithRole('finance:createScholarship', ROLES.FINANCE, async (event, data: ScholarshipData, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        try {
            return await scholarshipService.createScholarship(data, actor.actorId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    safeHandleRawWithRole('finance:allocateScholarship', ROLES.FINANCE, async (event, allocationData: AllocationData, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        try {
            return await scholarshipService.allocateScholarshipToStudent(allocationData, actor.actorId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    safeHandleRawWithRole('finance:validateScholarshipEligibility', ROLES.STAFF, async (_event, studentId: number, scholarshipId: number) => {
        try {
            return await scholarshipService.validateScholarshipEligibility(studentId, scholarshipId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to validate eligibility'))
        }
    })

    safeHandleRawWithRole('finance:getActiveScholarships', ROLES.STAFF, async () => {
        try {
            return await scholarshipService.getActiveScholarships()
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get scholarships'))
        }
    })

    safeHandleRawWithRole('finance:getStudentScholarships', ROLES.STAFF, async (_event, studentId: number) => {
        try {
            return await scholarshipService.getStudentScholarships(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get student scholarships'))
        }
    })

    safeHandleRawWithRole('finance:getScholarshipAllocations', ROLES.STAFF, async (_event, scholarshipId: number) => {
        try {
            return await scholarshipService.getScholarshipAllocations(scholarshipId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get allocations'))
        }
    })

    safeHandleRawWithRole('finance:applyScholarshipToInvoice', ROLES.FINANCE, async (
        event,
        studentScholarshipId: number,
        invoiceId: number,
        amountToApply: number,
        legacyUserId?: number
    ) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        try {
            return await scholarshipService.applyScholarshipToInvoice(studentScholarshipId, invoiceId, amountToApply, actor.actorId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })
}
