import { Modal } from '../../../components/ui/Modal'

export interface RequisitionRow {
    id: number
    requisition_number: string
    department: string
    description: string
    total_amount: number
    jss_account_type?: 'TUITION' | 'OPERATIONS' | 'INFRASTRUCTURE' | null
}

interface RequisitionsTableProps {
    requisitions: RequisitionRow[]
    isLoading: boolean
    activeTab: 'SUBMITTED' | 'APPROVED' | 'COMMITTED'
    handleApprove: (id: number) => Promise<void>
    handleReject: (id: number) => Promise<void>
    handleCommitBudget: (id: number) => Promise<void>
    openReceiveGrn: (requisitionId: number) => void
    openPoDetail: (requisitionId: number) => void
}

export function RequisitionsTable({ requisitions, isLoading, activeTab, handleApprove, handleReject, handleCommitBudget, openReceiveGrn, openPoDetail }: Readonly<RequisitionsTableProps>) {
    return (
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
                                                <button onClick={() => { openReceiveGrn(req.id) }} className="btn btn-secondary py-1 px-2">Receive GRN</button>
                                                <button onClick={() => { openPoDetail(req.id) }} className="btn btn-secondary py-1 px-2">PO Details</button>
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
    )
}

interface CreateRequisitionModalProps {
    isCreateOpen: boolean
    setIsCreateOpen: (open: boolean) => void
    dept: string
    setDept: (v: string) => void
    desc: string
    setDesc: (v: string) => void
    itemDesc: string
    setItemDesc: (v: string) => void
    qty: number
    setQty: (v: number) => void
    unitCost: number
    setUnitCost: (v: number) => void
    budgetLineId: string
    setBudgetLineId: (v: string) => void
    isCapitalAsset: boolean
    setIsCapitalAsset: (v: boolean) => void
    assetCategoryId: string
    setAssetCategoryId: (v: string) => void
    budgets: Array<{ id: number; budget_name: string; line_items: Array<{ id: number; category_name: string; description: string; available_balance: number }> }>
    assetCategories: Array<{ id: number; category_name: string }>
    handleCreateRequisition: () => Promise<void>
}

export function CreateRequisitionModal({ isCreateOpen, setIsCreateOpen, dept, setDept, desc, setDesc, itemDesc, setItemDesc, qty, setQty, unitCost, setUnitCost, budgetLineId, setBudgetLineId, isCapitalAsset, setIsCapitalAsset, assetCategoryId, setAssetCategoryId, budgets, assetCategories, handleCreateRequisition }: Readonly<CreateRequisitionModalProps>) {
    return (
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Requisition" size="md">
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="label" htmlFor="req-department">Department</label>
                        <input id="req-department" className="input" value={dept} onChange={(e) => setDept(e.target.value)} placeholder="e.g., Admin" />
                    </div>
                    <div>
                        <label className="label" htmlFor="req-description">Description</label>
                        <input id="req-description" className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Purpose of requisition" />
                    </div>
                </div>

                <div>
                    <label className="label" htmlFor="budget-line">Budget Line (Optional)</label>
                    <select id="budget-line" className="input" value={budgetLineId} onChange={e => setBudgetLineId(e.target.value)}>
                        <option value="">-- No Budget Line / Select Budget --</option>
                        {budgets.map((b) => (
                            <optgroup key={b.id} label={b.budget_name}>
                                {(b.line_items || []).map((li) => (
                                    <option key={li.id} value={li.id}>{li.category_name} - {li.description} (Avl: Kes {Number(li.available_balance || 0).toLocaleString()})</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>

                <div className="space-y-2 pb-2 border-b border-border/10">
                    <span className="label font-medium text-foreground">Item Details</span>
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
                            <span>Capital Asset?</span>
                        </label>
                        {isCapitalAsset && (
                            <select className="input h-8 py-1 text-sm flex-1" value={assetCategoryId} onChange={e => setAssetCategoryId(e.target.value)} aria-label="Asset category">
                                <option value="">-- Select Asset Category --</option>
                                {assetCategories.map((c) => (
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
    )
}

interface GrnReceiveModalProps {
    isGrnOpen: boolean
    setIsGrnOpen: (open: boolean) => void
    grnPoSummary: null | {
        po: { id: number; po_number: string; requisition_id: number; supplier_id: number; total_amount: number; status: string }
        items: Array<{ id: number; description: string; quantity: number; received_quantity: number; outstanding: number }>
    }
    grnItems: Array<{ id: number; description: string; quantity: number; received_quantity: number; outstanding: number }>
    grnForm: Record<number, { recv: number; accept: number }>
    setGrnForm: (updater: (prev: Record<number, { recv: number; accept: number }>) => Record<number, { recv: number; accept: number }>) => void
    submitGrn: () => Promise<void>
}

export function GrnReceiveModal({ isGrnOpen, setIsGrnOpen, grnPoSummary, grnItems, grnForm, setGrnForm, submitGrn }: Readonly<GrnReceiveModalProps>) {
    return (
        <Modal
            isOpen={isGrnOpen}
            onClose={() => setIsGrnOpen(false)}
            title={grnPoSummary ? `Receive GRN \u2022 ${grnPoSummary.po.po_number}` : 'Receive GRN'}
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
                <div className="p-6 text-sm text-foreground/50">Loading\u2026</div>
            )}
        </Modal>
    )
}

interface PoDetailModalProps {
    isPoDetailOpen: boolean
    setIsPoDetailOpen: (open: boolean) => void
    poDetail: null | { po: { id: number; po_number: string; supplier_id: number; total_amount: number; status: string }; items: Array<{ id: number; description: string; quantity: number; received_quantity: number; outstanding: number }>; latest_grn?: { id: number; status: string } | null }
    voucherDisabled: boolean
    voucherTitle: string
    setVoucherContext: (ctx: { poId: number; supplierId: number; grnId: number; amount: number } | null) => void
    setIsVoucherOpen: (open: boolean) => void
}

export function PoDetailModal({ isPoDetailOpen, setIsPoDetailOpen, poDetail, voucherDisabled, voucherTitle, setVoucherContext, setIsVoucherOpen }: Readonly<PoDetailModalProps>) {
    return (
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
                <div className="p-6 text-sm text-foreground/50">Loading\u2026</div>
            )}
        </Modal>
    )
}

interface VoucherModalProps {
    isVoucherOpen: boolean
    setIsVoucherOpen: (open: boolean) => void
    voucherContext: { poId: number; supplierId: number; grnId: number; amount: number } | null
    setVoucherContext: (ctx: { poId: number; supplierId: number; grnId: number; amount: number } | null) => void
    submitVoucher: () => Promise<void>
}

export function VoucherModal({ isVoucherOpen, setIsVoucherOpen, voucherContext, setVoucherContext, submitVoucher }: Readonly<VoucherModalProps>) {
    return (
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
                            onChange={e => setVoucherContext(voucherContext ? { ...voucherContext, amount: Number(e.target.value) || 0 } : null)}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button className="btn btn-secondary" onClick={() => setIsVoucherOpen(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={() => { void submitVoucher() }}>Create Voucher</button>
                    </div>
                </div>
            ) : (
                <div className="p-6 text-sm text-foreground/50">Loading\u2026</div>
            )}
        </Modal>
    )
}
