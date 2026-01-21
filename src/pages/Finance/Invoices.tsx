import { useEffect, useState } from 'react'
import { FileText, Plus } from 'lucide-react'

export default function Invoices() {
    const [invoices, _setInvoices] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // TODO: Load all invoices
        setLoading(false)
    }, [])

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount)
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
                    <p className="text-gray-500 mt-1">Manage student fee invoices</p>
                </div>
                <button className="btn btn-primary flex items-center gap-2">
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
                        <button className="btn btn-primary">Generate Term Invoices</button>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Invoice No</th>
                                <th>Student</th>
                                <th>Term</th>
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
                                        <button className="text-blue-600 text-sm hover:underline">View</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
