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
import Staff from './pages/Payroll/Staff'
import PayrollRun from './pages/Payroll/PayrollRun'
import Inventory from './pages/Inventory'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import AuditLog from './pages/AuditLog'
import Backup from './pages/Backup'
import UsersPage from './pages/Users'

function PrivateRoute({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                    path="/*"
                    element={
                        <PrivateRoute>
                            <Layout>
                                <Routes>
                                    <Route path="/" element={<Dashboard />} />
                                    <Route path="/students" element={<Students />} />
                                    <Route path="/students/new" element={<StudentForm />} />
                                    <Route path="/students/:id" element={<StudentForm />} />
                                    <Route path="/finance/payments" element={<FeePayment />} />
                                    <Route path="/finance/invoices" element={<Invoices />} />
                                    <Route path="/finance/transactions" element={<Transactions />} />
                                    <Route path="/payroll/staff" element={<Staff />} />
                                    <Route path="/payroll/run" element={<PayrollRun />} />
                                    <Route path="/inventory" element={<Inventory />} />
                                    <Route path="/reports" element={<Reports />} />
                                    <Route path="/settings" element={<Settings />} />
                                    <Route path="/audit-log" element={<AuditLog />} />
                                    <Route path="/users" element={<UsersPage />} />
                                    <Route path="/backup" element={<Backup />} />
                                </Routes>
                            </Layout>
                        </PrivateRoute>
                    }
                />
            </Routes>
        </BrowserRouter>
    )
}
