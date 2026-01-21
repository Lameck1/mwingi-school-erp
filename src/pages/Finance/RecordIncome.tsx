import { useEffect, useState } from 'react'
import { useAuthStore } from '../../stores'
import { Plus, Check, Loader2 } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { Link } from 'react-router-dom'

export default function RecordIncome() {
    const { user } = useAuthStore()
    const { showToast } = useToast()
    
    const [categories, setCategories] = useState<any[]>([])
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

    useEffect(() => {
        loadCategories()
    }, [])

    const loadCategories = async () => {
        try {
            const allCats = await window.electronAPI.getTransactionCategories()
            setCategories(allCats.filter((c: any) => c.category_type === 'INCOME'))
        } catch (error) {
            console.error('Failed to load categories:', error)
            showToast('Failed to load income categories', 'error')
        }
    }

    const handleCreateCategory = async () => {
        if (!newCategory.trim()) return
        try {
            setLoading(true)
            await window.electronAPI.createTransactionCategory(newCategory, 'INCOME')
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

        setSaving(true)
        try {
            await window.electronAPI.createTransaction({
                ...formData,
                amount: parseFloat(formData.amount)
            }, user!.id)

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
        <div className="p-6 max-w-4xl mx-auto">
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Record Income</h1>
                    <p className="text-gray-500 mt-1">Record donations, grants, loans, and other income sources</p>
                </div>
                <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm max-w-xs border border-blue-100">
                    <p className="font-semibold mb-1">Looking to record Student Fees?</p>
                    <p className="mb-2">Student fee payments should be recorded in the Fee Payments section to update student balances automatically.</p>
                    <Link to="/finance/payments" className="text-blue-600 hover:text-blue-800 font-medium underline">
                        Go to Fee Payments &rarr;
                    </Link>
                </div>
            </div>

            <div className="card">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Date */}
                        <div>
                            <label htmlFor="transaction_date" className="block text-sm font-medium text-gray-700 mb-1">
                                Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                id="transaction_date"
                                type="date"
                                required
                                value={formData.transaction_date}
                                onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                                className="input w-full"
                            />
                        </div>

                        {/* Amount */}
                        <div>
                            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                                Amount (KES) <span className="text-red-500">*</span>
                            </label>
                            <input
                                id="amount"
                                type="number"
                                required
                                min="0"
                                step="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                className="input w-full"
                                placeholder="0.00"
                            />
                        </div>

                        {/* Income Type */}
                        <div>
                            <label htmlFor="transaction_type" className="block text-sm font-medium text-gray-700 mb-1">
                                Income Type <span className="text-red-500">*</span>
                            </label>
                            <select
                                id="transaction_type"
                                required
                                value={formData.transaction_type}
                                onChange={(e) => setFormData({ ...formData, transaction_type: e.target.value })}
                                className="input w-full"
                            >
                                <option value="DONATION">Donation</option>
                                <option value="GRANT">Grant</option>
                                <option value="LOAN">Loan</option>
                                <option value="OTHER_INCOME">Other Income</option>
                            </select>
                        </div>

                        {/* Category */}
                        <div>
                            <label htmlFor="category_id" className="block text-sm font-medium text-gray-700 mb-1">
                                Category <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                                <select
                                    id="category_id"
                                    required
                                    value={formData.category_id}
                                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                                    className="input w-full"
                                >
                                    <option value="">Select Category</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setShowNewCategoryInput(!showNewCategoryInput)}
                                    className="btn btn-secondary p-2"
                                    title="Add New Category"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>
                            {showNewCategoryInput && (
                                <div className="mt-2 flex gap-2">
                                    <input
                                        type="text"
                                        aria-label="New Category Name"
                                        value={newCategory}
                                        onChange={(e) => setNewCategory(e.target.value)}
                                        className="input flex-1"
                                        placeholder="New Category Name"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleCreateCategory}
                                        disabled={loading || !newCategory}
                                        className="btn btn-primary px-3"
                                        title="Save Category"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Payment Method */}
                        <div>
                            <label htmlFor="payment_method" className="block text-sm font-medium text-gray-700 mb-1">
                                Payment Method <span className="text-red-500">*</span>
                            </label>
                            <select
                                id="payment_method"
                                required
                                value={formData.payment_method}
                                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                                className="input w-full"
                            >
                                <option value="CASH">Cash</option>
                                <option value="MPESA">M-Pesa</option>
                                <option value="BANK_TRANSFER">Bank Transfer</option>
                                <option value="CHEQUE">Cheque</option>
                            </select>
                        </div>

                        {/* Reference */}
                        <div>
                            <label htmlFor="payment_reference" className="block text-sm font-medium text-gray-700 mb-1">
                                Reference No.
                            </label>
                            <input
                                id="payment_reference"
                                type="text"
                                value={formData.payment_reference}
                                onChange={(e) => setFormData({ ...formData, payment_reference: e.target.value })}
                                className="input w-full"
                                placeholder="e.g. Check No, M-Pesa Code"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                            Description / Source
                        </label>
                        <textarea
                            id="description"
                            rows={3}
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="input w-full"
                            placeholder="Enter details about this income..."
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button
                            type="button"
                            onClick={() => window.history.back()}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="btn btn-primary flex items-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    Save Income
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
