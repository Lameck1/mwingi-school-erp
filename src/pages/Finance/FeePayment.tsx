import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAppStore } from '../../stores'
import { LedgerHistory } from './components/LedgerHistory'
import { PaymentEntryForm } from './components/PaymentEntryForm'
import { StudentLedgerSearch } from './components/StudentLedgerSearch'
import { type Payment } from '../../types/electron-api/FinanceAPI'
import { type Student } from '../../types/electron-api/StudentAPI'

export default function FeePayment() {
    const [searchParams] = useSearchParams()
    const { schoolSettings } = useAppStore()

    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
    const [payments, setPayments] = useState<Payment[]>([])

    useEffect(() => {
        const studentId = searchParams.get('student')
        if (studentId) {
            void loadStudent(parseInt(studentId))
        }
    }, [searchParams])

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

    const handleStudentSelect = (student: Student) => {
        void loadStudent(student.id)
    }

    const handlePaymentComplete = (newBalance: number) => {
        if (selectedStudent) {
            // Optimistic update
            setSelectedStudent({ ...selectedStudent, balance: newBalance })
            // Reload to get new payment in history
            void loadStudent(selectedStudent.id)
        }
    }

    return (
        <div className="space-y-8 pb-10">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold text-foreground font-heading">Fee Collection</h1>
                <p className="text-foreground/50 mt-1 font-medium italic">Record and validate student financial contributions</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Left Panel - Student Search & Profile (Span 2) */}
                <div className="lg:col-span-2 space-y-6">
                    <StudentLedgerSearch
                        onSelectStudent={handleStudentSelect}
                        selectedStudent={selectedStudent}
                    />
                </div>

                {/* Right Panel - Payment Form (Span 3) */}
                <div className="lg:col-span-3 space-y-8">
                    <PaymentEntryForm
                        selectedStudent={selectedStudent}
                        onPaymentComplete={handlePaymentComplete}
                        schoolSettings={schoolSettings}
                    />

                    {/* Transaction History Sub-Section */}
                    <LedgerHistory
                        payments={payments}
                        student={selectedStudent}
                        schoolSettings={schoolSettings}
                    />
                </div>
            </div>
        </div>
    )
}

