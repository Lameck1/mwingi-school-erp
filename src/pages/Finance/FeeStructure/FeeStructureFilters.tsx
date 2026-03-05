import { type AcademicYear, type Term } from '../../../types/electron-api/AcademicAPI'

type FeeStructureFiltersProps = Readonly<{
    years: AcademicYear[]
    terms: Term[]
    selectedYear: string
    selectedTerm: string
    onYearChange: (value: string) => void
    onTermChange: (value: string) => void
}>

export function FeeStructureFilters({ years, terms, selectedYear, selectedTerm, onYearChange, onTermChange }: FeeStructureFiltersProps) {
    return (
        <div className="premium-card mb-6 p-4">
            <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label htmlFor="field-220" className="block text-[10px] font-bold text-foreground/40 uppercase tracking-widest mb-1.5 ml-1">Academic Year</label>
                    <select id="field-220"
                        value={selectedYear}
                        onChange={e => onYearChange(e.target.value)}
                        className="input w-full border-border/20 focus:border-primary/50 transition-all font-medium py-2.5"
                    >
                        <option value="" className="bg-background">Select Year</option>
                        {years.map(y => (
                            <option key={y.id} value={y.id} className="bg-background">{y.year_name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label htmlFor="field-236" className="block text-[10px] font-bold text-foreground/40 uppercase tracking-widest mb-1.5 ml-1">Term</label>
                    <select id="field-236"
                        value={selectedTerm}
                        onChange={e => onTermChange(e.target.value)}
                        className="input w-full border-border/20 focus:border-primary/50 transition-all font-medium py-2.5"
                        disabled={!selectedYear}
                    >
                        <option value="" className="bg-background">Select Term</option>
                        {terms.map(t => (
                            <option key={t.id} value={t.id} className="bg-background">{t.term_name}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    )
}
