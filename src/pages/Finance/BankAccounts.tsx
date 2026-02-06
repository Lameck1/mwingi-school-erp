import React, { useState, useEffect } from 'react'
import { Plus, Building2, CreditCard, TrendingUp } from 'lucide-react'
import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'
import { Modal } from '../../components/ui/Modal'
import { formatCurrency } from '../../utils/format'

interface BankAccount {
    id: number
    account_name: string
    account_number: string
    bank_name: string
    branch: string | null
    currency: string
    opening_balance: number
    current_balance: number
    is_active: boolean
}

export default function BankAccounts() {
    const [accounts, setAccounts] = useState<BankAccount[]>([])
    const [loading, setLoading] = useState(true)
    const [showAddModal, setShowAddModal] = useState(false)
    const [formData, setFormData] = useState({
        account_name: '',
        account_number: '',
        bank_name: '',
        branch: '',
        opening_balance: 0
    })
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        loadAccounts()
    }, [])

    const loadAccounts = async () => {
        setLoading(true)
        try {
            const data = await window.electronAPI.getBankAccounts()
            setAccounts(data)
        } catch (error) {
            console.error('Failed to load bank accounts:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            const result = await window.electronAPI.createBankAccount({
                ...formData,
                opening_balance: Math.round(formData.opening_balance) // Whole currency units
            })

            if (result.success) {
                setShowAddModal(false)
                setFormData({ account_name: '', account_number: '', bank_name: '', branch: '', opening_balance: 0 })
                loadAccounts()
            } else {
                alert(result.errors?.join(', ') || 'Failed to create account')
            }
        } catch (error) {
            console.error('Failed to create account:', error)
        } finally {
            setSaving(false)
        }
    }

    const totalBalance = accounts.reduce((sum, acc) => sum + acc.current_balance, 0)

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Bank Accounts"
                subtitle="Manage bank accounts for reconciliation"
                breadcrumbs={[{ label: 'Finance' }, { label: 'Bank Accounts' }]}
                actions={
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add Account
                    </button>
                }
            />

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    label="Total Accounts"
                    value={accounts.length.toString()}
                    icon={Building2}
                    color="from-blue-500/20 to-indigo-500/20 text-blue-400"
                />
                <StatCard
                    label="Total Balance"
                    value={formatCurrency(totalBalance)}
                    icon={CreditCard}
                    color="from-emerald-500/20 to-teal-500/20 text-emerald-400"
                />
                <StatCard
                    label="Active Accounts"
                    value={accounts.filter(a => a.is_active).length.toString()}
                    icon={TrendingUp}
                    color="from-purple-500/20 to-pink-500/20 text-purple-400"
                />
            </div>

            {/* Accounts List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    [1, 2, 3].map(i => (
                        <div key={i} className="h-40 bg-secondary/30 animate-pulse rounded-xl" />
                    ))
                ) : accounts.length === 0 ? (
                    <div className="col-span-full text-center py-16 text-foreground/40">
                        No bank accounts added yet
                    </div>
                ) : (
                    accounts.map(account => (
                        <div key={account.id} className="premium-card group hover:border-primary/30 transition-colors">
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 text-blue-400">
                                    <Building2 className="w-5 h-5" />
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${account.is_active
                                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                    : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                                    }`}>
                                    {account.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>

                            <h3 className="text-lg font-bold text-foreground mb-1">{account.account_name}</h3>
                            <p className="text-sm text-foreground/50 mb-4">{account.bank_name}{account.branch ? ` - ${account.branch}` : ''}</p>

                            <div className="flex items-center justify-between pt-4 border-t border-border/20">
                                <div>
                                    <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">Account No.</p>
                                    <p className="text-sm font-mono text-foreground/70">{account.account_number}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">Balance</p>
                                    <p className="text-lg font-bold text-foreground font-mono">{formatCurrency(account.current_balance)}</p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add Account Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Add Bank Account"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-foreground/60">Account Name *</label>
                        <input
                            type="text"
                            value={formData.account_name}
                            onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                            placeholder="e.g., School Main Account"
                            className="w-full bg-secondary/20 border border-border/20 rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground/60">Bank Name *</label>
                            <input
                                type="text"
                                value={formData.bank_name}
                                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                                placeholder="e.g., KCB"
                                className="w-full bg-secondary/20 border border-border/20 rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground/60">Branch</label>
                            <input
                                type="text"
                                value={formData.branch}
                                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                                placeholder="e.g., Mwingi Branch"
                                className="w-full bg-secondary/20 border border-border/20 rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground/60">Account Number *</label>
                            <input
                                type="text"
                                value={formData.account_number}
                                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                                placeholder="e.g., 1234567890"
                                className="w-full bg-secondary/20 border border-border/20 rounded-lg px-4 py-2.5 text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground/60">Opening Balance</label>
                            <input
                                type="number"
                                value={formData.opening_balance || ''}
                                onChange={(e) => setFormData({ ...formData, opening_balance: Number(e.target.value) })}
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                                className="w-full bg-secondary/20 border border-border/20 rounded-lg px-4 py-2.5 text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => setShowAddModal(false)}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="btn btn-primary"
                        >
                            {saving ? 'Saving...' : 'Add Account'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}

