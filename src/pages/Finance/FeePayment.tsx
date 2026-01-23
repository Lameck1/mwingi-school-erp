import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore, useAppStore } from '../../stores'
import { Search, Check, Printer, Loader2, MessageSquare, Users, CreditCard } from 'lucide-react'
import { Student } from '../../types/electron-api/StudentAPI'
import { Payment } from '../../types/electron-api/FinanceAPI'
import { printDocument } from '../../utils/print'
import { useToast } from '../../contexts/ToastContext'
import { formatCurrency, formatDate } from '../../utils/format'

interface PaymentSuccess {
    success: boolean
    transactionRef: string
    receiptNumber: string
    amount: number
    payment_method: string
    payment_reference: string
    description: string
    date: string
    receipt_number?: string // For compatibility if passed from history
}

export default function FeePayment() {
    const [searchParams] = useSearchParams()
    const { user } = useAuthStore()
    const { schoolSettings } = useAppStore()
    const { showToast } = useToast()

    const [students, setStudents] = useState<Student[]>([])
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
    const [payments, setPayments] = useState<Payment[]>([])
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [sendingSms, setSendingSms] = useState(false)
    const [success, setSuccess] = useState<PaymentSuccess | null>(null)

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

    const selectStudent = (student: Student) => {
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
            const amount = Math.round(parseFloat(formData.amount) * 100)
            const result = await window.electronAPI.recordPayment({
                ...formData,
                amount,
                invoice_id: selectedStudent.id, // Assuming this maps to invoice_id
                transaction_ref: formData.payment_reference,
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
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Payment failed'
            showToast(errorMessage, 'error')
        } finally {
            setSaving(false)
        }
    }

    const handlePrint = (paymentData: Payment | PaymentSuccess | null = null) => {
        // If paymentData is provided (from history), use it. Otherwise use success state (new payment).
        // If passed from history (onclick), it might be a click event if not careful, so check type or explicitly pass null in JSX
        const dataToPrint = (paymentData && 'amount' in paymentData) ? paymentData : success

        if (!dataToPrint || !selectedStudent) return

        // Normalize data structure since DB results might differ from local success state
        // Helper to check if it's PaymentSuccess (has receiptNumber)
        const isSuccess = 'receiptNumber' in dataToPrint;
        const receiptNo = isSuccess ? (dataToPrint as PaymentSuccess).receiptNumber : (dataToPrint as Payment).receipt_number;
        const date = 'date' in dataToPrint ? (dataToPrint as PaymentSuccess).date : (dataToPrint as Payment).created_at;
        const ref = 'payment_reference' in dataToPrint ? (dataToPrint as PaymentSuccess).payment_reference : (dataToPrint as Payment).transaction_ref;

        const receipt = {
            receiptNumber: receiptNo,
            date,
            amount: dataToPrint.amount,
            paymentMethod: dataToPrint.payment_method,
            reference: ref,
            description: 'description' in dataToPrint ? dataToPrint.description : '',
            studentName: `${selectedStudent.first_name} ${selectedStudent.last_name}`,
            admissionNumber: selectedStudent.admission_number,
            balance: selectedStudent.balance
        }

        printDocument({
            title: `Receipt - ${receipt.receiptNumber}`,
            template: 'receipt',
            data: receipt,
            schoolSettings
        })
    }

    const handleSendSms = async () => {
        if (!success || !selectedStudent || !selectedStudent.guardian_phone) {
            alert('Guardian phone number missing')
            return
        }

        setSendingSms(true)
        try {
            const message = `Payment Received: ${selectedStudent.first_name} ${selectedStudent.last_name}. Amount: KES ${success.amount}. Receipt: ${success.receiptNumber}. Bal: KES ${selectedStudent.balance}. Thank you.`

            const result = await (window.electronAPI as any).sendSMS({
                to: selectedStudent.guardian_phone,
                message,
                recipientId: selectedStudent.id,
                recipientType: 'STUDENT',
                userId: user!.id
            })

            if (result.success) {
                alert('SMS receipt sent successfully!')
            } else {
                alert('Failed to send SMS: ' + result.error)
            }
        } catch (error) {
            alert('Error sending SMS')
        } finally {
            setSendingSms(false)
        }
    }



    return (
        <div className="space-y-8 pb-10">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold text-white font-heading">Fee Collection</h1>
                <p className="text-foreground/50 mt-1 font-medium italic">Record and validate student financial contributions</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Left Panel - Student Search & Profile (Span 2) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="card h-fit">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                <Search className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold text-white">Student Locator</h2>
                        </div>

                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search by name or admission..."
                                className="input pl-11 py-3 bg-secondary/30"
                            />
                        </div>

                        {loading && (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                            </div>
                        )}

                        {students.length > 0 && (
                            <div className="space-y-2 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
                                {students.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => selectStudent(s)}
                                        className="w-full p-4 text-left bg-secondary/20 hover:bg-primary/10 border border-border/40 rounded-xl transition-all group flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-sm">
                                                {s.first_name?.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-white group-hover:text-primary transition-colors">{s.first_name} {s.last_name}</p>
                                                <p className="text-[11px] text-foreground/40 font-mono tracking-wider uppercase">{s.admission_number}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-bold text-foreground/60">{s.stream_name}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Selected Student Profile */}
                        {selectedStudent && (
                            <div className="mt-8 p-6 bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Users className="w-20 h-20" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-5 mb-6">
                                        <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary/30">
                                            {selectedStudent.first_name?.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-xl text-white">
                                                {selectedStudent.first_name} {selectedStudent.last_name}
                                            </h3>
                                            <p className="text-xs text-primary font-bold uppercase tracking-widest">{selectedStudent.student_type}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                                            <p className="text-[10px] text-foreground/40 font-bold uppercase mb-1">Fee Balance</p>
                                            <p className="text-lg font-bold text-amber-400">{formatCurrency(selectedStudent.balance || 0)}</p>
                                        </div>
                                        <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                                            <p className="text-[10px] text-foreground/40 font-bold uppercase mb-1">Adm No</p>
                                            <p className="text-lg font-bold text-white">{selectedStudent.admission_number}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - Payment Form (Span 3) */}
                <div className="lg:col-span-3 space-y-8">
                    <div className="card min-h-[500px]">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                    <CreditCard className="w-5 h-5" />
                                </div>
                                <h2 className="text-lg font-bold text-white">Transaction Details</h2>
                            </div>
                            {selectedStudent && <div className="text-[10px] bg-primary/20 text-primary px-3 py-1 rounded-full font-bold uppercase tracking-tighter">SECURE CHANNEL ACTIVE</div>}
                        </div>

                        {success && (
                            <div className="mb-8 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl animate-slide-up">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3 text-emerald-400 mb-4">
                                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                            <Check className="w-5 h-5" />
                                        </div>
                                        <span className="font-bold text-lg">Transaction Confirmed</span>
                                    </div>
                                    <p className="text-xs font-mono text-emerald-400/60 uppercase tracking-widest">#{success.receiptNumber}</p>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={() => handlePrint(success)}
                                        className="btn btn-secondary flex items-center gap-2 py-2 px-6 text-sm"
                                    >
                                        <Printer className="w-4 h-4" />
                                        Print Official Receipt
                                    </button>
                                    <button
                                        onClick={handleSendSms}
                                        disabled={sendingSms}
                                        className="btn btn-primary flex items-center gap-2 py-2 px-6 text-sm"
                                    >
                                        {sendingSms ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                                        Dispatch SMS Confirmation
                                    </button>
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="label">Amount Payable (KES)</label>
                                    <div className="relative">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40 font-bold">KSh</div>
                                        <input
                                            type="number"
                                            value={formData.amount}
                                            onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                            className="input pl-14 text-xl font-bold bg-secondary/30 border-white/5 focus:border-primary/50"
                                            required
                                            placeholder="0.00"
                                            min="1"
                                            disabled={!selectedStudent}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="label">Value Date</label>
                                    <input
                                        type="date"
                                        value={formData.transaction_date}
                                        onChange={(e) => setFormData(prev => ({ ...prev, transaction_date: e.target.value }))}
                                        className="input bg-secondary/30 border-white/5"
                                        required
                                        disabled={!selectedStudent}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="label">Payment Instrument</label>
                                    <select
                                        value={formData.payment_method}
                                        onChange={(e) => setFormData(prev => ({ ...prev, payment_method: e.target.value }))}
                                        className="input bg-secondary/30 border-white/5"
                                        disabled={!selectedStudent}
                                    >
                                        <option value="CASH">Liquid Cash</option>
                                        <option value="MPESA">M-PESA / Mobile Money</option>
                                        <option value="BANK_TRANSFER">Direct EFT/Transfer</option>
                                        <option value="CHEQUE">Banker's Cheque</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="label">Reference / Slip Number</label>
                                    <input
                                        type="text"
                                        value={formData.payment_reference}
                                        onChange={(e) => setFormData(prev => ({ ...prev, payment_reference: e.target.value }))}
                                        className="input bg-secondary/30 border-white/5"
                                        disabled={!selectedStudent}
                                        placeholder="e.g., M-PESA Code"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="label">Transaction Narrative</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    className="input bg-secondary/30 border-white/5 min-h-[100px]"
                                    rows={3}
                                    disabled={!selectedStudent}
                                    placeholder="Optional notes for this payment..."
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={saving || !selectedStudent}
                                className="w-full btn btn-primary py-5 rounded-2xl flex items-center justify-center gap-3 text-lg font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1 active:scale-95 disabled:hover:translate-y-0"
                            >
                                {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6" />}
                                <span>{saving ? 'Processing Ledger...' : 'Finalize Payment'}</span>
                            </button>
                        </form>
                    </div>

                    {/* Transaction History Sub-Section */}
                    {payments.length > 0 && (
                        <div className="card animate-slide-up">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-lg font-bold text-white">Recent Ledger Entries</h3>
                                <div className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Showing last {payments.length} items</div>
                            </div>

                            <div className="space-y-3">
                                {payments.map((p) => (
                                    <div key={p.id} className="p-4 bg-secondary/20 hover:bg-slate-700/30 border border-white/5 rounded-2xl flex justify-between items-center transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                                <Printer className="w-5 h-5 opacity-40 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-white">{formatCurrency(p.amount)}</p>
                                                <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-tighter">{p.payment_method} • {p.receipt_number}</p>
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-4">
                                            <div className="hidden sm:block">
                                                <p className="text-xs font-medium text-foreground/60">{formatDate(p.created_at)}</p>
                                                <p className="text-[10px] text-foreground/40 italic">Ledger Posted</p>
                                            </div>
                                            <button
                                                onClick={() => handlePrint(p)}
                                                className="p-2 hover:bg-primary/20 rounded-lg text-foreground/40 hover:text-primary transition-all"
                                                title="Re-print Receipt"
                                            >
                                                <Printer className="w-5 h-5" />
                                            </button>
                                        </div>
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
