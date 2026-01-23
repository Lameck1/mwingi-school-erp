import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, User, Shield, Phone, Mail, MapPin, Calendar, Heart } from 'lucide-react'
import { Stream } from '../../types/electron-api/AcademicAPI'

export default function StudentForm() {
    const navigate = useNavigate()
    const { id } = useParams()
    const isEdit = Boolean(id)

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
                const streamsData = await window.electronAPI.getStreams()
                setStreams(streamsData)

                if (id) {
                    const student = await window.electronAPI.getStudentById(parseInt(id))
                    if (student) {
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
                            guardian_relationship: '',
                            notes: ''
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

        loadData()
    }, [id])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setSaving(true)

        try {
            if (isEdit) {
                await window.electronAPI.updateStudent(parseInt(id!), {
                    ...formData,
                    stream_id: parseInt(formData.stream_id)
                })
            } else {
                await window.electronAPI.createStudent({
                    ...formData,
                    stream_id: parseInt(formData.stream_id)
                })
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
                    className="p-4 bg-secondary/30 hover:bg-secondary/50 text-white rounded-2xl transition-all border border-white/5 shadow-xl"
                    aria-label="Back to Registry"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-white font-heading">
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
                        <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4">
                            <div className="p-2 bg-primary/10 text-primary rounded-lg">
                                <User className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold text-white">Student Identification</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Full Legal Name (Primary)</label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <input name="first_name" value={formData.first_name} onChange={handleChange} required
                                        className="input bg-secondary/30 border-white/5" placeholder="First Name" />
                                    <input name="middle_name" value={formData.middle_name} onChange={handleChange}
                                        className="input bg-secondary/30 border-white/5" placeholder="Middle Name" />
                                    <input name="last_name" value={formData.last_name} onChange={handleChange} required
                                        className="input bg-secondary/30 border-white/5" placeholder="Surname" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Admission Number</label>
                                <input name="admission_number" value={formData.admission_number} onChange={handleChange} required
                                    className="input bg-secondary/30 border-white/5 font-mono" placeholder="MAS-2025-XXX" />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Academic Placement</label>
                                <select name="stream_id" value={formData.stream_id} onChange={handleChange} required
                                    className="input bg-secondary/30 border-white/5">
                                    <option value="">Select Stream</option>
                                    {streams.map(s => (<option key={s.id} value={s.id}>{s.stream_name}</option>))}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Gender Identity</label>
                                <select name="gender" value={formData.gender} onChange={handleChange}
                                    className="input bg-secondary/30 border-white/5">
                                    <option value="MALE">Male</option>
                                    <option value="FEMALE">Female</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Enrollment Type</label>
                                <select name="student_type" value={formData.student_type} onChange={handleChange}
                                    className="input bg-secondary/30 border-white/5">
                                    <option value="DAY_SCHOLAR">Day Scholar</option>
                                    <option value="BOARDER">Boarder</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Date of Birth</label>
                                <input name="date_of_birth" type="date" value={formData.date_of_birth} onChange={handleChange}
                                    className="input bg-secondary/30 border-white/5" />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Admission Date</label>
                                <input name="admission_date" type="date" value={formData.admission_date} onChange={handleChange} required
                                    className="input bg-secondary/30 border-white/5" />
                            </div>
                        </div>
                    </div>

                    {/* Guardian Details */}
                    <div className="card animate-slide-up delay-100">
                        <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4">
                            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                                <Heart className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold text-white">Guardian/Family Registry</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Primary Guardian Name</label>
                                <input name="guardian_name" value={formData.guardian_name} onChange={handleChange}
                                    className="input bg-secondary/30 border-white/5" placeholder="Enter full name" />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Contact Phone</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                                    <input name="guardian_phone" type="tel" value={formData.guardian_phone} onChange={handleChange}
                                        className="input pl-11 bg-secondary/30 border-white/5" placeholder="e.g. 0712 XXX XXX" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Email (Optional)</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                                    <input name="guardian_email" type="email" value={formData.guardian_email} onChange={handleChange}
                                        className="input pl-11 bg-secondary/30 border-white/5" placeholder="guardian@example.com" />
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Residential Address</label>
                                <div className="relative">
                                    <MapPin className="absolute left-4 top-4 w-4 h-4 text-foreground/40" />
                                    <textarea name="address" value={formData.address} onChange={handleChange}
                                        className="input pl-11 bg-secondary/30 border-white/5 min-h-[100px]" placeholder="Village, Town, Street details..." />
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
                            <h2 className="text-lg font-bold text-white">Record Status</h2>
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
                                className="w-full btn bg-secondary/50 hover:bg-white/10 text-white border-white/5 py-4 text-sm font-bold"
                            >
                                Abandon Changes
                            </button>
                        </div>
                    </div>

                    <div className="card animate-slide-up delay-300">
                        <div className="flex items-center gap-3 mb-6">
                            <Calendar className="w-5 h-5 text-amber-500" />
                            <h2 className="text-lg font-bold text-white">Administrative Notes</h2>
                        </div>
                        <textarea
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            className="input bg-secondary/30 border-white/5 min-h-[150px] text-xs"
                            placeholder="Clinical history, fee arrangements, or special behavioral notes..."
                        />
                    </div>
                </div>
            </form>
        </div>
    )
}
