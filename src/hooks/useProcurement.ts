import { useState, useCallback } from 'react';

export interface RequisitionItem {
    description: string
    quantity: number
    unit_of_measure?: string
    estimated_unit_cost: number
    inventory_item_id?: number
}

export interface RequisitionData {
    department: string
    description: string
    justification?: string
    jss_account_type?: 'TUITION' | 'OPERATIONS' | 'INFRASTRUCTURE'
    items: RequisitionItem[]
}

export interface PurchaseOrderData {
    requisition_id: number
    supplier_id: number
    expected_delivery_date?: string
    notes?: string
}

export interface GrnData {
    purchase_order_id: number
    received_date: string
    inspected_by?: string
    inspection_notes?: string
    items: Array<{
        po_item_id: number
        quantity_received: number
        quantity_accepted: number
        quantity_rejected?: number
        rejection_reason?: string
    }>
}

export interface VoucherData {
    purchase_order_id: number
    grn_id?: number
    supplier_id: number
    amount: number
    payment_method?: string
    payment_reference?: string
}

export function useProcurement() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleRequest = useCallback(async <T,>(requestFn: () => Promise<T>): Promise<T> => {
        try {
            setIsLoading(true)
            setError(null)
            return await requestFn()
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'An error occurred'
            setError(message)
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const createRequisition = useCallback((data: RequisitionData) => handleRequest(() => globalThis.electronAPI.finance.createRequisition(data)), [handleRequest])
    const submitRequisition = useCallback((id: number) => handleRequest(() => globalThis.electronAPI.finance.submitRequisition(id)), [handleRequest])
    const approveRequisition = useCallback((id: number) => handleRequest(() => globalThis.electronAPI.finance.approveRequisition(id)), [handleRequest])
    const rejectRequisition = useCallback((id: number, reason: string) => handleRequest(() => globalThis.electronAPI.finance.rejectRequisition(id, reason)), [handleRequest])
    const getRequisitionsByStatus = useCallback((status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMMITTED' | 'CANCELLED') =>
        handleRequest(() => globalThis.electronAPI.finance.getRequisitionsByStatus(status)), [handleRequest])

    const commitBudget = useCallback((requisitionId: number) => handleRequest(() => globalThis.electronAPI.finance.commitBudget(requisitionId)), [handleRequest])
    const createPurchaseOrder = useCallback((data: PurchaseOrderData) => handleRequest(() => globalThis.electronAPI.finance.createPurchaseOrder(data)), [handleRequest])
    const createGrn = useCallback((data: GrnData) => handleRequest(() => globalThis.electronAPI.finance.createGrn(data)), [handleRequest])
    const createPaymentVoucher = useCallback((data: VoucherData) => handleRequest(() => globalThis.electronAPI.finance.createPaymentVoucher(data)), [handleRequest])
    const approvePaymentVoucher = useCallback((id: number) => handleRequest(() => globalThis.electronAPI.finance.approvePaymentVoucher(id)), [handleRequest])

    return {
        isLoading,
        error,
        createRequisition,
        submitRequisition,
        approveRequisition,
        rejectRequisition,
        getRequisitionsByStatus,
        commitBudget,
        createPurchaseOrder,
        createGrn,
        createPaymentVoucher,
        approvePaymentVoucher
    }
}
