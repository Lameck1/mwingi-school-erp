import { ArrowLeft, Save, Loader2, User, Shield, Phone, Mail, MapPin, Calendar, Heart } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'
import { Select } from '../../components/ui/Select'
import { useAuthStore } from '../../stores'
import { type Stream } from '../../types/electron-api/AcademicAPI'

export default function StudentForm() {
    const navigate = useNavigate()
    const { id } = useParams()
    const isEdit = Boolean(id)
    const { user } = useAuthStore()

    const [streams, setStreams] = useState<Stream[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const [formData, setFormData] = useState({
        admission_number: '',
        first_name: '',
        middle_name: '',
        last_name: '',
        date_of_birth: '',
        gender: 'MALE' as 'MALE' | 'FEMALE',
        student_type: 'DAY_SCHOLAR' as 'BOARDER' | 'DAY_SCHOLAR',
        admission_date: new Date().toISOString().slice(0, 10),
        guardian_name: '',
        guardian_phone: '',
        guardian_email: '',
        address: '',
        stream_id: '',
        guardian_relationship: '',
        notes: ''
    })

    useEffect(() => {
        const loadData = async () => {
            setLoading(true)
            try {
                const streamsData = await globalThis.electronAPI.getStreams()
                setStreams(streamsData)

                if (id) {
                    const student = await globalThis.electronAPI.getStudentById(Number.parseInt(id, 10))
                    if (student) {
                        const studentWithExtendedFields = student as typeof student & {
                            guardian_relationship?: string | null
                            notes?: string | null
                        }
                        setFormData({
                            admission_number: student.admission_number || '',
                            first_name: student.first_name || '',
                            middle_name: student.middle_name || '',
                            last_name: student.last_name || '',
                            date_of_birth: student.date_of_birth || '',
                            gender: student.gender || 'MALE',
                            student_type: student.student_type || 'DAY_SCHOLAR',
                            admission_date: student.admission_date || '',
                            guardian_name: student.guardian_name || '',
                            guardian_phone: student.guardian_phone || '',
                            guardian_email: student.guardian_email || '',
                            address: student.address || '',
                            stream_id: student.stream_id?.toString() || '',
                            guardian_relationship: studentWithExtendedFields.guardian_relationship || '',
                            notes: studentWithExtendedFields.notes || ''
                        })
                    }
                }
            } catch (error) {
                console.error('Failed to load data:', error)
                setError('Failed to load local data registry')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [id])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        setError('')
        setSaving(true)

        try {
            const parsedStreamId = Number.parseInt(formData.stream_id, 10)
            const studentPayload = {
                ...formData,
                stream_id: Number.isFinite(parsedStreamId) ? parsedStreamId : undefined
            }
            type StudentMutationResult = { success: boolean; error?: string }
            let mutationResult: StudentMutationResult

            if (isEdit && id) {
                mutationResult = await globalThis.electronAPI.updateStudent(
                    Number.parseInt(id, 10),
                    studentPayload
                ) as StudentMutationResult
            } else {
                if (!user?.id) {
                    throw new Error('User session not found. Please log in again.')
                }

                mutationResult = await globalThis.electronAPI.createStudent(
                    studentPayload,
                    user.id
                ) as StudentMutationResult
            }

            if (!mutationResult.success) {
                throw new Error(mutationResult.error || 'Failed to save student record')
            }

            navigate('/students')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registry synchronization failed')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-48 gap-4">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-foreground/40 font-bold uppercase tracking-widest text-xs">Accessing Student Registry...</p>
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-10">
            {/* Header Section */}
            <div className="flex items-center gap-6">
                <button
                    onClick={() => navigate('/students')}
                    className="p-4 bg-secondary/50 hover:bg-secondary/80 text-foreground rounded-2xl transition-all border border-border/40 shadow-xl"
                    aria-label="Back to Registry"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <HubBreadcrumb crumbs={[
                        { label: 'Students', href: '/students' },
                        { label: isEdit ? 'Edit Student' : 'New Student' }
                    ]} />
                    <h1 className="text-xl md:text-3xl font-bold text-foreground font-heading">
                        {isEdit ? 'Update Student Record' : 'Registry Admission'}
                    </h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">
                        {isEdit ? `Modifying identification for ADM: ${formData.admission_number}` : 'Onboard a new student to the official school ledger'}
                    </p>
                </div>
            </div>

            {error && (
                <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 animate-shake">
                    <Shield className="w-5 h-5 text-red-400" />
                    <p className="text-sm font-bold text-red-400">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Primary Data */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Basic Identification */}
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

                    {/* Guardian Details */}
                    <div className="card animate-slide-up delay-100">
                        <div className="flex items-center gap-3 mb-8 border-b border-border/20 pb-4">
                            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                                <Heart className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold text-foreground">Guardian/Family Registry</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label htmlFor="student-guardian-name" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Primary Guardian Name</label>
                                <input id="student-guardian-name" name="guardian_name" value={formData.guardian_name} onChange={handleChange}
                                    className="input border-border/20" placeholder="Enter full name" />
                            </div>

                            <div>
                                <label htmlFor="student-guardian-phone" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Contact Phone</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                                    <input id="student-guardian-phone" name="guardian_phone" type="tel" value={formData.guardian_phone} onChange={handleChange}
                                        className="input pl-11 border-border/20" placeholder="e.g. 0712 XXX XXX" />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="student-guardian-email" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Email (Optional)</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                                    <input id="student-guardian-email" name="guardian_email" type="email" value={formData.guardian_email} onChange={handleChange}
                                        className="input pl-11 border-border/20" placeholder="guardian@example.com" />
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <label htmlFor="student-address" className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest block mb-2 ml-1">Residential Address</label>
                                <div className="relative">
                                    <MapPin className="absolute left-4 top-4 w-4 h-4 text-foreground/40" />
                                    <textarea id="student-address" name="address" value={formData.address} onChange={handleChange}
                                        className="input pl-11 border-border/40 focus:border-primary/50 transition-all min-h-[100px] font-medium" placeholder="Village, Town, Street details..." />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Actions & Meta */}
                <div className="space-y-8">
                    <div className="card animate-slide-up delay-200">
                        <div className="flex items-center gap-3 mb-6">
                            <Shield className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-bold text-foreground">Record Status</h2>
                        </div>

                        <div className="space-y-4 mb-8">
                            <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                                <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">System Audit</p>
                                <p className="text-xs text-foreground/60 leading-relaxed italic">
                                    {isEdit
                                        ? 'Updating this record will modify permanent school ledgers and affect financial reporting.'
                                        : 'A new account will be provisioned in the school ERP and financial ledgers.'}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full btn btn-primary flex items-center justify-center gap-3 py-4 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
                            >
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                {saving ? 'Verifying...' : 'Commit to Registry'}
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/students')}
                                className="w-full btn bg-secondary/50 hover:bg-secondary/70 text-foreground border border-border/40 py-4 text-sm font-bold transition-all duration-300"
                            >
                                Abandon Changes
                            </button>
                        </div>
                    </div>

                    <div className="card animate-slide-up delay-300">
                        <div className="flex items-center gap-3 mb-6">
                            <Calendar className="w-5 h-5 text-amber-500" />
                            <h2 className="text-lg font-bold text-foreground">Administrative Notes</h2>
                        </div>
                        <textarea
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            className="input border-border/20 min-h-[150px] text-xs"
                            placeholder="Clinical history, fee arrangements, or special behavioral notes..."
                        />
                    </div>
                </div>
            </form>
        </div>
    )
}
