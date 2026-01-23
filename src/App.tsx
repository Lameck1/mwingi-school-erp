import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import StudentForm from './pages/Students/StudentForm'
import FeePayment from './pages/Finance/FeePayment'
import Invoices from './pages/Finance/Invoices'
import Transactions from './pages/Finance/Transactions'
import RecordExpense from './pages/Finance/RecordExpense'
import RecordIncome from './pages/Finance/RecordIncome'
import FinancialReports from './pages/Finance/FinancialReports'
import FeeStructure from './pages/Finance/FeeStructure'
import Staff from './pages/Payroll/Staff'
import PayrollRun from './pages/Payroll/PayrollRun'
import Inventory from './pages/Inventory'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import AuditLog from './pages/AuditLog'
import Backup from './pages/Backup'
import UsersPage from './pages/Users'

import { ToastProvider } from './contexts/ToastContext'

function PrivateRoute({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

export default function App() {
    return (
        <ToastProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/" element={
                        <PrivateRoute>
                            <Layout />
                        </PrivateRoute>
                    }>
                        <Route index element={<Dashboard />} />
                        <Route path="students" element={<Students />} />
                        <Route path="students/new" element={<StudentForm />} />
                        <Route path="students/:id/edit" element={<StudentForm />} />
                        <Route path="fee-payment" element={<FeePayment />} />
                        <Route path="invoices" element={<Invoices />} />
                        <Route path="transactions" element={<Transactions />} />
                        <Route path="record-expense" element={<RecordExpense />} />
                        <Route path="record-income" element={<RecordIncome />} />
                        <Route path="financial-reports" element={<FinancialReports />} />
                        <Route path="fee-structure" element={<FeeStructure />} />
                        <Route path="staff" element={<Staff />} />
                        <Route path="payroll-run" element={<PayrollRun />} />
                        <Route path="inventory" element={<Inventory />} />
                        <Route path="reports" element={<Reports />} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="audit-log" element={<AuditLog />} />
                        <Route path="backup" element={<Backup />} />
                        <Route path="users" element={<UsersPage />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </ToastProvider>
    )
}