import React, { lazy } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'

import { ErrorBoundary } from './components/ErrorBoundary'
import { OfflineIndicator } from './components/feedback/OfflineIndicator'
import { PrintPreviewHost } from './components/feedback/PrintPreviewHost'
import Layout from './components/Layout'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { GLAccountManagement } from './pages/Finance/Settings/GLAccountManagement'
import { OpeningBalanceImport } from './pages/Finance/Settings/OpeningBalanceImport'
import Login from './pages/Login'
import SetupAdmin from './pages/SetupAdmin'
import { useAuthStore } from './stores'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const AcademicsHub = lazy(() => import('./pages/Academic'))
const FinanceHub = lazy(() => import('./pages/Finance'))
const Students = lazy(() => import('./pages/Students'))
const StudentForm = lazy(() => import('./pages/Students/StudentForm'))
const FeePayment = lazy(() => import('./pages/Finance/FeePayment'))
const Invoices = lazy(() => import('./pages/Finance/Invoices'))
const Transactions = lazy(() => import('./pages/Finance/Transactions'))
const RecordExpense = lazy(() => import('./pages/Finance/RecordExpense'))
const RecordIncome = lazy(() => import('./pages/Finance/RecordIncome'))
const FinancialReports = lazy(() => import('./pages/Finance/FinancialReports'))
const FeeStructure = lazy(() => import('./pages/Finance/FeeStructure'))
const Staff = lazy(() => import('./pages/Payroll/Staff'))
const PayrollRun = lazy(() => import('./pages/Payroll/PayrollRun'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const Backup = lazy(() => import('./pages/Backup'))
const UsersPage = lazy(() => import('./pages/Users'))
const BudgetList = lazy(() => import('./pages/Finance/Budget'))
const CreateBudget = lazy(() => import('./pages/Finance/Budget/CreateBudget'))
const BudgetDetails = lazy(() => import('./pages/Finance/Budget/BudgetDetails'))
const BankAccounts = lazy(() => import('./pages/Finance/BankAccounts'))
const Approvals = lazy(() => import('./pages/Approvals'))
const Promotions = lazy(() => import('./pages/Students/Promotions'))
const AttendancePage = lazy(() => import('./pages/Attendance'))
const ReportCardsPage = lazy(() => import('./pages/Reports/ReportCards'))
const CommunicationLog = lazy(() => import('./pages/Communications/CommunicationLog'))
const CashFlow = lazy(() => import('./pages/Finance/CashFlow'))
const TeacherAllocation = lazy(() => import('./pages/Academic/TeacherAllocation'))
const SubjectManagement = lazy(() => import('./pages/Academic/SubjectManagement'))
const ExamManagement = lazy(() => import('./pages/Academic/ExamManagement'))
const MarksEntry = lazy(() => import('./pages/Academic/MarksEntry'))
const MeritLists = lazy(() => import('./pages/Academic/MeritLists'))
const ExamAnalytics = lazy(() => import('./pages/Academic/ExamAnalytics'))
const ReportCardAnalytics = lazy(() => import('./pages/Academic/ReportCardAnalytics'))
const SubjectMeritLists = lazy(() => import('./pages/Academic/SubjectMeritLists'))
const MostImproved = lazy(() => import('./pages/Academic/MostImproved'))
const AwardsManagement = lazy(() => import('./pages/Academic/AwardsManagement'))
const ExamScheduler = lazy(() => import('./pages/Academic/ExamScheduler'))
const ReportCardGeneration = lazy(() => import('./pages/Academic/ReportCardGeneration'))
const AssetHire = lazy(() => import('./pages/Finance/AssetHire'))
const FeeExemptions = lazy(() => import('./pages/Finance/FeeExemptions'))
const BoardingProfitability = lazy(() => import('./pages/Operations/Boarding/BoardingProfitability'))
const TransportRouteManagement = lazy(() => import('./pages/Operations/Transport/TransportRouteManagement'))
const StudentCostAnalysis = lazy(() => import('./pages/Finance/StudentCost/StudentCostAnalysis'))
const GrantTracking = lazy(() => import('./pages/Finance/Grants/GrantTracking'))
const ReconcileAccount = lazy(() => import('./pages/Finance/Reconciliation/ReconcileAccount'))
const ApprovalQueue = lazy(() => import('./pages/Finance/Approvals/ApprovalQueue'))
const AssetRegister = lazy(() => import('./pages/Finance/FixedAssets/AssetRegister'))
const Depreciation = lazy(() => import('./pages/Finance/FixedAssets/Depreciation'))
const BalanceSheet = lazy(() => import('./pages/Finance/Reports/BalanceSheet'))
const ProfitAndLoss = lazy(() => import('./pages/Finance/Reports/ProfitAndLoss'))
const TrialBalance = lazy(() => import('./pages/Finance/Reports/TrialBalance'))
const CBCStrandManagement = lazy(() => import('./pages/Finance/CBC/CBCStrandManagement'))
const JSSTransition = lazy(() => import('./pages/Finance/CBC/JSSTransition'))
const Integrations = lazy(() => import('./pages/Settings/Integrations'))
const MessageTemplates = lazy(() => import('./pages/Settings/MessageTemplates'))

function PrivateRoute({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const checkSession = useAuthStore((state) => state.checkSession)
    const touchSession = useAuthStore((state) => state.touchSession)
    const isSessionLoaded = useAuthStore((state) => state.isSessionLoaded)

    React.useEffect(() => {
        if (!isSessionLoaded) {return}
        if (!isAuthenticated) {return}
        const valid = checkSession()
        if (valid) {touchSession()}
    }, [isSessionLoaded, isAuthenticated, checkSession, touchSession])

    if (!isSessionLoaded) {
        return null
    }

    return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

function AppRoutes() {
    return (
        <HashRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/setup" element={<SetupAdmin />} />
                    <Route path="/" element={
                        <PrivateRoute>
                            <Layout />
                        </PrivateRoute>
                    }>
                        <Route index element={<Dashboard />} />
                        <Route path="academics" element={<AcademicsHub />} />
                        <Route path="finance" element={<FinanceHub />} />
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
                        <Route path="academic/subjects" element={<SubjectManagement />} />
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
                        <Route path="academic/cbc-strands" element={<CBCStrandManagement />} />
                        <Route path="academic/jss-transition" element={<JSSTransition />} />
                        <Route path="operations/boarding" element={<BoardingProfitability />} />
                        <Route path="operations/transport" element={<TransportRouteManagement />} />
                        <Route path="settings/integrations" element={<Integrations />} />
                        <Route path="settings/message-templates" element={<MessageTemplates />} />
                    </Route>
                </Routes>
        </HashRouter>
    )
}

export default function App() {
    const hydrateSession = useAuthStore((state) => state.hydrateSession)

    React.useEffect(() => {
        hydrateSession().catch((err: unknown) => console.error('Session hydration failed:', err))
    }, [hydrateSession])

    return (
        <ErrorBoundary>
        <ThemeProvider>
            <ToastProvider>
                <OfflineIndicator />
                <PrintPreviewHost />
                <AppRoutes />
            </ToastProvider>
        </ThemeProvider>
        </ErrorBoundary>
    )
}
