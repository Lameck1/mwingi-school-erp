
import { randomUUID } from 'node:crypto'

import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

import type Database from 'better-sqlite3'
import { BudgetService } from './BudgetService'
import { FixedAssetService } from './FixedAssetService'

// ============================================================================
// TYPES
// ============================================================================

type RequisitionStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMMITTED' | 'CANCELLED'
type PurchaseOrderStatus = 'ISSUED' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CANCELLED'
type GrnStatus = 'PENDING_INSPECTION' | 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED'
type VoucherStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID' | 'REJECTED'

interface RequisitionData {
    readonly department: string
    readonly description: string
    readonly justification?: string
    readonly jss_account_type?: 'TUITION' | 'OPERATIONS' | 'INFRASTRUCTURE'
    readonly budget_line_id?: number
    readonly items: ReadonlyArray<{
        readonly description: string
        readonly quantity: number
        readonly unit_of_measure?: string
        readonly estimated_unit_cost: number
        readonly inventory_item_id?: number
        readonly is_capital_asset?: boolean
        readonly asset_category_id?: number
    }>
}

interface PurchaseOrderData {
    readonly requisition_id: number
    readonly supplier_id: number
    readonly expected_delivery_date?: string
    readonly notes?: string
}

interface GrnData {
    readonly purchase_order_id: number
    readonly received_date: string
    readonly inspected_by?: string
    readonly inspection_notes?: string
    readonly items: ReadonlyArray<{
        readonly po_item_id: number
        readonly quantity_received: number
        readonly quantity_accepted: number
        readonly quantity_rejected?: number
        readonly rejection_reason?: string
    }>
}

interface VoucherData {
    readonly purchase_order_id: number
    readonly grn_id?: number
    readonly supplier_id: number
    readonly amount: number
    readonly payment_method?: string
    readonly payment_reference?: string
}

interface ServiceResult<T = number> {
    readonly success: boolean
    readonly id?: T
    readonly error?: string
}

interface RequisitionRow {
    readonly id: number
    readonly requisition_number: string
    readonly department: string
    readonly description: string
    readonly total_amount: number
    readonly status: RequisitionStatus
    readonly jss_account_type: string | null
    readonly budget_line_id: number | null
    readonly created_at: string
}

interface PurchaseOrderRow {
    readonly id: number
    readonly po_number: string
    readonly requisition_id: number
    readonly supplier_id: number
    readonly total_amount: number
    readonly status: PurchaseOrderStatus
}

interface CommitmentRow {
    readonly id: number
    readonly requisition_id: number
    readonly committed_amount: number
    readonly utilized_amount: number
    readonly status: string
}

interface PoItemRow {
    readonly id: number
    readonly description: string
    readonly quantity: number
    readonly unit_of_measure: string
    readonly unit_cost: number
    readonly total_cost: number
    readonly received_quantity: number
}

interface PoSummary {
    readonly po: PurchaseOrderRow
    readonly items: Array<PoItemRow & { outstanding: number }>
    readonly latest_grn?: { id: number; status: GrnStatus } | null
}

// ============================================================================
// SERVICE (SRP — focused on P2P workflow orchestration)
// ============================================================================

class ProcurementService {
    private readonly db: Database.Database
    private readonly budgetService: BudgetService
    private readonly fixedAssetService: FixedAssetService

    constructor(db?: Database.Database) {
        this.db = db || getDatabase()
        this.budgetService = new BudgetService()
        this.fixedAssetService = new FixedAssetService()
    }

    // ── REQUISITION LIFECYCLE ──────────────────────────────────────────

