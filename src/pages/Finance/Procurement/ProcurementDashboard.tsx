import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useProcurement } from '../../../hooks/useProcurement'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../contexts/ToastContext'
import { PageHeader } from '../../../components/patterns/PageHeader'

interface RequisitionRow {
    id: number
    requisition_number: string
    department: string
    description: string
    total_amount: number
    jss_account_type?: 'TUITION' | 'OPERATIONS' | 'INFRASTRUCTURE' | null
}

export default function ProcurementDashboard() {
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

    const [budgets, setBudgets] = useState<any[]>([])
    const [assetCategories, setAssetCategories] = useState<any[]>([])

    useEffect(() => {
        if (isCreateOpen) {
            void window.electronAPI.getBudgets().then(res => setBudgets(res || []))
            void window.electronAPI.getAssetCategories().then(res => setAssetCategories(res || []))
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
        if (window.confirm('Approve this requisition?')) {
            await approveRequisition(id)
            void fetchRequisitions()
        }
    }

    const handleReject = async (id: number) => {
        const reason = window.prompt('Enter rejection reason:')
        if (reason) {
            await rejectRequisition(id, reason)
            void fetchRequisitions()
        }
    }

    const handleCommitBudget = async (id: number) => {
        if (window.confirm('Commit budget for this PO?')) {
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
        const payload: any = {
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
        }
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
            const po = await window.electronAPI.finance.getPoByRequisition(requisitionId)
            if (!po) {
                showToast('No Purchase Order found for this requisition', 'error')
                return
            }
            const summary = await window.electronAPI.finance.getPoSummary(po.id)
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
    const [poDetail, setPoDetail] = useState<null | Awaited<ReturnType<typeof window.electronAPI.finance.getPoSummary>>>(null)
    const [isPoDetailOpen, setIsPoDetailOpen] = useState(false)
    const openPoDetail = async (requisitionId: number) => {
        const po = await window.electronAPI.finance.getPoByRequisition(requisitionId)
        if (!po) {
            showToast('No Purchase Order found for this requisition', 'error')
            return
        }
        const summary = await window.electronAPI.finance.getPoSummary(po.id)
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

            <div className="card overflow-hidden">
                {isLoading ? (
                    <div className="p-12 flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <table className="table w-full">
                        <thead>
                            <tr>
                                <th className="text-left py-3 px-4 text-sm font-semibold text-foreground/80">Req Number</th>
                                <th className="text-left py-3 px-4 text-sm font-semibold text-foreground/80">Department</th>
                                <th className="text-left py-3 px-4 text-sm font-semibold text-foreground/80">Description</th>
                                <th className="text-left py-3 px-4 text-sm font-semibold text-foreground/80">Total Amount</th>
                                <th className="text-left py-3 px-4 text-sm font-semibold text-foreground/80">Account Type</th>
                                <th className="text-right py-3 px-4 text-sm font-semibold text-foreground/80"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {requisitions.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-sm text-foreground/50">
                                        No requisitions found in this state.
                                    </td>
                                </tr>
                            ) : (
                                requisitions.map((req) => (
                                    <tr key={req.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="whitespace-nowrap py-4 px-4 text-sm font-medium text-foreground">
                                            {req.requisition_number}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-foreground/70">{req.department}</td>
                                        <td className="px-4 py-4 text-sm text-foreground max-w-xs truncate" title={req.description}>{req.description}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-foreground">
                                            Kes {req.total_amount.toLocaleString()}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-foreground/70">
                                            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
                                                {req.jss_account_type || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="relative whitespace-nowrap py-4 px-4 text-right text-sm font-medium space-x-2">
                                            {activeTab === 'SUBMITTED' && (
                                                <>
                                                    <button onClick={() => handleApprove(req.id)} className="btn btn-secondary py-1 px-2 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-500">Approve</button>
                                                    <button onClick={() => handleReject(req.id)} className="btn btn-secondary py-1 px-2 border-red-500/30 hover:bg-red-500/10 text-red-500">Reject</button>
                                                </>
                                            )}
                                            {activeTab === 'APPROVED' && (
                                                <button onClick={() => handleCommitBudget(req.id)} className="btn btn-secondary py-1 px-2">Commit Budget & PO</button>
                                            )}
                                            {activeTab === 'COMMITTED' && (
                                                <>
                                                    <button onClick={() => { void openReceiveGrn(req.id) }} className="btn btn-secondary py-1 px-2">Receive GRN</button>
                                                    <button onClick={() => { void openPoDetail(req.id) }} className="btn btn-secondary py-1 px-2">PO Details</button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Requisition" size="md">
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Department</label>
                            <input className="input" value={dept} onChange={(e) => setDept(e.target.value)} placeholder="e.g., Admin" />
                        </div>
                        <div>
                            <label className="label">Description</label>
                            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Purpose of requisition" />
                        </div>
                    </div>

                    <div>
                        <label className="label">Budget Line (Optional)</label>
                        <select className="input" value={budgetLineId} onChange={e => setBudgetLineId(e.target.value)}>
                            <option value="">-- No Budget Line / Select Budget --</option>
                            {budgets.map((b: any) => (
                                <optgroup key={b.id} label={b.budget_name}>
                                    {(b.line_items || []).map((li: any) => (
                                        <option key={li.id} value={li.id}>{li.category_name} - {li.description} (Avl: Kes {Number(li.available_balance || 0).toLocaleString()})</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2 pb-2 border-b border-border/10">
                        <label className="label font-medium text-foreground">Item Details</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <input className="input md:col-span-2" value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} placeholder="Item description" />
                            <div className="flex gap-2">
                                <input type="number" min={1} className="input w-24" value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} placeholder="Qty" />
                                <input type="number" min={0} step="0.01" className="input w-32" value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value) || 0)} placeholder="Unit Cost" />
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mt-3">
                            <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
                                <input type="checkbox" checked={isCapitalAsset} onChange={e => setIsCapitalAsset(e.target.checked)} className="rounded border-input text-primary focus:ring-primary" />
                                Capital Asset?
                            </label>
                            {isCapitalAsset && (
                                <select className="input h-8 py-1 text-sm flex-1" value={assetCategoryId} onChange={e => setAssetCategoryId(e.target.value)}>
                                    <option value="">-- Select Asset Category --</option>
                                    {assetCategories.map((c: any) => (
                                        <option key={c.id} value={c.id}>{c.category_name}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={() => { void handleCreateRequisition() }} disabled={!dept || !desc || !itemDesc || qty <= 0 || unitCost <= 0 || (isCapitalAsset && !assetCategoryId)}>
                            Save & Submit
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isGrnOpen}
                onClose={() => setIsGrnOpen(false)}
                title={grnPoSummary ? `Receive GRN • ${grnPoSummary.po.po_number}` : 'Receive GRN'}
                size="lg"
            >
                {grnPoSummary ? (
                    <div className="space-y-4">
                        <table className="table w-full text-sm">
                            <thead>
                                <tr className="text-foreground/70 border-b border-border/20">
                                    <th className="text-left py-2 px-3">Item</th>
                                    <th className="text-right py-2 px-3">Ordered</th>
                                    <th className="text-right py-2 px-3">Received</th>
                                    <th className="text-right py-2 px-3">Outstanding</th>
                                    <th className="text-right py-2 px-3">Receive Now</th>
                                    <th className="text-right py-2 px-3">Accept</th>
                                    <th className="text-right py-2 px-3">Reject</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {grnItems.map(it => {
                                    const entry = grnForm[it.id] || { recv: 0, accept: 0 }
                                    const rejected = Math.max(0, entry.recv - entry.accept)
                                    return (
                                        <tr key={it.id} className="hover:bg-white/[0.02]">
                                            <td className="py-2 px-3">{it.description}</td>
                                            <td className="py-2 px-3 text-right">{it.quantity}</td>
                                            <td className="py-2 px-3 text-right">{it.received_quantity}</td>
                                            <td className="py-2 px-3 text-right font-semibold text-foreground">{it.outstanding}</td>
                                            <td className="py-2 px-3 text-right">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={it.outstanding}
                                                    value={entry.recv}
                                                    onChange={e => setGrnForm(s => ({ ...s, [it.id]: { recv: Number(e.target.value) || 0, accept: Math.min(Number(e.target.value) || 0, (s[it.id]?.accept ?? 0)) } }))}
                                                    className="input w-24 text-right"
                                                    aria-label="Quantity received now"
                                                />
                                            </td>
                                            <td className="py-2 px-3 text-right">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={Math.min(it.outstanding, entry.recv)}
                                                    value={entry.accept}
                                                    onChange={e => setGrnForm(s => ({ ...s, [it.id]: { recv: entry.recv, accept: Number(e.target.value) || 0 } }))}
                                                    className="input w-24 text-right"
                                                    aria-label="Quantity accepted"
                                                />
                                            </td>
                                            <td className="py-2 px-3 text-right text-red-500">{rejected}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>

                        <div className="flex justify-end gap-2">
                            <button className="btn btn-secondary" onClick={() => setIsGrnOpen(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={() => { void submitGrn() }}>Record GRN</button>
                        </div>
                    </div>
                ) : (
                    <div className="p-6 text-sm text-foreground/50">Loading…</div>
                )}
            </Modal>

            <Modal isOpen={isPoDetailOpen} onClose={() => setIsPoDetailOpen(false)} title="Purchase Order Details" size="lg">
                {poDetail ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm">
                                <div className="font-semibold text-foreground">{poDetail.po.po_number}</div>
                                <div className="text-foreground/60">Status: {poDetail.po.status}</div>
                                <div className="text-foreground/60">Total: Kes {poDetail.po.total_amount.toLocaleString()}</div>
                            </div>
                            <div className="text-sm text-foreground/60">
                                <div>Latest GRN: {poDetail.latest_grn ? `#${poDetail.latest_grn.id} (${poDetail.latest_grn.status})` : 'None'}</div>
                            </div>
                        </div>
                        <table className="table w-full text-sm">
                            <thead>
                                <tr className="text-foreground/70 border-b border-border/20">
                                    <th className="text-left py-2 px-3">Item</th>
                                    <th className="text-right py-2 px-3">Ordered</th>
                                    <th className="text-right py-2 px-3">Received</th>
                                    <th className="text-right py-2 px-3">Outstanding</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {poDetail.items.map(i => (
                                    <tr key={i.id} className="hover:bg-white/[0.02]">
                                        <td className="py-2 px-3">{i.description}</td>
                                        <td className="py-2 px-3 text-right">{i.quantity}</td>
                                        <td className="py-2 px-3 text-right">{i.received_quantity}</td>
                                        <td className="py-2 px-3 text-right font-semibold text-foreground">{i.outstanding}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="flex justify-end">
                            <button
                                className="btn btn-primary"
                                disabled={voucherDisabled}
                                onClick={() => {
                                    if (!poDetail.latest_grn) { return }
                                    setVoucherContext({
                                        poId: poDetail.po.id,
                                        supplierId: poDetail.po.supplier_id,
                                        grnId: poDetail.latest_grn.id,
                                        amount: poDetail.po.total_amount
                                    })
                                    setIsVoucherOpen(true)
                                }}
                                title={voucherTitle}
                            >
                                Create Voucher
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-6 text-sm text-foreground/50">Loading…</div>
                )}
            </Modal>

            <Modal isOpen={isVoucherOpen} onClose={() => setIsVoucherOpen(false)} title="Create Payment Voucher" size="md">
                {voucherContext ? (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="label" htmlFor="voucher-amount">Amount (KES)</label>
                            <input
                                id="voucher-amount"
                                type="number"
                                min={1}
                                className="input"
                                value={voucherContext.amount}
                                onChange={e => setVoucherContext(v => v ? { ...v, amount: Number(e.target.value) || 0 } : v)}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button className="btn btn-secondary" onClick={() => setIsVoucherOpen(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={() => { void submitVoucher() }}>Create Voucher</button>
                        </div>
                    </div>
                ) : (
                    <div className="p-6 text-sm text-foreground/50">Loading…</div>
                )}
            </Modal>
        </div>
    )
}
