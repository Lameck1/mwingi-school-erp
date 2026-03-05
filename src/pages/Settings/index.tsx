import { Save, Loader2 } from 'lucide-react'

import { AcademicYearModal } from './AcademicYearModal'
import { AcademicYearTab } from './AcademicYearTab'
import IntegrationsSettings from './Integrations'
import { MaintenanceTab } from './MaintenanceTab'
import MessageTemplates from './MessageTemplates'
import { PaymentSettingsTab } from './PaymentSettingsTab'
import { SchoolInfoTab } from './SchoolInfoTab'
import { useSettingsPage } from './useSettingsPage'
import { PageHeader } from '../../components/patterns/PageHeader'

export default function Settings() {
    const d = useSettingsPage()

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="System Settings"
                subtitle="Configure core architectural and environmental parameters"
                actions={
                    <button
                        onClick={d.handleSave}
                        disabled={d.saving}
                        className="btn btn-primary flex items-center gap-2 py-3 px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
                    >
                        {d.saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        <span>{d.saving ? 'Synchronizing...' : 'Commit Changes'}</span>
                    </button>
                }
            />

            <div className="flex flex-col xl:flex-row gap-8">
                <div className="w-full xl:w-64 shrink-0">
                    <nav ref={d.navRef} className="flex xl:flex-col overflow-x-auto xl:overflow-visible custom-scrollbar p-2 bg-secondary/20 rounded-2xl border border-border/20 scroll-smooth snap-x snap-mandatory xl:snap-none">
                        {d.tabs.map(tab => (
                            <button
                                key={tab.id}
                                data-tab={tab.id}
                                onClick={() => d.handleTabClick(tab.id)}
                                className={`flex items-center gap-3 px-5 py-4 rounded-xl text-left transition-all font-bold text-sm whitespace-nowrap xl:w-full snap-start ${d.activeTab === tab.id
                                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 translate-x-0 xl:translate-x-2'
                                    : 'text-foreground/60 hover:text-foreground hover:bg-secondary/40'
                                    }`}
                            >
                                <tab.icon className={`w-5 h-5 ${d.activeTab === tab.id ? 'opacity-100' : 'opacity-60'}`} />
                                <span className="hidden sm:inline">{tab.label}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="flex-1 min-w-0">
                    {d.activeTab === 'school' && (
                        <SchoolInfoTab
                            saving={d.saving}
                            logoDataUrl={d.logoDataUrl}
                            logoInputRef={d.logoInputRef}
                            handleLogoSelect={d.handleLogoSelect}
                            handleRemoveLogo={d.handleRemoveLogo}
                            formData={d.formData}
                            setFormData={d.setFormData}
                        />
                    )}
                    {d.activeTab === 'academic' && (
                        <AcademicYearTab
                            saving={d.saving}
                            loadingYears={d.loadingYears}
                            academicYears={d.academicYears}
                            handleActivateYear={d.handleActivateYear}
                            setShowYearModal={d.setShowYearModal}
                        />
                    )}
                    {d.activeTab === 'payment' && <PaymentSettingsTab formData={d.formData} setFormData={d.setFormData} />}
                    {d.activeTab === 'integrations' && <IntegrationsSettings />}
                    {d.activeTab === 'templates' && <MessageTemplates />}
                    {d.activeTab === 'maintenance' && <MaintenanceTab saving={d.saving} setSaving={d.setSaving} />}
                </div>
            </div>

            <AcademicYearModal
                isOpen={d.showYearModal}
                onClose={() => d.setShowYearModal(false)}
                newYearData={d.newYearData}
                setNewYearData={d.setNewYearData}
                handleCreateYear={d.handleCreateYear}
                saving={d.saving}
            />
        </div>
    )
}
