import { useEffect, useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Invoice, InvoiceItem } from '../../types/electron-api/FinanceAPI'
import { useToast } from '../../contexts/ToastContext'

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

    const formatCurrency = (amount: number) => {
        const displayAmount = amount / 100
        return new Intl.NumberFormat('en-KE', {
            style: 'currency',
            currency: 'KES',
            minimumFractionDigits: 0
        }).format(displayAmount)
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
                    <p className="text-gray-500 mt-1">Manage student fee invoices</p>
                </div>
                <button
                    onClick={() => navigate('/finance/fee-structure')}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    <span>Generate Invoices</span>
                </button>
            </div>

            <div className="card">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : invoices.length === 0 ? (
                    <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Invoices Yet</h3>
                        <p className="text-gray-500 mb-4">Generate invoices for students to track fee balances</p>
                        <button
                            onClick={() => navigate('/finance/fee-structure')}
                            className="btn btn-primary"
                        >
                            Generate Term Invoices
                        </button>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Invoice No</th>
                                <th>Student</th>
                                <th>Term</th>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Paid</th>
                                <th>Balance</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map((inv) => (
                                <tr key={inv.id}>
                                    <td>{inv.invoice_number}</td>
                                    <td>{inv.student_name}</td>
                                    <td>{inv.term_name}</td>
                                    <td>{new Date(inv.invoice_date).toLocaleDateString()}</td>
                                    <td>{formatCurrency(inv.total_amount)}</td>
                                    <td>{formatCurrency(inv.amount_paid)}</td>
                                    <td className="text-orange-600 font-medium">{formatCurrency(inv.total_amount - inv.amount_paid)}</td>
                                    <td>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${inv.status === 'PAID' ? 'bg-green-100 text-green-700' :
                                            inv.status === 'PARTIAL' ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-red-100 text-red-700'
                                            }`}>{inv.status}</span>
                                    </td>
                                    <td>
                                        <button
                                            onClick={() => viewInvoice(inv)}
                                            className="text-blue-600 text-sm hover:underline"
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* View Invoice Modal */}
            {selectedInvoice && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200 flex justify-between items-start">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Invoice Details</h2>
                                <p className="text-sm text-gray-500">{selectedInvoice.invoice_number}</p>
                            </div>
                            <button
                                onClick={() => setSelectedInvoice(null)}
                                className="text-gray-400 hover:text-gray-500 text-2xl"
                                aria-label="Close"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-gray-500">Student</p>
                                    <p className="font-medium text-gray-900">{selectedInvoice.student_name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Term</p>
                                    <p className="font-medium text-gray-900">{selectedInvoice.term_name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Date</p>
                                    <p className="font-medium text-gray-900">{new Date(selectedInvoice.invoice_date).toLocaleDateString()}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Status</p>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${selectedInvoice.status === 'PAID' ? 'bg-green-100 text-green-700' :
                                        selectedInvoice.status === 'PARTIAL' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>{selectedInvoice.status}</span>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-semibold text-gray-900 mb-3">Fee Breakdown</h3>
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {invoiceItems.map((item, index) => (
                                                <tr key={index}>
                                                    <td className="px-4 py-3 text-sm text-gray-900">{item.category_name}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(item.amount)}</td>
                                                </tr>
                                            ))}
                                            <tr className="bg-gray-50 font-bold">
                                                <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                                                <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(selectedInvoice.total_amount)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                                <div>
                                    <p className="text-sm text-gray-500">Amount Paid</p>
                                    <p className="text-lg font-bold text-green-600">{formatCurrency(selectedInvoice.amount_paid)}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 text-right">Balance Due</p>
                                    <p className="text-lg font-bold text-orange-600">{formatCurrency(selectedInvoice.total_amount - selectedInvoice.amount_paid)}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end">
                            <button
                                onClick={() => setSelectedInvoice(null)}
                                className="btn btn-secondary"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
