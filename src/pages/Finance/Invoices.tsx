import { useEffect, useState, useMemo } from 'react'
import { FileText, Plus, Loader2, CheckCircle, AlertCircle, Eye, Printer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Invoice, InvoiceItem } from '../../types/electron-api/FinanceAPI'
import { useToast } from '../../contexts/ToastContext'
import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'
import { Modal } from '../../components/ui/Modal'
import { formatCurrency, formatDate } from '../../utils/format'

export default function Invoices() {
    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([])
    const navigate = useNavigate()
    const { showToast } = useToast()

    useEffect(() => {
        loadInvoices()
    }, [])

    const loadInvoices = async () => {
        try {
            const data = await window.electronAPI.getInvoices()
            setInvoices(data)
        } catch (error) {
            console.error('Failed to load invoices:', error)
            showToast('Failed to load invoices', 'error')
        } finally {
            setLoading(false)
        }
    }

    const viewInvoice = async (invoice: Invoice) => {
        try {
            const items = await window.electronAPI.getInvoiceItems(invoice.id)
            setInvoiceItems(items)
            setSelectedInvoice(invoice)
        } catch (error) {
            console.error('Failed to load invoice items:', error)
        }
    }

    const stats = useMemo(() => {
        const total = invoices.reduce((acc, inv) => acc + inv.total_amount, 0)
        const paid = invoices.reduce((acc, inv) => acc + inv.amount_paid, 0)
        const balance = total - paid

        return [
            { label: 'Total Invoiced', value: formatCurrency(total), icon: FileText, color: 'from-blue-500/20 to-indigo-500/20 text-indigo-400' },
            { label: 'Total Collected', value: formatCurrency(paid), icon: CheckCircle, color: 'from-emerald-500/20 to-teal-500/20 text-emerald-400' },
            { label: 'Outstanding Balance', value: formatCurrency(balance), icon: AlertCircle, color: 'from-rose-500/20 to-orange-500/20 text-rose-400' },
        ]
    }, [invoices])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Invoices"
                subtitle="Manage and track student fee invoices"
                breadcrumbs={[
                    { label: 'Finance', href: '/finance/fee-payment' },
                    { label: 'Invoices' }
                ]}
                actions={
                    <button
                        onClick={() => navigate('/fee-structure')}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" />
                        <span>Generate Invoices</span>
                    </button>
                }
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stats.map((stat, i) => (
                    <StatCard key={i} {...stat} />
                ))}
            </div>

            <div className="premium-card">
                {loading ? (
                    <div className="text-center py-16 text-foreground/40 flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                        <span>Loading invoices...</span>
                    </div>
                ) : invoices.length === 0 ? (
                    <div className="text-center py-16">
                        <FileText className="w-16 h-16 text-foreground/10 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-foreground mb-2">No Invoices Yet</h3>
                        <p className="text-foreground/40 mb-6">Generate invoices for students to track fee balances</p>
                        <button
                            onClick={() => navigate('/fee-structure')}
                            className="btn btn-primary"
                        >
                            Generate Term Invoices
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="premium-table">
                            <thead>
                                <tr>
                                    <th>Invoice No</th>
                                    <th>Student</th>
                                    <th>Term</th>
                                    <th>Date</th>
                                    <th className="text-right">Amount</th>
                                    <th className="text-right">Paid</th>
                                    <th className="text-right">Balance</th>
                                    <th className="text-center">Status</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map((inv) => (
                                    <tr key={inv.id}>
                                        <td className="font-mono text-xs font-bold">{inv.invoice_number}</td>
                                        <td className="font-bold">{inv.student_name}</td>
                                        <td>{inv.term_name}</td>
                                        <td>{formatDate(inv.invoice_date)}</td>
                                        <td className="text-right font-medium">{formatCurrency(inv.total_amount)}</td>
                                        <td className="text-right text-emerald-500 font-medium">{formatCurrency(inv.amount_paid)}</td>
                                        <td className="text-right text-amber-500 font-bold">{formatCurrency(inv.total_amount - inv.amount_paid)}</td>
                                        <td className="text-center">
                                            <span className={`status-badge ${inv.status === 'PAID' ? 'status-badge-success' :
                                                inv.status === 'PARTIAL' ? 'status-badge-warning' :
                                                    'status-badge-error'
                                                }`}>{inv.status}</span>
                                        </td>
                                        <td className="text-right">
                                            <button
                                                onClick={() => viewInvoice(inv)}
                                                className="btn btn-secondary px-3 py-1.5 text-xs hover:border-primary/40 group"
                                            >
                                                <Eye className="w-3.5 h-3.5 mr-1.5 opacity-40 group-hover:opacity-100" />
                                                Details
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* View Invoice Modal */}
            <Modal
                isOpen={!!selectedInvoice}
                onClose={() => setSelectedInvoice(null)}
                title="Invoice Breakdown"
                size="md"
            >
                {selectedInvoice && (
                    <div className="space-y-8">
                        {/* Header Details */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                            <div>
                                <p className="text-[10px] uppercase tracking-widest font-bold text-foreground/40 mb-1">Invoice Number</p>
                                <p className="font-mono text-sm font-bold border-l-2 border-primary/40 pl-2">{selectedInvoice.invoice_number}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-widest font-bold text-foreground/40 mb-1">Student</p>
                                <p className="font-bold text-foreground">{selectedInvoice.student_name}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-widest font-bold text-foreground/40 mb-1">Date Issued</p>
                                <p className="font-medium text-foreground">{formatDate(selectedInvoice.invoice_date)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-widest font-bold text-foreground/40 mb-1">Status</p>
                                <span className={`status-badge ${selectedInvoice.status === 'PAID' ? 'status-badge-success' :
                                    selectedInvoice.status === 'PARTIAL' ? 'status-badge-warning' :
                                        'status-badge-error'
                                    }`}>{selectedInvoice.status}</span>
                            </div>
                        </div>

                        {/* Breakdown Table */}
                        <div className="border border-border/40 rounded-2xl overflow-hidden bg-secondary/10">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-secondary/40">
                                        <th className="px-6 py-3 text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Category Item</th>
                                        <th className="px-6 py-3 text-right text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/10">
                                    {invoiceItems.map((item, index) => (
                                        <tr key={index} className="hover:bg-primary/5 transition-colors">
                                            <td className="px-6 py-4 text-sm text-foreground/80">{item.category_name}</td>
                                            <td className="px-6 py-4 text-sm font-mono text-foreground text-right">{formatCurrency(item.amount)}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-secondary/20 font-bold text-lg">
                                        <td className="px-6 py-6 text-foreground">Total Fee</td>
                                        <td className="px-6 py-6 text-foreground text-right">{formatCurrency(selectedInvoice.total_amount)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Payment Summary */}
                        <div className="flex justify-between items-center p-6 bg-gradient-to-br from-secondary/40 to-background border border-border/40 rounded-2xl shadow-inner">
                            <div>
                                <p className="text-[10px] uppercase tracking-widest font-bold text-foreground/40 mb-1">Total Paid</p>
                                <p className="text-2xl font-bold text-emerald-500">{formatCurrency(selectedInvoice.amount_paid)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-foreground/40 mb-1">Balance Due</p>
                                <p className="text-2xl font-bold text-amber-500">{formatCurrency(selectedInvoice.total_amount - selectedInvoice.amount_paid)}</p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 justify-end pt-4">
                            <button
                                onClick={() => window.print()}
                                className="btn btn-secondary flex items-center gap-2 group border-primary/20"
                            >
                                <Printer className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                                <span>Print Invoice</span>
                            </button>
                            <button
                                onClick={() => setSelectedInvoice(null)}
                                className="btn btn-primary"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    )
}
