import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'

export default function StudentForm() {
    const navigate = useNavigate()
    const { id } = useParams()
    const isEdit = Boolean(id)

    const [streams, setStreams] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const [formData, setFormData] = useState({
        admission_number: '',
        first_name: '',
        middle_name: '',
        last_name: '',
        date_of_birth: '',
        gender: 'M',
        student_type: 'DAY_SCHOLAR',
        admission_date: new Date().toISOString().slice(0, 10),
        guardian_name: '',
        guardian_phone: '',
        guardian_email: '',
        guardian_relationship: '',
        address: '',
        notes: '',
        stream_id: '',
    })

    useEffect(() => {
        loadData()
    }, [id])

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
                        gender: student.gender || 'M',
                        student_type: student.student_type || 'DAY_SCHOLAR',
                        admission_date: student.admission_date || '',
                        guardian_name: student.guardian_name || '',
                        guardian_phone: student.guardian_phone || '',
                        guardian_email: student.guardian_email || '',
                        guardian_relationship: student.guardian_relationship || '',
                        address: student.address || '',
                        notes: student.notes || '',
                        stream_id: '',
                    })
                }
            }
        } catch (error) {
            console.error('Failed to load data:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setSaving(true)

        try {
            if (isEdit) {
                await window.electronAPI.updateStudent(parseInt(id!), formData)
            } else {
                await window.electronAPI.createStudent(formData)
            }
            navigate('/students')
        } catch (err: any) {
            setError(err.message || 'Failed to save student')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate('/students')} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Go back">
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        {isEdit ? 'Edit Student' : 'New Student'}
                    </h1>
                    <p className="text-gray-500 mt-1">
                        {isEdit ? 'Update student information' : 'Register a new student'}
                    </p>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="max-w-4xl">
                <div className="card mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="label" htmlFor="admission_number">Admission Number *</label>
                            <input id="admission_number" type="text" name="admission_number" value={formData.admission_number}
                                onChange={handleChange} className="input" required placeholder="e.g., MAS-2025-001" />
                        </div>
                        <div>
                            <label className="label" htmlFor="first_name">First Name *</label>
                            <input id="first_name" type="text" name="first_name" value={formData.first_name}
                                onChange={handleChange} className="input" required />
                        </div>
                        <div>
                            <label className="label" htmlFor="middle_name">Middle Name</label>
                            <input id="middle_name" type="text" name="middle_name" value={formData.middle_name}
                                onChange={handleChange} className="input" />
                        </div>
                        <div>
                            <label className="label" htmlFor="last_name">Last Name *</label>
                            <input id="last_name" type="text" name="last_name" value={formData.last_name}
                                onChange={handleChange} className="input" required />
                        </div>
                        <div>
                            <label className="label" htmlFor="date_of_birth">Date of Birth</label>
                            <input id="date_of_birth" type="date" name="date_of_birth" value={formData.date_of_birth}
                                onChange={handleChange} className="input" />
                        </div>
                        <div>
                            <label className="label" htmlFor="gender">Gender *</label>
                            <select id="gender" name="gender" value={formData.gender} onChange={handleChange} className="input">
                                <option value="M">Male</option>
                                <option value="F">Female</option>
                            </select>
                        </div>
                        <div>
                            <label className="label" htmlFor="student_type">Student Type *</label>
                            <select id="student_type" name="student_type" value={formData.student_type} onChange={handleChange} className="input">
                                <option value="DAY_SCHOLAR">Day Scholar</option>
                                <option value="BOARDER">Boarder</option>
                            </select>
                        </div>
                        <div>
                            <label className="label" htmlFor="stream_id">Grade/Stream *</label>
                            <select id="stream_id" name="stream_id" value={formData.stream_id} onChange={handleChange} className="input" required>
                                <option value="">Select Grade</option>
                                {streams.map(s => (<option key={s.id} value={s.id}>{s.stream_name}</option>))}
                            </select>
                        </div>
                        <div>
                            <label className="label" htmlFor="admission_date">Admission Date *</label>
                            <input id="admission_date" type="date" name="admission_date" value={formData.admission_date}
                                onChange={handleChange} className="input" required />
                        </div>
                    </div>
                </div>

                <div className="card mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Guardian Information</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="label" htmlFor="guardian_name">Guardian Name</label>
                            <input id="guardian_name" type="text" name="guardian_name" value={formData.guardian_name}
                                onChange={handleChange} className="input" />
                        </div>
                        <div>
                            <label className="label" htmlFor="guardian_relationship">Relationship</label>
                            <select id="guardian_relationship" name="guardian_relationship" value={formData.guardian_relationship}
                                onChange={handleChange} className="input">
                                <option value="">Select</option>
                                <option value="Parent">Parent</option>
                                <option value="Guardian">Guardian</option>
                                <option value="Relative">Relative</option>
                            </select>
                        </div>
                        <div>
                            <label className="label" htmlFor="guardian_phone">Phone Number</label>
                            <input id="guardian_phone" type="tel" name="guardian_phone" value={formData.guardian_phone}
                                onChange={handleChange} className="input" placeholder="e.g., 0712345678" />
                        </div>
                        <div>
                            <label className="label" htmlFor="guardian_email">Email</label>
                            <input id="guardian_email" type="email" name="guardian_email" value={formData.guardian_email}
                                onChange={handleChange} className="input" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="label" htmlFor="guardian_address">Address</label>
                            <textarea id="guardian_address" name="address" value={formData.address} onChange={handleChange}
                                className="input" rows={2} />
                        </div>
                    </div>
                </div>

                <div className="card mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Notes</h2>
                    <textarea name="notes" value={formData.notes} onChange={handleChange}
                        aria-label="Additional notes"
                        className="input" rows={3} placeholder="Any special notes about the student..." />
                </div>

                <div className="flex items-center gap-4">
                    <button type="submit" disabled={saving} className="btn btn-primary flex items-center gap-2">
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        <span>{saving ? 'Saving...' : 'Save Student'}</span>
                    </button>
                    <button type="button" onClick={() => navigate('/students')} className="btn btn-secondary">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    )
}
