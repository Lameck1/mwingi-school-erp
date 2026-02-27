import { z } from 'zod'
import { ProcurementService, type RequisitionData, type PurchaseOrderData, type GrnData, type VoucherData } from '../../services/finance/ProcurementService'
import { ROLES } from '../ipc-result'
import { validatedHandlerMulti } from '../validated-handler'

export function setupProcurementHandlers(): void {
    const reqItemSchema = z.object({
        description: z.string(),
        quantity: z.number().positive(),
        unit_of_measure: z.string().optional(),
        estimated_unit_cost: z.number().nonnegative(),
        inventory_item_id: z.number().optional(),
        is_capital_asset: z.boolean().optional(),
        asset_category_id: z.number().optional()
    })

    // createRequisition
    validatedHandlerMulti('procurement:createRequisition', ROLES.MANAGEMENT, z.tuple([
        z.object({
            department: z.string(),
            description: z.string(),
            justification: z.string().optional(),
            jss_account_type: z.enum(['TUITION', 'OPERATIONS', 'INFRASTRUCTURE']).optional(),
            budget_line_id: z.number().optional(),
            items: z.array(reqItemSchema)
        })
    ]), async (_, [data], actor) => {
        const service = new ProcurementService()
        // Cast to remove undefined for exactOptionalPropertyTypes
        const result = service.createRequisition(data as unknown as RequisitionData, actor.id)
        if (!result.success) {
            throw new Error(result.error)
        }
        return result
    })

    // submitRequisition
    validatedHandlerMulti('procurement:submitRequisition', ROLES.MANAGEMENT, z.tuple([z.number()]), async (_, [id], actor) => {
        const service = new ProcurementService()
        const result = service.submitRequisition(id, actor.id)
        if (!result.success) {
            throw new Error(result.error)
        }
        return result
    })

    // approveRequisition
    validatedHandlerMulti('procurement:approveRequisition', ROLES.MANAGEMENT, z.tuple([z.number()]), async (_, [id], actor) => {
        const service = new ProcurementService()
        const result = service.approveRequisition(id, actor.id)
        if (!result.success) {
            throw new Error(result.error)
        }
        return result
    })

    // rejectRequisition
    validatedHandlerMulti('procurement:rejectRequisition', ROLES.MANAGEMENT, z.tuple([z.number(), z.string()]), async (_, [id, reason], actor) => {
        const service = new ProcurementService()
        const result = service.rejectRequisition(id, reason, actor.id)
        if (!result.success) {
            throw new Error(result.error)
        }
        return result
    })

    // getRequisitionsByStatus
    validatedHandlerMulti('procurement:getRequisitionsByStatus', ROLES.STAFF, z.tuple([
        z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMMITTED', 'CANCELLED'])
    ]), async (_, [status]) => {
        const service = new ProcurementService()
        return service.getRequisitionsByStatus(status)
    })

    // commitBudget
    validatedHandlerMulti('procurement:commitBudget', ROLES.FINANCE, z.tuple([z.number()]), async (_, [id], actor) => {
        const service = new ProcurementService()
        const result = service.commitBudget(id, actor.id)
        if (!result.success) {
            throw new Error(result.error)
        }
        return result
    })

    // createPurchaseOrder
    validatedHandlerMulti('procurement:createPurchaseOrder', ROLES.FINANCE, z.tuple([
        z.object({
            requisition_id: z.number(),
            supplier_id: z.number(),
            expected_delivery_date: z.string().optional(),
            notes: z.string().optional()
        })
    ]), async (_, [data], actor) => {
        const service = new ProcurementService()
        const result = service.createPurchaseOrder(data as unknown as PurchaseOrderData, actor.id)
        if (!result.success) {
            throw new Error(result.error)
        }
        return result
    })

    // createGrn
    validatedHandlerMulti('procurement:createGrn', ROLES.STAFF, z.tuple([
        z.object({
            purchase_order_id: z.number(),
            received_date: z.string(),
            inspected_by: z.string().optional(),
            inspection_notes: z.string().optional(),
            items: z.array(z.object({
                po_item_id: z.number(),
                quantity_received: z.number(),
                quantity_accepted: z.number(),
                quantity_rejected: z.number().optional(),
                rejection_reason: z.string().optional()
            }))
        })
    ]), async (_, [data], actor) => {
        const service = new ProcurementService()
        const result = service.createGrn(data as unknown as GrnData, actor.id)
        if (!result.success) {
            throw new Error(result.error)
        }
        return result
    })

    // getPoByRequisition
    validatedHandlerMulti('procurement:getPoByRequisition', ROLES.STAFF, z.tuple([z.number()]), async (_, [requisitionId]) => {
        const service = new ProcurementService()
        return service.getPurchaseOrderByRequisition(requisitionId)
    })

    // getPoSummary
    validatedHandlerMulti('procurement:getPoSummary', ROLES.STAFF, z.tuple([z.number()]), async (_, [poId]) => {
        const service = new ProcurementService()
        return service.getPoSummary(poId)
    })

    // createPaymentVoucher
    validatedHandlerMulti('procurement:createPaymentVoucher', ROLES.FINANCE, z.tuple([
        z.object({
            purchase_order_id: z.number(),
            grn_id: z.number().optional(),
            supplier_id: z.number(),
            amount: z.number(),
            payment_method: z.string().optional(),
            payment_reference: z.string().optional()
        })
    ]), async (_, [data], actor) => {
        const service = new ProcurementService()
        const result = service.createPaymentVoucher(data as unknown as VoucherData, actor.id)
        if (!result.success) {
            throw new Error(result.error)
        }
        return result
    })

    // approvePaymentVoucher
    validatedHandlerMulti('procurement:approvePaymentVoucher', ROLES.MANAGEMENT, z.tuple([z.number()]), async (_, [id], actor) => {
        const service = new ProcurementService()
        const result = service.approvePaymentVoucher(id, actor.id)
        if (!result.success) {
            throw new Error(result.error)
        }
        return result
    })
}
