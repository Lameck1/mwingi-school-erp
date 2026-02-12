import { Plus, Check, Loader2, ArrowRightCircle, Wallet, Tag, CreditCard, FileText, Calendar } from 'lucide-react'
import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'

import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../stores'
import { type TransactionCategory } from '../../types/electron-api/FinanceAPI'
import { shillingsToCents } from '../../utils/format'

import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'

export default function RecordIncome() {
    const { user } = useAuthStore()
    const { showToast } = useToast()

    const [categories, setCategories] = useState<TransactionCategory[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [newCategory, setNewCategory] = useState('')
    const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)

    const [formData, setFormData] = useState({
        transaction_date: new Date().toISOString().slice(0, 10),
        amount: '',
        category_id: '',
        transaction_type: 'DONATION',
        payment_method: 'CASH',
        payment_reference: '',
        description: '',
    })

    const loadCategories = useCallback(async () => {
        try {
            const allCats = await globalThis.electronAPI.getTransactionCategories()
            setCategories(allCats.filter((c: TransactionCategory) => c.category_type === 'INCOME'))
        } catch (error) {
            console.error('Failed to load categories:', error)
            showToast('Failed to load income categories', 'error')
        }
    }, [showToast])

    useEffect(() => {
        loadCategories().catch((err: unknown) => console.error('Failed to load income categories', err))
    }, [loadCategories])

    const handleCreateCategory = async () => {
        if (!newCategory.trim()) {return}
        try {
            setLoading(true)
            await globalThis.electronAPI.createTransactionCategory(newCategory, 'INCOME')
            await loadCategories()
            setNewCategory('')
            setShowNewCategoryInput(false)
            showToast('Category created successfully', 'success')
        } catch (error) {
            console.error('Failed to create category:', error)
            showToast('Failed to create category', 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.amount || !formData.category_id) {
            showToast('Please fill in all required fields', 'warning')
            return
        }
        if (!user?.id) {
            showToast('User session not found. Please log in again.', 'error')
            return
        }

        setSaving(true)
        try {
            await globalThis.electronAPI.createTransaction({
                transaction_date: formData.transaction_date,
                transaction_type: 'INCOME',
                amount: shillingsToCents(formData.amount), // Whole currency units
                category_id: Number.parseInt(formData.category_id, 10),
                payment_method: formData.payment_method,
                payment_reference: formData.payment_reference,
                description: formData.description
            }, user.id)

            showToast('Income recorded successfully', 'success')
            setFormData({
                transaction_date: new Date().toISOString().slice(0, 10),
                amount: '',
                category_id: '',
                transaction_type: 'DONATION',
                payment_method: 'CASH',
                payment_reference: '',
                description: '',
            })
        } catch (error) {
            console.error('Failed to record income:', error)
            showToast('Failed to record income', 'error')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div>
                    <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Record Income' }]} />
                    <h1 className="text-xl md:text-3xl font-bold font-heading uppercase tracking-tight text-emerald-500/90">Record Income</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Document donations, grants, and miscellaneous capital influxes</p>
                </div>
                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 max-w-sm group hover:bg-primary/10 transition-colors">
                    <div className="flex gap-3 mb-2">
                        <Wallet className="w-5 h-5 text-primary opacity-60" />
                        <p className="font-bold text-xs text-foreground/80 uppercase tracking-tight">Fee Payment Protocol</p>
                    </div>
                    <p className="text-[10px] text-foreground/40 font-medium leading-relaxed italic mb-3">
                        Student fee payments should be processed via the dedicated payment module to ensure automated balance reconciliation.
                    </p>
                    <Link to="/fee-payment" className="flex items-center gap-2 text-primary text-[10px] font-bold uppercase tracking-widest hover:gap-3 transition-all">
                        <span>Initiate Fee Payment</span>
                        <ArrowRightCircle className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </div>

            <div className="card animate-slide-up relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                    <Wallet className="w-32 h-32 -rotate-12" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Date */}
                        <div className="space-y-2">
                            <label htmlFor="transaction_date" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <Calendar className="w-3 h-3" />
                                Transaction Timestamp <span className="text-destructive">*</span>
                            </label>
                            <input
                                id="transaction_date"
                                type="date"
                                required
                                value={formData.transaction_date}
                                onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                                className="input w-full h-12 font-bold text-xs uppercase tracking-tight"
                            />
                        </div>

                        {/* Amount */}
                        <div className="space-y-2">
                            <label htmlFor="amount" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <Tag className="w-3 h-3" />
                                Aggregate Amount (KES) <span className="text-destructive">*</span>
                            </label>
                            <input
                                id="amount"
                                type="number"
                                required
                                min="0"
                                step="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                className="input w-full h-12 text-lg font-bold"
                                placeholder="0.00"
                            />
                        </div>

                        {/* Income Type */}
                        <div className="space-y-2">
                            <label htmlFor="transaction_type" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Protocol Type <span className="text-destructive">*</span></label>
                            <select
                                id="transaction_type"
                                required
                                value={formData.transaction_type}
                                onChange={(e) => setFormData({ ...formData, transaction_type: e.target.value })}
                                className="input w-full h-12 font-bold text-xs uppercase tracking-tight"
                            >
                                <option value="DONATION">General Donation</option>
                                <option value="GRANT">Institutional Grant</option>
                                <option value="LOAN">Capital Loan</option>
                                <option value="OTHER_INCOME">Miscellaneous Revenue</option>
                            </select>
                        </div>

                        {/* Category */}
                        <div className="space-y-2">
                            <label htmlFor="category_id" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Revenue Vector <span className="text-destructive">*</span></label>
                            <div className="flex gap-2">
                                <select
                                    id="category_id"
                                    required
                                    value={formData.category_id}
                                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                                    className="input w-full h-12 font-bold text-xs uppercase tracking-tight"
                                >
                                    <option value="">Select Category</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setShowNewCategoryInput(!showNewCategoryInput)}
                                    className="p-3 bg-secondary/50 border border-border/40 hover:bg-primary/10 hover:border-primary/40 rounded-xl transition-all"
                                    title="Add New Category"
                                >
                                    <Plus className="w-5 h-5 text-foreground/60" />
                                </button>
                            </div>
                            {showNewCategoryInput && (
                                <div className="mt-3 flex gap-2 animate-in slide-in-from-top-2 duration-300">
                                    <input
                                        type="text"
                                        aria-label="New Category Name"
                                        value={newCategory}
                                        onChange={(e) => setNewCategory(e.target.value)}
                                        className="input flex-1 h-12"
                                        placeholder="New Category Identifier"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleCreateCategory}
                                        disabled={loading || !newCategory}
                                        className="btn btn-primary px-4 h-12"
                                        title="Confirm Vector"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Payment Method */}
                        <div className="space-y-2">
                            <label htmlFor="payment_method" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <CreditCard className="w-3 h-3" />
                                Settlement Instrument <span className="text-destructive">*</span>
                            </label>
                            <select
                                id="payment_method"
                                required
                                value={formData.payment_method}
                                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                                className="input w-full h-12 font-bold text-xs uppercase tracking-tight"
                            >
                                <option value="CASH">Liquid Cash</option>
                                <option value="MPESA">M-Pesa Mobile</option>
                                <option value="BANK_TRANSFER">Direct EFT/Bank</option>
                                <option value="CHEQUE">Banker's Cheque</option>
                            </select>
                        </div>

                        {/* Reference */}
                        <div className="space-y-2">
                            <label htmlFor="payment_reference" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Reference Artifact Identifier</label>
                            <input
                                id="payment_reference"
                                type="text"
                                value={formData.payment_reference}
                                onChange={(e) => setFormData({ ...formData, payment_reference: e.target.value })}
                                className="input w-full h-12 font-mono text-xs tracking-wider"
                                placeholder="e.g. TXN-XJ72, CHQ#00124"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <label htmlFor="description" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1 flex items-center gap-2">
                            <FileText className="w-3 h-3" />
                            Narrative Context
                        </label>
                        <textarea
                            id="description"
                            rows={3}
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="input w-full p-4 min-h-[100px] leading-relaxed italic"
                            placeholder="Provide detailed narrative or source identification for this revenue entry..."
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-8 border-t border-border/10">
                        <button
                            type="button"
                            onClick={() => globalThis.history.back()}
                            className="btn btn-secondary px-8 py-3 font-bold uppercase tracking-widest text-[10px]"
                        >
                            Abort Record
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="btn btn-primary flex items-center gap-3 px-10 py-3 font-bold uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Syncing Record...</span>
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    <span>Commit Revenue Entry</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
