import { ArrowLeft, Loader2, Shield } from 'lucide-react'

import { GuardianRegistrySection } from './GuardianRegistrySection'
import { StudentIdentificationSection } from './StudentIdentificationSection'
import { StudentPhotoSidebar } from './StudentPhotoSidebar'
import { useStudentForm } from './useStudentForm'
import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'

export default function StudentForm() {
    const d = useStudentForm()

    if (d.loading) {
        return (
            <div className="flex flex-col items-center justify-center py-48 gap-4">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-foreground/40 font-bold uppercase tracking-widest text-xs">Accessing Student Registry...</p>
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-10">
            <div className="flex items-center gap-6">
                <button
                    onClick={() => d.navigate('/students')}
                    className="p-4 bg-secondary/50 hover:bg-secondary/80 text-foreground rounded-2xl transition-all border border-border/40 shadow-xl"
                    aria-label="Back to Registry"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <HubBreadcrumb crumbs={[
                        { label: 'Students', href: '/students' },
                        { label: d.isEdit ? 'Edit Student' : 'New Student' }
                    ]} />
                    <h1 className="text-xl md:text-3xl font-bold text-foreground font-heading">
                        {d.isEdit ? 'Update Student Record' : 'Registry Admission'}
                    </h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">
                        {d.isEdit ? `Modifying identification for ADM: ${d.formData.admission_number}` : 'Onboard a new student to the official school ledger'}
                    </p>
                </div>
            </div>

            {d.error && (
                <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 animate-shake">
                    <Shield className="w-5 h-5 text-red-400" />
                    <p className="text-sm font-bold text-red-400">{d.error}</p>
                </div>
            )}

            <form onSubmit={d.handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <StudentIdentificationSection formData={d.formData} handleChange={d.handleChange} setFormData={d.setFormData} streams={d.streams} />
                    <GuardianRegistrySection formData={d.formData} handleChange={d.handleChange} />
                </div>
                <StudentPhotoSidebar
                    photoDataUrl={d.photoDataUrl}
                    photoInputRef={d.photoInputRef}
                    onPhotoSelect={d.handlePhotoSelect}
                    onRemovePhoto={d.handleRemovePhoto}
                    saving={d.saving}
                    isEdit={d.isEdit}
                    onCancel={() => d.navigate('/students')}
                    notes={d.formData.notes}
                    onNotesChange={d.handleChange}
                />
            </form>
        </div>
    )
}
