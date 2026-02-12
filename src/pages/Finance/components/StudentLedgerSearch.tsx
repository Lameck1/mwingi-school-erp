import { Search, Loader2, Users } from 'lucide-react'
import React, { useState } from 'react'

import { type Student } from '../../../types/electron-api/StudentAPI'
import { formatCurrencyFromCents } from '../../../utils/format'

interface StudentLedgerSearchProps {
    onSelectStudent: (student: Student) => void
    selectedStudent: Student | null
}

export const StudentLedgerSearch: React.FC<StudentLedgerSearchProps> = ({ onSelectStudent, selectedStudent }) => {
    const [search, setSearch] = useState('')
    const [students, setStudents] = useState<Student[]>([])
    const [loading, setLoading] = useState(false)

    const handleSearch = async () => {
        if (!search) {return}
        setLoading(true)
        try {
            const results = await globalThis.electronAPI.getStudents({ search })
            setStudents(results)
        } catch (error) {
            console.error('Search failed:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSelect = (student: Student) => {
        onSelectStudent(student)
        setStudents([])
        setSearch('')
    }

    return (
        <div className="card h-fit">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Search className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Student Locator</h2>
            </div>

            <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search by name or admission..."
                    className="input pl-11 py-3 border-border/20"
                />
            </div>

            {loading && (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            )}

            {students.length > 0 && (
                <div className="space-y-2 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
                    {students.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => handleSelect(s)}
                            aria-label={`Select student ${s.first_name} ${s.last_name}`}
                            className="w-full p-4 text-left bg-secondary/20 hover:bg-primary/10 border border-border/40 rounded-xl transition-all group flex items-center justify-between"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                    {s.first_name?.charAt(0)}
                                </div>
                                <div>
                                    <p className="font-bold text-foreground group-hover:text-primary transition-colors">{s.first_name} {s.last_name}</p>
                                    <p className="text-[11px] text-foreground/40 font-mono tracking-wider uppercase">{s.admission_number}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-foreground/60">{s.stream_name}</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Selected Student Profile */}
            {selectedStudent && (
                <div className="mt-8 p-6 bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Users className="w-20 h-20" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-5 mb-6">
                            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary/30">
                                {selectedStudent.first_name?.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-bold text-xl text-foreground">
                                    {selectedStudent.first_name} {selectedStudent.last_name}
                                </h3>
                                <p className="text-xs text-primary font-bold uppercase tracking-widest">{selectedStudent.student_type}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-3 bg-secondary/30 rounded-xl border border-border/20">
                                <p className="text-[10px] text-foreground/40 font-bold uppercase mb-1">Fee Balance</p>
                                <p className="text-lg font-bold text-amber-500">{formatCurrencyFromCents(selectedStudent.balance || 0)}</p>
                            </div>
                            <div className="p-3 bg-secondary/30 rounded-xl border border-border/20">
                                <p className="text-[10px] text-foreground/40 font-bold uppercase mb-1">Fee Credit</p>
                                <p className="text-lg font-bold text-emerald-500">{formatCurrencyFromCents(selectedStudent.credit_balance || 0)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