    createRequisition(data: RequisitionData, userId: number): ServiceResult {
        if (data.items.length === 0) {
            return { success: false, error: 'At least one item is required' }
        }

        return this.db.transaction(() => {
            const totalAmount = data.items.reduce(
                (sum, item) => sum + item.quantity * item.estimated_unit_cost,
                0
            )

            const reqNo = `REQ-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`
            const result = this.db.prepare(`
        INSERT INTO purchase_requisition (requisition_number, requested_by_user_id, department, description, justification, total_amount, jss_account_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
                reqNo, userId,
                data.department.trim(),
                data.description.trim(),
                data.justification?.trim() ?? null,
                totalAmount,
                data.jss_account_type ?? null
            )

            const reqId = result.lastInsertRowid as number
            const itemStmt = this.db.prepare(`
        INSERT INTO requisition_item (requisition_id, description, quantity, unit_of_measure, estimated_unit_cost, total_cost, inventory_item_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

            for (const item of data.items) {
                itemStmt.run(
                    reqId, item.description.trim(), item.quantity,
                    item.unit_of_measure ?? 'pcs',
                    item.estimated_unit_cost,
                    item.quantity * item.estimated_unit_cost,
                    item.inventory_item_id ?? null
                )
            }

            logAudit(userId, 'CREATE', 'purchase_requisition', reqId, null, {
                department: data.department, total_amount: totalAmount, item_count: data.items.length
            })

            return { success: true, id: reqId }
        })()
    }

    submitRequisition(requisitionId: number, userId: number): ServiceResult {
        return this.transitionRequisitionStatus(requisitionId, 'DRAFT', 'SUBMITTED', userId)
    }

    approveRequisition(requisitionId: number, userId: number): ServiceResult {
        return this.transitionRequisitionStatus(requisitionId, 'SUBMITTED', 'APPROVED', userId, 'approved_by_user_id', 'approved_at')
    }

    rejectRequisition(requisitionId: number, reason: string, userId: number): ServiceResult {
        const req = this.getRequisition(requisitionId)
        if (!req) { return { success: false, error: 'Requisition not found' } }
        if (req.status !== 'SUBMITTED') { return { success: false, error: 'Can only reject SUBMITTED requisitions' } }

        this.db.prepare(
            'UPDATE purchase_requisition SET status = ?, rejection_reason = ?, approved_by_user_id = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run('REJECTED', reason.trim(), userId, requisitionId)

        logAudit(userId, 'UPDATE', 'purchase_requisition', requisitionId, { status: 'SUBMITTED' }, { status: 'REJECTED' })
        return { success: true }
    }

    getRequisition(id: number): RequisitionRow | undefined {
        return this.db.prepare('SELECT * FROM purchase_requisition WHERE id = ?').get(id) as RequisitionRow | undefined
    }

    getRequisitionsByStatus(status: RequisitionStatus): RequisitionRow[] {
        return this.db.prepare('SELECT * FROM purchase_requisition WHERE status = ? ORDER BY created_at DESC').all(status) as RequisitionRow[]
    }

    // ── BUDGET COMMITMENT ──────────────────────────────────────────────

    commitBudget(requisitionId: number, userId: number): ServiceResult {
        const req = this.getRequisition(requisitionId)
        if (!req) { return { success: false, error: 'Requisition not found' } }
        if (req.status !== 'APPROVED') { return { success: false, error: 'Can only commit budget for APPROVED requisitions' } }

        const existing = this.db.prepare('SELECT id FROM budget_commitment WHERE requisition_id = ?').get(requisitionId)
        if (existing) { return { success: false, error: 'Budget already committed for this requisition' } }

        return this.db.transaction(() => {
            if (req.budget_line_id) {
                const commitResult = this.budgetService.commitFunds(req.budget_line_id, req.total_amount)
                if (!commitResult.success) {
                    throw new Error(commitResult.error || 'Failed to commit budget funds')
                }
            }

            const result = this.db.prepare(`
        INSERT INTO budget_commitment (requisition_id, committed_amount, committed_by_user_id)
        VALUES (?, ?, ?)
      `).run(requisitionId, req.total_amount, userId)

            this.db.prepare(
                "UPDATE purchase_requisition SET status = 'COMMITTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            ).run(requisitionId)

            logAudit(userId, 'CREATE', 'budget_commitment', result.lastInsertRowid as number, null, {
                requisition_id: requisitionId, committed_amount: req.total_amount
            })

            return { success: true, id: result.lastInsertRowid as number }
        })()
    }

    getCommitment(requisitionId: number): CommitmentRow | undefined {
        return this.db.prepare('SELECT * FROM budget_commitment WHERE requisition_id = ?').get(requisitionId) as CommitmentRow | undefined
    }

    // ── PURCHASE ORDER ─────────────────────────────────────────────────

    createPurchaseOrder(data: PurchaseOrderData, userId: number): ServiceResult {
        const req = this.getRequisition(data.requisition_id)
        if (!req) { return { success: false, error: 'Requisition not found' } }
        if (req.status !== 'COMMITTED') { return { success: false, error: 'Requisition must be COMMITTED before issuing PO' } }

        const commitment = this.getCommitment(data.requisition_id)
        if (!commitment) { return { success: false, error: 'No budget commitment found' } }

        return this.db.transaction(() => {
            const poNumber = `LPO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`
            const reqItems = this.db.prepare('SELECT * FROM requisition_item WHERE requisition_id = ?').all(data.requisition_id) as Array<{
                id: number; description: string; quantity: number; unit_of_measure: string; estimated_unit_cost: number; total_cost: number
            }>

            const totalAmount = reqItems.reduce((sum, item) => sum + item.total_cost, 0)

            const result = this.db.prepare(`
        INSERT INTO purchase_order (po_number, requisition_id, supplier_id, order_date, expected_delivery_date, total_amount, issued_by_user_id, notes)
        VALUES (?, ?, ?, date('now'), ?, ?, ?, ?)
      `).run(
                poNumber, data.requisition_id, data.supplier_id,
                data.expected_delivery_date ?? null, totalAmount, userId,
                data.notes?.trim() ?? null
            )

            const poId = result.lastInsertRowid as number
            const poItemStmt = this.db.prepare(`
        INSERT INTO purchase_order_item (purchase_order_id, requisition_item_id, description, quantity, unit_of_measure, unit_cost, total_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

            for (const item of reqItems) {
                poItemStmt.run(poId, item.id, item.description, item.quantity, item.unit_of_measure, item.estimated_unit_cost, item.total_cost)
            }

            logAudit(userId, 'CREATE', 'purchase_order', poId, null, {
                po_number: poNumber, requisition_id: data.requisition_id, total_amount: totalAmount
            })

            return { success: true, id: poId }
        })()
    }

    getPurchaseOrder(id: number): PurchaseOrderRow | undefined {
        return this.db.prepare('SELECT * FROM purchase_order WHERE id = ?').get(id) as PurchaseOrderRow | undefined
    }

    getPurchaseOrderByRequisition(requisitionId: number): PurchaseOrderRow | undefined {
        return this.db.prepare('SELECT * FROM purchase_order WHERE requisition_id = ? ORDER BY created_at DESC LIMIT 1')
            .get(requisitionId) as PurchaseOrderRow | undefined
    }

    getPoSummary(poId: number): PoSummary | undefined {
        const po = this.getPurchaseOrder(poId)
        if (!po) { return undefined }
        const items = this.db.prepare(`
            SELECT id, description, quantity, unit_of_measure, unit_cost, total_cost,
                   COALESCE(received_quantity, 0) as received_quantity
            FROM purchase_order_item
            WHERE purchase_order_id = ?
            ORDER BY id ASC
        `).all(poId) as PoItemRow[]
        const latestGrn = this.db.prepare(`
            SELECT id, status
            FROM goods_received_note
            WHERE purchase_order_id = ?
            ORDER BY created_at DESC
            LIMIT 1
        `).get(poId) as { id: number; status: GrnStatus } | undefined

        return {
            po,
            items: items.map(i => ({ ...i, outstanding: Math.max(0, i.quantity - i.received_quantity) })),
            latest_grn: latestGrn ?? null
        }
    }

    // ── GOODS RECEIVED NOTE ────────────────────────────────────────────

    createGrn(data: GrnData, userId: number): ServiceResult {
        const po = this.getPurchaseOrder(data.purchase_order_id)
        if (!po) { return { success: false, error: 'Purchase order not found' } }
        if (po.status === 'CANCELLED') { return { success: false, error: 'Cannot receive goods for cancelled PO' } }

        return this.db.transaction(() => {
            // Validate quantities against outstanding ordered amounts
            const poItemRows = this.db.prepare(
                'SELECT id, quantity, COALESCE(received_quantity, 0) as received_quantity FROM purchase_order_item WHERE purchase_order_id = ?'
            ).all(data.purchase_order_id) as Array<{ id: number; quantity: number; received_quantity: number }>
            const itemMap = new Map<number, { quantity: number; received_quantity: number }>()
            for (const row of poItemRows) {
                itemMap.set(row.id, { quantity: row.quantity, received_quantity: row.received_quantity })
            }
            for (const item of data.items) {
                const ref = itemMap.get(item.po_item_id)
                if (!ref) { return { success: false, error: `PO item ${item.po_item_id} not found` } }
                if (item.quantity_received < item.quantity_accepted) {
                    return { success: false, error: 'Accepted quantity cannot exceed received quantity' }
                }
                const outstanding = Math.max(0, ref.quantity - ref.received_quantity)
                if (item.quantity_accepted > outstanding) {
                    return { success: false, error: 'Accepted quantity exceeds outstanding ordered quantity' }
                }
            }

            const grnNumber = `GRN-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`

            const allAccepted = data.items.every(i => (i.quantity_rejected ?? 0) === 0)
            const grnStatus: GrnStatus = allAccepted ? 'ACCEPTED' : 'PARTIALLY_ACCEPTED'

            const result = this.db.prepare(`
        INSERT INTO goods_received_note (grn_number, purchase_order_id, received_date, received_by_user_id, inspected_by, inspection_notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
                grnNumber, data.purchase_order_id, data.received_date, userId,
                data.inspected_by ?? null, data.inspection_notes ?? null, grnStatus
            )

            const grnId = result.lastInsertRowid as number
            const grnItemStmt = this.db.prepare(`
        INSERT INTO grn_item (grn_id, po_item_id, quantity_received, quantity_accepted, quantity_rejected, rejection_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

            const updatePoItemStmt = this.db.prepare(
                'UPDATE purchase_order_item SET received_quantity = received_quantity + ? WHERE id = ?'
            )

            for (const item of data.items) {
                grnItemStmt.run(grnId, item.po_item_id, item.quantity_received, item.quantity_accepted, item.quantity_rejected ?? 0, item.rejection_reason ?? null)
                updatePoItemStmt.run(item.quantity_accepted, item.po_item_id)
            }

            // Update PO status based on total received vs ordered
            const poItems = this.db.prepare(
                'SELECT quantity, received_quantity FROM purchase_order_item WHERE purchase_order_id = ?'
            ).all(data.purchase_order_id) as Array<{ quantity: number; received_quantity: number }>

            const fullyReceived = poItems.every(i => i.received_quantity >= i.quantity)
            const poStatus: PurchaseOrderStatus = fullyReceived ? 'FULLY_RECEIVED' : 'PARTIALLY_RECEIVED'
            this.db.prepare('UPDATE purchase_order SET status = ? WHERE id = ?').run(poStatus, data.purchase_order_id)

            // Auto-provision Fixed Assets for accepted capital items
            this.provisionCapitalAssets(data.items, grnNumber, data.received_date, po, userId)

            logAudit(userId, 'CREATE', 'goods_received_note', grnId, null, {
                po_id: data.purchase_order_id, status: grnStatus
            })

            return { success: true, id: grnId }
        })()
    }

    // ── PAYMENT VOUCHER ────────────────────────────────────────────────

    /**
     * Provision fixed assets for accepted capital items in a GRN.
     * Extracted to keep createGrn within max-depth limits.
     */
    private provisionCapitalAssets(
        items: GrnData['items'],
        grnNumber: string,
        receivedDate: string,
        po: { po_number: string; supplier_id: number },
        userId: number,
    ): void {
        for (const item of items) {
            if (item.quantity_accepted <= 0) { continue }

            const reqItem = this.db.prepare(`
                SELECT ri.*
                FROM requisition_item ri
                JOIN purchase_order_item poi ON poi.requisition_item_id = ri.id
                WHERE poi.id = ?
            `).get(item.po_item_id) as {
                id: number; description: string; estimated_unit_cost: number;
                is_capital_asset: number; asset_category_id: number | null
            } | undefined

            if (!reqItem?.is_capital_asset || !reqItem.asset_category_id) { continue }

            for (let i = 0; i < item.quantity_accepted; i++) {
                const assetName = `${reqItem.description} (Auto-provisioned via GRN ${grnNumber})`
                const assetResult = this.fixedAssetService.createSync({
                    asset_name: assetName,
                    category_id: reqItem.asset_category_id,
                    acquisition_date: receivedDate,
                    acquisition_cost: reqItem.estimated_unit_cost,
                    description: `Received via PO ${po.po_number}, GRN ${grnNumber}`,
                    supplier_id: po.supplier_id,
                }, userId)

                if (!assetResult.success) {
                    throw new Error(
                        `Fixed asset provisioning failed for "${reqItem.description}": ${assetResult.errors?.join(', ') ?? 'Unknown error'}`
                    )
                }
            }
        }
    }

    createPaymentVoucher(data: VoucherData, userId: number): ServiceResult {
        const po = this.getPurchaseOrder(data.purchase_order_id)
        if (!po) { return { success: false, error: 'Purchase order not found' } }
        if (data.amount <= 0) { return { success: false, error: 'Amount must be positive' } }
        if (!data.grn_id) { return { success: false, error: 'GRN is required before creating a payment voucher' } }

        // Ensure GRN exists and relates to the PO, and is accepted/partially accepted
        const grn = this.db.prepare(`
          SELECT id, purchase_order_id, status
          FROM goods_received_note
          WHERE id = ?
        `).get(data.grn_id) as { id: number; purchase_order_id: number; status: GrnStatus } | undefined
        if (!grn) { return { success: false, error: 'GRN not found' } }
        if (grn.purchase_order_id !== data.purchase_order_id) {
            return { success: false, error: 'GRN does not belong to the selected purchase order' }
        }
        if (grn.status !== 'ACCEPTED' && grn.status !== 'PARTIALLY_ACCEPTED') {
            return { success: false, error: 'GRN must be accepted before creating a voucher' }
        }

        return this.db.transaction(() => {
            const voucherNumber = `PV-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`
            const result = this.db.prepare(`
          INSERT INTO payment_voucher (voucher_number, purchase_order_id, grn_id, supplier_id, amount, payment_method, payment_reference, prepared_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
                voucherNumber, data.purchase_order_id,
                data.grn_id ?? null, data.supplier_id,
                data.amount, data.payment_method ?? null,
                data.payment_reference ?? null, userId
            )

            const id = result.lastInsertRowid as number

            // Utilize Budget Funds
            const req = this.db.prepare(`
                SELECT pr.budget_line_id
                FROM purchase_requisition pr
                WHERE pr.id = ?
            `).get(po.requisition_id) as { budget_line_id: number | null } | undefined

            if (req?.budget_line_id) {
                const utilizeResult = this.budgetService.utilizeFunds(req.budget_line_id, data.amount)
                if (!utilizeResult.success) {
                    throw new Error(utilizeResult.error || 'Failed to utilize budget funds')
                }
            }

            logAudit(userId, 'CREATE', 'payment_voucher', id, null, {
                voucher_number: voucherNumber, amount: data.amount
            })

            return { success: true, id }
        })()
    }

    approvePaymentVoucher(voucherId: number, userId: number): ServiceResult {
        const voucher = this.db.prepare('SELECT * FROM payment_voucher WHERE id = ?').get(voucherId) as {
            id: number; status: VoucherStatus
        } | undefined

        if (!voucher) { return { success: false, error: 'Payment voucher not found' } }
        if (voucher.status !== 'SUBMITTED' && voucher.status !== 'DRAFT') {
            return { success: false, error: 'Voucher must be DRAFT or SUBMITTED to approve' }
        }

        this.db.prepare(
            "UPDATE payment_voucher SET status = 'APPROVED', approved_by_user_id = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(userId, voucherId)

        logAudit(userId, 'UPDATE', 'payment_voucher', voucherId, { status: voucher.status }, { status: 'APPROVED' })
        return { success: true }
    }

    // ── HELPERS ────────────────────────────────────────────────────────

    private transitionRequisitionStatus(
        id: number,
        expectedStatus: RequisitionStatus,
        newStatus: RequisitionStatus,
        userId: number,
        approverField?: string,
        approvedAtField?: string
    ): ServiceResult {
        const req = this.getRequisition(id)
        if (!req) { return { success: false, error: 'Requisition not found' } }
        if (req.status !== expectedStatus) {
            return { success: false, error: `Can only ${newStatus.toLowerCase()} from ${expectedStatus} state` }
        }

        let sql = `UPDATE purchase_requisition SET status = ?, updated_at = CURRENT_TIMESTAMP`
        const params: Array<string | number> = [newStatus]
        if (approverField) {
            sql += `, ${approverField} = ?`
            params.push(userId)
        }
        if (approvedAtField) {
            sql += `, ${approvedAtField} = CURRENT_TIMESTAMP`
        }
        sql += ' WHERE id = ?'
        params.push(id)

        this.db.prepare(sql).run(...params)
        logAudit(userId, 'UPDATE', 'purchase_requisition', id, { status: expectedStatus }, { status: newStatus })
        return { success: true }
    }
}

export { ProcurementService }
export type {
    RequisitionData, PurchaseOrderData, GrnData, VoucherData,
    RequisitionRow, PurchaseOrderRow, CommitmentRow, ServiceResult
}
