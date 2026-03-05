import { type ChangeEvent, type Dispatch, type SetStateAction } from 'react'
import { User } from 'lucide-react'

import { type StudentFormData } from './useStudentForm'
import { Select } from '../../components/ui/Select'
import { type Stream } from '../../types/electron-api/AcademicAPI'

interface StudentIdentificationSectionProps {
    formData: StudentFormData
    handleChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
    setFormData: Dispatch<SetStateAction<StudentFormData>>
    streams: Stream[]
}

export function StudentIdentificationSection({ formData, handleChange, setFormData, streams }: Readonly<StudentIdentificationSectionProps>) {
    return (
        <div className="card animate-slide-up">
            <div className="flex items-center gap-3 mb-8 border-b border-border/20 pb-4">
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <User className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Student Identification</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Full Legal Name (Primary)</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input name="first_name" value={formData.first_name} onChange={handleChange} required
                            className="input border-border/20" placeholder="First Name" />
                        <input name="middle_name" value={formData.middle_name} onChange={handleChange}
                            className="input border-border/20" placeholder="Middle Name" />
                        <input name="last_name" value={formData.last_name} onChange={handleChange} required
                            className="input border-border/20" placeholder="Surname" />
                    </div>
                </div>

                <div>
                    <label htmlFor="student-admission-number" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Admission Number</label>
                    <input id="student-admission-number" name="admission_number" value={formData.admission_number} onChange={handleChange} required
                        className="input border-border/20 font-mono" placeholder="MAS-2025-XXX" />
                </div>

                <Select
                    label="Academic Placement"
                    name="stream_id"
                    value={formData.stream_id}
                    onChange={(val) => setFormData(prev => ({ ...prev, stream_id: String(val) }))}
                    options={[
                        { value: '', label: 'Select Stream' },
                        ...streams.map(s => ({ value: s.id.toString(), label: s.stream_name }))
                    ]}
                />

                <Select
                    label="Gender Identity"
                    name="gender"
                    value={formData.gender}
                    onChange={(val) => setFormData(prev => ({ ...prev, gender: String(val) as 'MALE' | 'FEMALE' }))}
                    options={[
                        { value: 'MALE', label: 'Male' },
                        { value: 'FEMALE', label: 'Female' }
                    ]}
                />

                <Select
                    label="Enrollment Type"
                    name="student_type"
                    value={formData.student_type}
                    onChange={(val) => setFormData(prev => ({ ...prev, student_type: String(val) as 'BOARDER' | 'DAY_SCHOLAR' }))}
                    options={[
                        { value: 'DAY_SCHOLAR', label: 'Day Scholar' },
                        { value: 'BOARDER', label: 'Boarder' }
                    ]}
                />

                <div>
                    <label htmlFor="student-dob" className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest block mb-2 ml-1">Date of Birth</label>
                    <input id="student-dob" name="date_of_birth" type="date" value={formData.date_of_birth} onChange={handleChange}
                        className="input border-border/40 focus:border-primary/50 transition-all font-medium" />
                </div>

                <div>
                    <label htmlFor="student-admission-date" className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest block mb-2 ml-1">Admission Date</label>
                    <input id="student-admission-date" name="admission_date" type="date" value={formData.admission_date} onChange={handleChange} required
                        className="input border-border/40 focus:border-primary/50 transition-all font-medium" />
                </div>
            </div>
        </div>
    )
}
