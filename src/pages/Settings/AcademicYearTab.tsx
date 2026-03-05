import { Calendar, Loader2, Plus, CheckCircle2 } from 'lucide-react'

import { type AcademicYear } from '../../types/electron-api/AcademicAPI'

interface AcademicYearTabProps {
    saving: boolean
    loadingYears: boolean
    academicYears: AcademicYear[]
    handleActivateYear: (id: number) => void
    setShowYearModal: (v: boolean) => void
}

function AcademicYearList({ loadingYears, academicYears, saving, handleActivateYear }: Readonly<Pick<AcademicYearTabProps, 'loadingYears' | 'academicYears' | 'saving' | 'handleActivateYear'>>) {
    if (loadingYears) {
        return (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary/40" /></div>
        )
    }

    if (academicYears.length === 0) {
        return (
            <div className="p-6 md:p-12 text-center border-2 border-dashed border-border/20 rounded-3xl">
                <Calendar className="w-12 h-12 text-foreground/5 mx-auto mb-4" />
                <p className="text-foreground/40 font-bold uppercase text-[10px] tracking-widest">No cycles established</p>
            </div>
        )
    }

    return (
        <>
            {academicYears.map(year => (
                <div key={year.id} className="p-6 bg-secondary/10 border border-border/20 rounded-2xl flex justify-between items-center group hover:bg-secondary/20 transition-all border-l-4 border-l-primary/40">
                    <div>
                        <p className="font-bold text-foreground text-lg">{year.year_name}</p>
                        <p className="text-xs text-foreground/40 font-medium mt-1">
                            {new Date(year.start_date).toLocaleDateString()} — {new Date(year.end_date).toLocaleDateString()}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {year.is_current ? (
                            <span className="px-4 py-1.5 bg-emerald-500/10 text-emerald-500 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border border-emerald-500/20 shadow-sm shadow-emerald-500/10">
                                <CheckCircle2 className="w-3 h-3" />
                                Active Session
                            </span>
                        ) : (
                            <button
                                onClick={() => handleActivateYear(year.id)}
                                disabled={saving}
                                className="px-4 py-1.5 bg-secondary/30 text-foreground/40 hover:text-primary hover:bg-primary/5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-border/20 transition-all flex items-center gap-2"
                                type="button"
                            >
                                <Calendar className="w-3 h-3" />
                                Activate
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </>
    )
}

export function AcademicYearTab({ saving, loadingYears, academicYears, handleActivateYear, setShowYearModal }: Readonly<AcademicYearTabProps>) {
    return (
        <div className="card animate-slide-up">
            <div className="flex items-center justify-between mb-8 pb-3 border-b border-border/10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Calendar className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground font-heading">Academic Cycles</h2>
                </div>
                <button
                    onClick={() => setShowYearModal(true)}
                    className="btn btn-primary flex items-center gap-2 py-2 px-4 text-xs"
                >
                    <Plus className="w-4 h-4" />
                    <span>New Cycle</span>
                </button>
            </div>

            <p className="text-foreground/40 font-medium italic mb-6 text-sm">Orchestrate academic years, schedules, and duration boundaries.</p>

            <div className="space-y-4">
                <AcademicYearList loadingYears={loadingYears} academicYears={academicYears} saving={saving} handleActivateYear={handleActivateYear} />
            </div>

            <button
                onClick={() => setShowYearModal(true)}
                className="btn btn-secondary mt-10 w-full py-5 border-dashed border-2 hover:border-primary/40 hover:bg-primary/5 text-foreground/40 transition-all font-bold uppercase tracking-[0.2em] text-[10px]"
            >
                + Establish New Academic Cycle
            </button>
        </div>
    )
}
