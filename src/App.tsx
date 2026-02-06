import React from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import BudgetList from './pages/Finance/Budget'
import CreateBudget from './pages/Finance/Budget/CreateBudget'
import BudgetDetails from './pages/Finance/Budget/BudgetDetails'
import BankAccounts from './pages/Finance/BankAccounts'
import Approvals from './pages/Approvals'
import Promotions from './pages/Students/Promotions'
import AttendancePage from './pages/Attendance'
import ReportCardsPage from './pages/Reports/ReportCards'
import CommunicationLog from './pages/Communications/CommunicationLog'
import ScheduledReports from './pages/Reports/ScheduledReports'
import CashFlow from './pages/Finance/CashFlow'
import TeacherAllocation from './pages/Academic/TeacherAllocation'
import ExamManagement from './pages/Academic/ExamManagement'
import MarksEntry from './pages/Academic/MarksEntry'
import MeritLists from './pages/Academic/MeritLists'
import ExamAnalytics from './pages/Academic/ExamAnalytics'
import ReportCardAnalytics from './pages/Academic/ReportCardAnalytics'
import SubjectMeritLists from './pages/Academic/SubjectMeritLists'
import MostImproved from './pages/Academic/MostImproved'
import AwardsManagement from './pages/Academic/AwardsManagement'
import ExamScheduler from './pages/Academic/ExamScheduler'
import ReportCardGeneration from './pages/Academic/ReportCardGeneration'
import AssetHire from './pages/Finance/AssetHire'
import FeeExemptions from './pages/Finance/FeeExemptions'
import { GLAccountManagement } from './pages/Finance/Settings/GLAccountManagement'
import { OpeningBalanceImport } from './pages/Finance/Settings/OpeningBalanceImport'
import BoardingProfitability from './pages/Operations/Boarding/BoardingProfitability'
import TransportRouteManagement from './pages/Operations/Transport/TransportRouteManagement'
import StudentCostAnalysis from './pages/Finance/StudentCost/StudentCostAnalysis'
import GrantTracking from './pages/Finance/Grants/GrantTracking'
import ReconcileAccount from './pages/Finance/Reconciliation/ReconcileAccount'
import ApprovalQueue from './pages/Finance/Approvals/ApprovalQueue'
import AssetRegister from './pages/Finance/FixedAssets/AssetRegister'
import Depreciation from './pages/Finance/FixedAssets/Depreciation'
import BalanceSheet from './pages/Finance/Reports/BalanceSheet'
import ProfitAndLoss from './pages/Finance/Reports/ProfitAndLoss'
import TrialBalance from './pages/Finance/Reports/TrialBalance'
import CBCStrandManagement from './pages/Finance/CBC/CBCStrandManagement'
import JSSTransition from './pages/Finance/CBC/JSSTransition'
import Integrations from './pages/Settings/Integrations'
import MessageTemplates from './pages/Settings/MessageTemplates'
import { OfflineIndicator } from './components/feedback/OfflineIndicator'

import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ErrorBoundary } from './components/ErrorBoundary'

function PrivateRoute({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const checkSession = useAuthStore((state) => state.checkSession)
    const touchSession = useAuthStore((state) => state.touchSession)

    // Check session validity on every route render
    const sessionValid = isAuthenticated && checkSession()

    // Touch session on navigation (keep-alive)
    React.useEffect(() => {
        if (sessionValid) touchSession()
    })

    return sessionValid ? <>{children}</> : <Navigate to="/login" />
}

export default function App() {
    return (
        <ErrorBoundary>
        <ThemeProvider>
            <ToastProvider>
                <OfflineIndicator />
                <HashRouter>
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
                            <Route path="students/:id" element={<StudentForm />} />
                            <Route path="students/:id/edit" element={<StudentForm />} />
                            <Route path="students/promotions" element={<Promotions />} />
                            <Route path="attendance" element={<AttendancePage />} />
                            <Route path="report-cards" element={<ReportCardsPage />} />
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
                            <Route path="reports/scheduled" element={<ScheduledReports />} />
                            <Route path="settings" element={<Settings />} />
                            <Route path="audit-log" element={<AuditLog />} />
                            <Route path="communications" element={<CommunicationLog />} />
                            <Route path="backup" element={<Backup />} />
                            <Route path="users" element={<UsersPage />} />
                            <Route path="budget" element={<BudgetList />} />
                            <Route path="budget/new" element={<CreateBudget />} />
                            <Route path="budget/:id" element={<BudgetDetails />} />
                            <Route path="cash-flow" element={<CashFlow />} />
                            <Route path="bank-accounts" element={<BankAccounts />} />
                            <Route path="approvals" element={<Approvals />} />
                            <Route path="academic/allocations" element={<TeacherAllocation />} />
                            <Route path="academic/exams" element={<ExamManagement />} />
                            <Route path="academic/marks-entry" element={<MarksEntry />} />
                            <Route path="academic/merit-lists" element={<MeritLists />} />
                            <Route path="academic/analytics/exams" element={<ExamAnalytics />} />
                            <Route path="academic/analytics/report-cards" element={<ReportCardAnalytics />} />
                            <Route path="academic/analytics/subject-merit-list" element={<SubjectMeritLists />} />
                            <Route path="academic/analytics/most-improved" element={<MostImproved />} />
                            <Route path="academic/awards" element={<AwardsManagement />} />
                            <Route path="academic/schedule" element={<ExamScheduler />} />
                            <Route path="asset-hire" element={<AssetHire />} />
                            <Route path="fee-exemptions" element={<FeeExemptions />} />
                            {/* Orphaned pages now routed (audit fix) */}
                            <Route path="academic/report-card-generation" element={<ReportCardGeneration />} />
                            <Route path="finance/gl-accounts" element={<GLAccountManagement />} />
                            <Route path="finance/opening-balances" element={<OpeningBalanceImport />} />
                            <Route path="finance/balance-sheet" element={<BalanceSheet />} />
                            <Route path="finance/profit-and-loss" element={<ProfitAndLoss />} />
                            <Route path="finance/trial-balance" element={<TrialBalance />} />
                            <Route path="finance/fixed-assets" element={<AssetRegister />} />
                            <Route path="finance/depreciation" element={<Depreciation />} />
                            <Route path="finance/reconciliation" element={<ReconcileAccount />} />
                            <Route path="finance/transaction-approvals" element={<ApprovalQueue />} />
                            <Route path="finance/grants" element={<GrantTracking />} />
                            <Route path="finance/student-cost" element={<StudentCostAnalysis />} />
                            <Route path="finance/cbc-strands" element={<CBCStrandManagement />} />
                            <Route path="finance/jss-transition" element={<JSSTransition />} />
                            <Route path="operations/boarding" element={<BoardingProfitability />} />
                            <Route path="operations/transport" element={<TransportRouteManagement />} />
                            <Route path="settings/integrations" element={<Integrations />} />
                            <Route path="settings/message-templates" element={<MessageTemplates />} />
                        </Route>
                    </Routes>
                </HashRouter>
            </ToastProvider>
        </ThemeProvider>
        </ErrorBoundary>
    )
}