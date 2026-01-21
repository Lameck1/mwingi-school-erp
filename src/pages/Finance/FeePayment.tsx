import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore, useAppStore } from '../../stores'
import { Search, Check, Printer, Loader2 } from 'lucide-react'

export default function FeePayment() {
    const [searchParams] = useSearchParams()
    const { user } = useAuthStore()
    const { currentTerm } = useAppStore()

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
            const result = await window.electronAPI.recordPayment({
                ...formData,
                amount: parseFloat(formData.amount),
                student_id: selectedStudent.id,
                term_id: currentTerm?.id,
            }, user!.id)

            setSuccess(result)
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
                            <button className="mt-2 btn btn-secondary text-sm flex items-center gap-2">
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
                                className="input" required placeholder="0.00" min="1" disabled={!selectedStudent} />
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
                                className="input" disabled={!selectedStudent} placeholder="e.g., QK7X8YZ9AB" />
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
                                className="input" rows={2} disabled={!selectedStudent} placeholder="Payment notes..." />
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
                            <h3 className="font-medium text-gray-900 mb-3">Recent Payments</h3>
                            <div className="border rounded-lg divide-y text-sm">
                                {payments.slice(0, 5).map((p: any) => (
                                    <div key={p.id} className="px-4 py-3 flex justify-between">
                                        <div>
                                            <p className="font-medium">{formatCurrency(p.amount)}</p>
                                            <p className="text-gray-500">{p.payment_method} • {p.receipt_number}</p>
                                        </div>
                                        <span className="text-gray-500">{new Date(p.transaction_date).toLocaleDateString()}</span>
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
