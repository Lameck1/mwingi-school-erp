import {
    Download, FileText, Users, TrendingUp,
    Calendar, AlertCircle, Clock, Search, Loader2
} from 'lucide-react'
import { lazy, Suspense } from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'

import { DailyCollectionTab } from './DailyCollectionTab'
import { DefaultersTab } from './DefaultersTab'
import { FeeCollectionTab } from './FeeCollectionTab'
import { FinancialSummaryTab } from './FinancialSummaryTab'
import { StudentStatsTab } from './StudentStatsTab'
import { type TabDef } from './types'
import { useReportsData } from './useReportsData'
import { useReportsExport } from './useReportsExport'

const ScheduledReports = lazy(() => import('./ScheduledReports'))

const TABS: TabDef[] = [
    { id: 'fee-collection', label: 'Fee Collection', icon: TrendingUp },
    { id: 'daily-collection', label: 'Daily Collection', icon: Calendar },
    { id: 'defaulters', label: 'Fee Defaulters', icon: AlertCircle },
    { id: 'students', label: 'Student Stats', icon: Users },
    { id: 'financial', label: 'Financial Summary', icon: FileText },
    { id: 'scheduled', label: 'Scheduled', icon: Clock },
]

export default function Reports() {
    const d = useReportsData()
    const { handleExportPDF, handleExportCSV } = useReportsExport(d)

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Institutional Reports"
                subtitle="Comprehensive academic and fiscal diagnostics"
                actions={
                    <div className="flex items-center gap-3">
                        <button onClick={handleExportCSV} className="btn btn-secondary flex items-center gap-2 px-6">
                            <Download className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">CSV</span>
                        </button>
                        <button onClick={handleExportPDF} className="btn btn-primary flex items-center gap-2 px-6 shadow-xl shadow-primary/20">
                            <Download className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">PDF</span>
                        </button>
                    </div>
                }
            />

            {/* Tabs */}
            <nav ref={d.navRef} className="flex gap-4 border-b border-border/20 overflow-x-auto whitespace-nowrap pb-1 scroll-smooth">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        data-tab={tab.id}
                        onClick={() => d.handleTabClick(tab.id)}
                        className={`pb-4 px-2 text-sm font-bold uppercase tracking-widest transition-all relative ${d.activeTab === tab.id ? 'text-primary' : 'text-foreground/40 hover:text-foreground/60'}`}
                    >
                        <div className="flex items-center gap-2">
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </div>
                        {d.activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full shadow-[0_-4px_10px_rgba(var(--primary-rgb),0.5)]" />}
                    </button>
                ))}
            </nav>

            {/* Date Range Filter */}
            <div className="premium-card bg-secondary/5 border-secondary/20">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label htmlFor="period-start" className="text-[10px] font-bold uppercase text-foreground/40 tracking-widest ml-1">Period From</label>
                            <input
                                id="period-start"
                                type="date"
                                value={d.dateRange.start}
                                onChange={(e) => d.setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                                className="input w-full h-12 text-xs font-bold uppercase tracking-tight"
                            />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="period-end" className="text-[10px] font-bold uppercase text-foreground/40 tracking-widest ml-1">Period To</label>
                            <input
                                id="period-end"
                                type="date"
                                value={d.dateRange.end}
                                onChange={(e) => d.setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                                className="input w-full h-12 text-xs font-bold uppercase tracking-tight"
                            />
                        </div>
                    </div>
                    <button
                        onClick={d.loadReportData}
                        disabled={d.loading}
                        className="btn btn-primary h-12 px-8 flex items-center gap-2 text-xs font-bold uppercase tracking-widest shadow-xl shadow-primary/10 disabled:opacity-50"
                    >
                        {d.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Refresh Intelligence
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            {d.activeTab === 'fee-collection' && (
                <FeeCollectionTab feeCollectionData={d.feeCollectionData} paymentMethodData={d.paymentMethodData} />
            )}
            {d.activeTab === 'daily-collection' && (
                <DailyCollectionTab dailyCollections={d.dailyCollections} selectedDate={d.selectedDate} onDateChange={d.setSelectedDate} />
            )}
            {d.activeTab === 'defaulters' && (
                <DefaultersTab defaulters={d.defaulters} sendingBulk={d.sendingBulk} onSendReminder={d.handleSendReminder} onBulkReminders={d.handleBulkReminders} />
            )}
            {d.activeTab === 'students' && <StudentStatsTab studentStats={d.studentStats} />}
            {d.activeTab === 'financial' && <FinancialSummaryTab financialSummary={d.financialSummary} />}
            {d.activeTab === 'scheduled' && (
                <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-8 w-48 bg-secondary/50 rounded-lg" /><div className="h-64 bg-secondary/20 rounded-xl" /></div>}>
                    <ScheduledReports embedded />
                </Suspense>
            )}
        </div>
    )
}
