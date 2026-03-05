import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useProcurement } from '../../../hooks/useProcurement'
import { useToast } from '../../../contexts/ToastContext'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { RequisitionsTable, CreateRequisitionModal, GrnReceiveModal, PoDetailModal, VoucherModal, type RequisitionRow } from './ProcurementDashboard.components'

function useProcurementPage() {
    const { getRequisitionsByStatus, approveRequisition, rejectRequisition, commitBudget, createRequisition, submitRequisition, createGrn, createPaymentVoucher, isLoading, error } = useProcurement()
    const { showToast } = useToast()
    const [activeTab, setActiveTab] = useState<'SUBMITTED' | 'APPROVED' | 'COMMITTED'>('SUBMITTED')
    const [requisitions, setRequisitions] = useState<RequisitionRow[]>([])

    // Create requisition modal state
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [dept, setDept] = useState('')
    const [desc, setDesc] = useState('')
    const [itemDesc, setItemDesc] = useState('')
    const [qty, setQty] = useState<number>(1)
    const [unitCost, setUnitCost] = useState<number>(0)

    // Integration Fields
    const [budgetLineId, setBudgetLineId] = useState<string>('')
    const [isCapitalAsset, setIsCapitalAsset] = useState<boolean>(false)
    const [assetCategoryId, setAssetCategoryId] = useState<string>('')

    const [budgets, setBudgets] = useState<Array<{ id: number, budget_name: string, line_items: Array<{ id: number, category_name: string, description: string, available_balance: number }> }>>([])
    const [assetCategories, setAssetCategories] = useState<Array<{ id: number, category_name: string }>>([])

    useEffect(() => {
        const loadData = async (): Promise<void> => {
            try {
                const [budgetRes, catRes] = await Promise.all([
                    globalThis.electronAPI.finance.getBudgets(),
                    globalThis.electronAPI.finance.getAssetCategories()
                ])
                setBudgets((budgetRes || []) as unknown as Array<{ id: number, budget_name: string, line_items: Array<{ id: number, category_name: string, description: string, available_balance: number }> }>)
                setAssetCategories((catRes || []) as unknown as Array<{ id: number, category_name: string }>)
            } catch (err) {
                console.error(err)
            }
        }
        if (isCreateOpen) {
            void loadData()
        }
    }, [isCreateOpen])

    const fetchRequisitions = useCallback(async () => {
        try {
            const data = await getRequisitionsByStatus(activeTab) as RequisitionRow[] | undefined
            setRequisitions(data || [])
        } catch (err) {
            console.error(err)
        }
    }, [activeTab, getRequisitionsByStatus])

    useEffect(() => {
        void fetchRequisitions()
    }, [fetchRequisitions])

    const handleApprove = async (id: number) => {
        if (globalThis.confirm('Approve this requisition?')) {
            await approveRequisition(id)
            void fetchRequisitions()
        }
    }

    const handleReject = async (id: number) => {
        const reason = globalThis.prompt('Enter rejection reason:')
        if (reason) {
            await rejectRequisition(id, reason)
            void fetchRequisitions()
        }
    }

    const handleCommitBudget = async (id: number) => {
        if (globalThis.confirm('Commit budget for this PO?')) {
            await commitBudget(id)
            void fetchRequisitions()
        }
    }

    const resetForm = () => {
        setDept('')
        setDesc('')
        setItemDesc('')
        setQty(1)
        setUnitCost(0)
        setBudgetLineId('')
        setIsCapitalAsset(false)
        setAssetCategoryId('')
    }

    const handleCreateRequisition = async () => {
        const payload = {
            department: dept.trim(),
            description: desc.trim(),
            budget_line_id: budgetLineId ? Number(budgetLineId) : undefined,
            items: [
                {
                    description: itemDesc.trim(),
                    quantity: qty,
                    estimated_unit_cost: unitCost,
                    is_capital_asset: isCapitalAsset,
                    asset_category_id: isCapitalAsset && assetCategoryId ? Number(assetCategoryId) : undefined
                }
            ]
        } as unknown as Parameters<typeof createRequisition>[0]
        try {
            const res = await createRequisition(payload) as { success?: boolean; id?: number; error?: string }
            if (!res || res.success === false || !res.id) {
                showToast(res?.error || 'Failed to create requisition', 'error')
                return
            }
            await submitRequisition(res.id)
            showToast('Requisition submitted for approval', 'success')
            setIsCreateOpen(false)
            resetForm()
            void fetchRequisitions()
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Failed to create requisition', 'error')
        }
    }

    // GRN Receive modal state
    const [grnPoSummary, setGrnPoSummary] = useState<null | {
        po: { id: number; po_number: string; requisition_id: number; supplier_id: number; total_amount: number; status: string }
        items: Array<{ id: number; description: string; quantity: number; received_quantity: number; outstanding: number }>
    }>(null)
    const [grnForm, setGrnForm] = useState<Record<number, { recv: number; accept: number }>>({})
    const [isGrnOpen, setIsGrnOpen] = useState(false)
    const grnItems = useMemo(() => grnPoSummary?.items ?? [], [grnPoSummary])

    const openReceiveGrn = async (requisitionId: number) => {
        try {
            const po = await globalThis.electronAPI.finance.getPoByRequisition(requisitionId)
            if (!po) {
                showToast('No Purchase Order found for this requisition', 'error')
                return
            }
            const summary = await globalThis.electronAPI.finance.getPoSummary(po.id)
            if (!summary) {
                showToast('Failed to load PO summary', 'error')
                return
            }
            setGrnPoSummary({
                po: summary.po,
                items: summary.items.map(i => ({
                    id: i.id, description: i.description, quantity: i.quantity, received_quantity: i.received_quantity, outstanding: i.outstanding
                }))
            })
            const defaults: Record<number, { recv: number; accept: number }> = {}
            summary.items.forEach(i => { defaults[i.id] = { recv: i.outstanding, accept: i.outstanding } })
            setGrnForm(defaults)
            setIsGrnOpen(true)
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Failed to prepare GRN', 'error')
        }
    }

    const submitGrn = async () => {
        if (!grnPoSummary) { return }
        const items = grnPoSummary.items
            .map(it => {
                const row = grnForm[it.id] || { recv: 0, accept: 0 }
                const recv = Math.max(0, Math.min(row.recv, it.outstanding))
                const accept = Math.max(0, Math.min(row.accept, recv, it.outstanding))
                const rejected = Math.max(0, recv - accept)
                if (recv === 0 && accept === 0) { return null }
                return { po_item_id: it.id, quantity_received: recv, quantity_accepted: accept, quantity_rejected: rejected }
            })
            .filter(Boolean) as Array<{ po_item_id: number; quantity_received: number; quantity_accepted: number; quantity_rejected: number }>
        if (items.length === 0) {
            showToast('Enter at least one received quantity', 'warning')
            return
        }
        const payload = {
            purchase_order_id: grnPoSummary.po.id,
            received_date: new Date().toISOString().slice(0, 10),
            items
        }
        const res = await createGrn(payload as { purchase_order_id: number; received_date: string; items: Array<{ po_item_id: number; quantity_received: number; quantity_accepted: number; quantity_rejected: number }> }) as { success?: boolean; id?: number; error?: string }
        if (!res || res.success === false || !res.id) {
            showToast(res?.error || 'Failed to create GRN', 'error')
            return
        }
        setIsGrnOpen(false)
        showToast('GRN recorded successfully', 'success')
        // Offer to create voucher
        setVoucherContext({
            poId: grnPoSummary.po.id,
            supplierId: grnPoSummary.po.supplier_id,
            grnId: res.id,
            amount: grnPoSummary.po.total_amount
        })
        setIsVoucherOpen(true)
    }

    // PO Details & Voucher modal state
    const [poDetail, setPoDetail] = useState<null | Awaited<ReturnType<typeof globalThis.electronAPI.finance.getPoSummary>>>(null)
    const [isPoDetailOpen, setIsPoDetailOpen] = useState(false)
    const openPoDetail = async (requisitionId: number) => {
        const po = await globalThis.electronAPI.finance.getPoByRequisition(requisitionId)
        if (!po) {
            showToast('No Purchase Order found for this requisition', 'error')
            return
        }
        const summary = await globalThis.electronAPI.finance.getPoSummary(po.id)
        setPoDetail(summary ?? null)
        setIsPoDetailOpen(true)
    }
    const voucherDisabled = useMemo(() => {
        if (!poDetail?.latest_grn) { return true }
        return !['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(poDetail.latest_grn.status)
    }, [poDetail])
    const voucherTitle = useMemo(() => {
        if (!poDetail?.latest_grn) { return 'Create a GRN first' }
        return ['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(poDetail.latest_grn.status) ? 'Create voucher' : 'GRN must be accepted'
    }, [poDetail])

    const [voucherContext, setVoucherContext] = useState<{ poId: number; supplierId: number; grnId: number; amount: number } | null>(null)
    const [isVoucherOpen, setIsVoucherOpen] = useState(false)
    const submitVoucher = async () => {
        if (!voucherContext) { return }
        const res = await createPaymentVoucher({
            purchase_order_id: voucherContext.poId,
            grn_id: voucherContext.grnId,
            supplier_id: voucherContext.supplierId,
            amount: voucherContext.amount
        } as { purchase_order_id: number; grn_id: number; supplier_id: number; amount: number }) as { success?: boolean; id?: number; error?: string }
        if (!res || res.success === false || !res.id) {
            showToast(res?.error || 'Failed to create voucher', 'error')
            return
        }
        setIsVoucherOpen(false)
        showToast('Payment voucher created', 'success')
    }

    return {
        isCreateOpen, setIsCreateOpen,
        dept, setDept, desc, setDesc, itemDesc, setItemDesc,
        qty, setQty, unitCost, setUnitCost,
        budgetLineId, setBudgetLineId, isCapitalAsset, setIsCapitalAsset,
        assetCategoryId, setAssetCategoryId,
        budgets, assetCategories, handleCreateRequisition,
        requisitions, isLoading, error, activeTab, setActiveTab,
        handleApprove, handleReject, handleCommitBudget,
        openReceiveGrn, openPoDetail,
        grnPoSummary, grnForm, setGrnForm, isGrnOpen, setIsGrnOpen,
        grnItems, submitGrn,
        poDetail, isPoDetailOpen, setIsPoDetailOpen,
        voucherDisabled, voucherTitle,
        voucherContext, setVoucherContext, isVoucherOpen, setIsVoucherOpen,
        submitVoucher,
    }
}

export default function ProcurementDashboard() {
    const {
        isCreateOpen, setIsCreateOpen,
        dept, setDept, desc, setDesc, itemDesc, setItemDesc,
        qty, setQty, unitCost, setUnitCost,
        budgetLineId, setBudgetLineId, isCapitalAsset, setIsCapitalAsset,
        assetCategoryId, setAssetCategoryId,
        budgets, assetCategories, handleCreateRequisition,
        requisitions, isLoading, error, activeTab, setActiveTab,
        handleApprove, handleReject, handleCommitBudget,
        openReceiveGrn, openPoDetail,
        grnPoSummary, grnForm, setGrnForm, isGrnOpen, setIsGrnOpen,
        grnItems, submitGrn,
        poDetail, isPoDetailOpen, setIsPoDetailOpen,
        voucherDisabled, voucherTitle,
        voucherContext, setVoucherContext, isVoucherOpen, setIsVoucherOpen,
        submitVoucher,
    } = useProcurementPage()

    return (
        <div className="space-y-8 pb-10 h-full flex flex-col">
            <div className="flex justify-between items-start">
                <PageHeader
                    title="Procure to Pay (P2P) Workspace"
                    subtitle="Manage requisitions, purchase orders, goods receipts, and payment vouchers."
                    breadcrumbs={[
                        { label: 'Finance', href: '/finance' },
                        { label: 'Procurement' }
                    ]}
                />
                <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
                    <button
                        type="button"
                        className="btn btn-primary flex items-center gap-2"
                        onClick={() => setIsCreateOpen(true)}
                    >
                        <Plus className="h-4 w-4" />
                        New Requisition
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 bg-red-500/10 p-4 rounded-xl border border-red-500/30">
                    <p className="text-sm text-red-500">{error}</p>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-border/40 mb-6">
                <nav className="-mb-px flex space-x-8">
                    {(['SUBMITTED', 'APPROVED', 'COMMITTED'] as const).map((tab) => {
                        const isActive = activeTab === tab
                        let label = 'Active POs'
                        if (tab === 'SUBMITTED') {
                            label = 'Pending Approval'
                        } else if (tab === 'APPROVED') {
                            label = 'Pending PO'
                        }
                        let className = 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors '
                        className += isActive ? 'border-primary text-primary' : 'border-transparent text-foreground/60 hover:text-foreground'
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={className}
                            >
                                {label}
                            </button>
                        )
                    })}
                </nav>
            </div>

            <RequisitionsTable
                requisitions={requisitions}
                isLoading={isLoading}
                activeTab={activeTab}
                handleApprove={handleApprove}
                handleReject={handleReject}
                handleCommitBudget={handleCommitBudget}
                openReceiveGrn={(id) => { void openReceiveGrn(id) }}
                openPoDetail={(id) => { void openPoDetail(id) }}
            />

            <CreateRequisitionModal
                isCreateOpen={isCreateOpen}
                setIsCreateOpen={setIsCreateOpen}
                dept={dept}
                setDept={setDept}
                desc={desc}
                setDesc={setDesc}
                itemDesc={itemDesc}
                setItemDesc={setItemDesc}
                qty={qty}
                setQty={setQty}
                unitCost={unitCost}
                setUnitCost={setUnitCost}
                budgetLineId={budgetLineId}
                setBudgetLineId={setBudgetLineId}
                isCapitalAsset={isCapitalAsset}
                setIsCapitalAsset={setIsCapitalAsset}
                assetCategoryId={assetCategoryId}
                setAssetCategoryId={setAssetCategoryId}
                budgets={budgets}
                assetCategories={assetCategories}
                handleCreateRequisition={handleCreateRequisition}
            />

            <GrnReceiveModal
                isGrnOpen={isGrnOpen}
                setIsGrnOpen={setIsGrnOpen}
                grnPoSummary={grnPoSummary}
                grnItems={grnItems}
                grnForm={grnForm}
                setGrnForm={setGrnForm}
                submitGrn={submitGrn}
            />

            <PoDetailModal
                isPoDetailOpen={isPoDetailOpen}
                setIsPoDetailOpen={setIsPoDetailOpen}
                poDetail={poDetail ?? null}
                voucherDisabled={voucherDisabled}
                voucherTitle={voucherTitle}
                setVoucherContext={setVoucherContext}
                setIsVoucherOpen={setIsVoucherOpen}
            />

            <VoucherModal
                isVoucherOpen={isVoucherOpen}
                setIsVoucherOpen={setIsVoucherOpen}
                voucherContext={voucherContext}
                setVoucherContext={setVoucherContext}
                submitVoucher={submitVoucher}
            />
        </div>
    )
}
