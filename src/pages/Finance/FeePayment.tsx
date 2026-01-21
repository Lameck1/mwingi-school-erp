import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore, useAppStore } from '../../stores'
import { Search, Check, Printer, Loader2 } from 'lucide-react'

export default function FeePayment() {
    const [searchParams] = useSearchParams()
    const { user } = useAuthStore()
    const { currentTerm, schoolSettings } = useAppStore()

    const [students, setStudents] = useState<any[]>([])
    const [selectedStudent, setSelectedStudent] = useState<any>(null)
    const [payments, setPayments] = useState<any[]>([])
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [success, setSuccess] = useState<any>(null)

    const [formData, setFormData] = useState({
        amount: '',
        payment_method: 'CASH',
        payment_reference: '',
        transaction_date: new Date().toISOString().slice(0, 10),
        description: '',
    })

    useEffect(() => {
        const studentId = searchParams.get('student')
        if (studentId) {
            loadStudent(parseInt(studentId))
        }
    }, [searchParams])

    const handleSearch = async () => {
        if (!search) return
        setLoading(true)
        try {
            const results = await window.electronAPI.getStudents({ search })
            setStudents(results)
        } catch (error) {
            console.error('Search failed:', error)
        } finally {
            setLoading(false)
        }
    }

    const loadStudent = async (studentId: number) => {
        try {
            const student = await window.electronAPI.getStudentById(studentId)
            const balance = await window.electronAPI.getStudentBalance(studentId)
            const studentPayments = await window.electronAPI.getPaymentsByStudent(studentId)
            setSelectedStudent({ ...student, balance })
            setPayments(studentPayments)
        } catch (error) {
            console.error('Failed to load student:', error)
        }
    }

    const selectStudent = (student: any) => {
        loadStudent(student.id)
        setStudents([])
        setSearch('')
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedStudent || !formData.amount) return

        setSaving(true)
        setSuccess(null)

        try {
            const amount = parseFloat(formData.amount)
            const result = await window.electronAPI.recordPayment({
                ...formData,
                amount,
                student_id: selectedStudent.id,
                term_id: currentTerm?.id,
            }, user!.id)

            setSuccess({
                ...result,
                amount,
                payment_method: formData.payment_method,
                payment_reference: formData.payment_reference,
                description: formData.description,
                date: formData.transaction_date
            })

            setFormData({
                amount: '', payment_method: 'CASH', payment_reference: '',
                transaction_date: new Date().toISOString().slice(0, 10), description: ''
            })
            loadStudent(selectedStudent.id)
        } catch (error: any) {
            alert(error.message || 'Payment failed')
        } finally {
            setSaving(false)
        }
    }

    const handlePrint = (paymentData: any = null) => {
        // If paymentData is provided (from history), use it. Otherwise use success state (new payment).
        // If passed from history (onclick), it might be a click event if not careful, so check type or explicitly pass null in JSX
        const dataToPrint = (paymentData && paymentData.amount) ? paymentData : success
        
        if (!dataToPrint || !selectedStudent) return

        // Normalize data structure since DB results might differ from local success state
        const receipt = {
            number: dataToPrint.receiptNumber || dataToPrint.receipt_number,
            date: dataToPrint.date || dataToPrint.transaction_date,
            amount: dataToPrint.amount,
            method: dataToPrint.payment_method,
            reference: dataToPrint.payment_reference,
            description: dataToPrint.description
        }

        const printWindow = window.open('', '_blank', 'width=800,height=600')
        if (!printWindow) return

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Receipt - ${receipt.number}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
                    .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
                    .header h1 { margin: 0; color: #1a365d; font-size: 24px; text-transform: uppercase; }
                    .header p { margin: 5px 0; color: #666; font-size: 14px; }
                    .receipt-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
                    .receipt-box { border: 1px solid #eee; padding: 15px; border-radius: 8px; width: 45%; }
                    .label { color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
                    .value { font-weight: 600; font-size: 16px; }
                    .amount-box { background: #f8fafc; text-align: center; padding: 20px; border-radius: 8px; margin: 30px 0; }
                    .amount-label { color: #64748b; font-size: 14px; margin-bottom: 5px; }
                    .amount-value { font-size: 32px; font-weight: bold; color: #0f172a; }
                    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                    .details-table th { text-align: left; color: #64748b; font-weight: 500; border-bottom: 1px solid #e2e8f0; padding: 10px 0; }
                    .details-table td { padding: 15px 0; border-bottom: 1px solid #f1f5f9; }
                    .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; }
                    @media print {
                        .no-print { display: none; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${schoolSettings?.school_name || 'MWINGI ADVENTIST SCHOOL'}</h1>
                    <p>${schoolSettings?.address || 'P.O Box 123, Mwingi'}</p>
                    <p>Tel: ${schoolSettings?.phone || 'N/A'} | Email: ${schoolSettings?.email || 'N/A'}</p>
                </div>

                <div class="receipt-info">
                    <div class="receipt-box">
                        <div class="label">Receipt No</div>
                        <div class="value">${receipt.number}</div>
                        <div class="label" style="margin-top: 10px;">Date</div>
                        <div class="value">${new Date(receipt.date).toLocaleDateString()}</div>
                    </div>
                    <div class="receipt-box">
                        <div class="label">Student</div>
                        <div class="value">${selectedStudent.first_name} ${selectedStudent.last_name}</div>
                        <div class="label" style="margin-top: 10px;">Admission No</div>
                        <div class="value">${selectedStudent.admission_number}</div>
                    </div>
                </div>

                <div class="amount-box">
                    <div class="amount-label">Amount Paid</div>
                    <div class="amount-value">${formatCurrency(receipt.amount)}</div>
                </div>

                <table class="details-table">
                    <thead>
                        <tr>
                            <th>Payment Method</th>
                            <th>Reference</th>
                            <th>Term</th>
                            <th>Balance Due</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${receipt.method}</td>
                            <td>${receipt.reference || '-'}</td>
                            <td>${currentTerm?.term_name || '-'}</td>
                            <td style="color: #ea580c; font-weight: bold;">
                                ${formatCurrency(selectedStudent.balance)} 
                            </td>
                        </tr>
                    </tbody>
                </table>
                
                <div style="margin-top: 20px;">
                    <div class="label">Description</div>
                    <p>${receipt.description || 'School Fees Payment'}</p>
                </div>

                <div class="footer">
                    <p>Served by: ${user?.full_name || 'System'}</p>
                    <p>Thank you for your payment!</p>
                    <p style="margin-top: 5px;">${new Date().toLocaleString()}</p>
                </div>
                
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `

        printWindow.document.write(html)
        printWindow.document.close()
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount)
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Fee Payment</h1>
                <p className="text-gray-500 mt-1">Record student fee payments</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Panel - Student Search */}
                <div className="card">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Search Student</h2>
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            aria-label="Search students"
                            placeholder="Search by name or admission no..." className="input pl-10" />
                    </div>

                    {loading && <p className="text-gray-500">Searching...</p>}

                    {students.length > 0 && (
                        <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                            {students.map((s) => (
                                <button key={s.id} onClick={() => selectStudent(s)}
                                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex justify-between">
                                    <div>
                                        <p className="font-medium">{s.first_name} {s.last_name}</p>
                                        <p className="text-sm text-gray-500">{s.admission_number}</p>
                                    </div>
                                    <span className="text-sm text-gray-500">{s.stream_name}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Selected Student Details */}
                    {selectedStudent && (
                        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                            <div className="flex items-start gap-4">
                                <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center text-white text-2xl font-bold">
                                    {selectedStudent.first_name?.charAt(0)}
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-lg">
                                        {selectedStudent.first_name} {selectedStudent.middle_name} {selectedStudent.last_name}
                                    </h3>
                                    <p className="text-sm text-gray-600">Adm: {selectedStudent.admission_number}</p>
                                    <p className="text-sm text-gray-600">{selectedStudent.student_type === 'BOARDER' ? 'Boarder' : 'Day Scholar'}</p>
                                    <div className="mt-2 text-lg font-semibold text-orange-600">
                                        Balance: {formatCurrency(selectedStudent.balance || 0)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Panel - Payment Form */}
                <div className="card">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h2>

                    {success && (
                        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center gap-2 text-green-700 mb-2">
                                <Check className="w-5 h-5" />
                                <span className="font-medium">Payment Recorded Successfully</span>
                            </div>
                            <p className="text-sm text-green-600">Receipt No: {success.receiptNumber}</p>
                            <button 
                                onClick={handlePrint}
                                className="mt-2 btn btn-secondary text-sm flex items-center gap-2"
                            >
                                <Printer className="w-4 h-4" />
                                Print Receipt
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="label">Amount (KES) *</label>
                            <input type="number" value={formData.amount}
                                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                className="input" required placeholder="0.00" min="1" disabled={!selectedStudent} 
                                aria-label="Payment Amount"
                            />
                        </div>
                        <div>
                            <label className="label" htmlFor="payment-method">Payment Method *</label>
                            <select id="payment-method" value={formData.payment_method}
                                onChange={(e) => setFormData(prev => ({ ...prev, payment_method: e.target.value }))}
                                className="input" disabled={!selectedStudent}>
                                <option value="CASH">Cash</option>
                                <option value="MPESA">MPESA</option>
                                <option value="BANK_TRANSFER">Bank Transfer</option>
                                <option value="CHEQUE">Cheque</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">Reference (MPESA Code, Cheque No, etc.)</label>
                            <input type="text" value={formData.payment_reference}
                                onChange={(e) => setFormData(prev => ({ ...prev, payment_reference: e.target.value }))}
                                className="input" disabled={!selectedStudent} placeholder="e.g., QK7X8YZ9AB" 
                                aria-label="Payment Reference"
                            />
                        </div>
                        <div>
                            <label className="label" htmlFor="transaction-date">Date *</label>
                            <input id="transaction-date" type="date" value={formData.transaction_date}
                                onChange={(e) => setFormData(prev => ({ ...prev, transaction_date: e.target.value }))}
                                className="input" required disabled={!selectedStudent} />
                        </div>
                        <div>
                            <label className="label">Description</label>
                            <textarea value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                className="input" rows={2} disabled={!selectedStudent} placeholder="Payment notes..." 
                                aria-label="Payment Description"
                            />
                        </div>

                        <button type="submit" disabled={saving || !selectedStudent}
                            className="w-full btn btn-success py-3 flex items-center justify-center gap-2">
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                            <span>{saving ? 'Processing...' : 'Record Payment'}</span>
                        </button>
                    </form>

                    {/* Recent Payments */}
                    {payments.length > 0 && (
                        <div className="mt-6">
                            <h3 className="font-medium text-gray-900 mb-3">Payment History</h3>
                            <div className="border rounded-lg divide-y text-sm max-h-96 overflow-y-auto">
                                {payments.map((p: any) => (
                                    <div key={p.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50">
                                        <div>
                                            <p className="font-medium">{formatCurrency(p.amount)}</p>
                                            <p className="text-gray-500">{p.payment_method} • {p.receipt_number}</p>
                                            <p className="text-xs text-gray-400">{new Date(p.transaction_date).toLocaleDateString()}</p>
                                        </div>
                                        <button 
                                            onClick={() => handlePrint(p)}
                                            className="btn btn-xs btn-ghost text-gray-500 hover:text-blue-600"
                                            title="Print Receipt"
                                            aria-label="Print Receipt"
                                        >
                                            <Printer className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
