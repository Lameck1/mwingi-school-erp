import { useEffect, useState } from 'react'
import { useAppStore } from '../../stores'
import { Save, Loader2, School, Calendar, CreditCard, Mail } from 'lucide-react'

export default function Settings() {
    const { schoolSettings, setSchoolSettings } = useAppStore()
    const [activeTab, setActiveTab] = useState('school')
    const [saving, setSaving] = useState(false)
    const [formData, setFormData] = useState({
        school_name: '', school_address: '', school_phone: '', school_email: '', school_website: '',
        currency: '', timezone: '', date_format: '',
        sms_api_key: '', sms_api_secret: '', sms_sender_id: '', mpesa_paybill: ''
    })

    useEffect(() => {
        if (schoolSettings) {
            setFormData({
                school_name: schoolSettings.school_name || '',
                school_address: schoolSettings.school_address || '',
                school_phone: schoolSettings.school_phone || '',
                school_email: schoolSettings.school_email || '',
                school_website: schoolSettings.school_website || '',
                currency: schoolSettings.currency || '',
                timezone: schoolSettings.timezone || '',
                date_format: schoolSettings.date_format || '',
                sms_api_key: schoolSettings.sms_api_key || '',
                sms_api_secret: schoolSettings.sms_api_secret || '',
                sms_sender_id: schoolSettings.sms_sender_id || '',
                mpesa_paybill: schoolSettings.mpesa_paybill || ''
            })
        }
    }, [schoolSettings])

    const handleSave = async () => {
        setSaving(true)
        try {
            await window.electronAPI.updateSettings(formData)
            const updated = await window.electronAPI.getSettings()
            setSchoolSettings(updated)
            alert('Settings saved successfully!')
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to save settings')
        } finally { setSaving(false) }
    }

    const tabs = [
        { id: 'school', label: 'School Info', icon: School },
        { id: 'academic', label: 'Academic Year', icon: Calendar },
        { id: 'payments', label: 'Payment Settings', icon: CreditCard },
        { id: 'messaging', label: 'SMS/Email', icon: Mail },
    ]

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                    <p className="text-gray-500 mt-1">Configure system settings</p>
                </div>
                <button onClick={handleSave} disabled={saving} className="btn btn-primary flex items-center gap-2">
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
            </div>

            <div className="flex gap-6">
                {/* Sidebar */}
                <div className="w-56 shrink-0">
                    <nav className="space-y-1">
                        {tabs.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${activeTab === tab.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                                    }`}>
                                <tab.icon className="w-5 h-5" />
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content */}
                <div className="flex-1">
                    {activeTab === 'school' && (
                        <div className="card">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">School Information</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="label" htmlFor="school_name">School Name *</label>
                                    <input id="school_name" type="text" value={formData.school_name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, school_name: e.target.value }))}
                                        className="input" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="label" htmlFor="school_motto">School Motto</label>
                                    <input id="school_motto" type="text" value={formData.school_name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, school_name: e.target.value }))}
                                        className="input" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="label" htmlFor="address">Address</label>
                                    <textarea id="address" value={formData.school_address}
                                        onChange={(e) => setFormData(prev => ({ ...prev, school_address: e.target.value }))}
                                        className="input" rows={2} />
                                </div>
                                <div>
                                    <label className="label" htmlFor="phone">Phone</label>
                                    <input id="phone" type="tel" value={formData.school_phone}
                                        onChange={(e) => setFormData(prev => ({ ...prev, school_phone: e.target.value }))}
                                        className="input" />
                                </div>
                                <div>
                                    <label className="label" htmlFor="email">Email</label>
                                    <input id="email" type="email" value={formData.school_email}
                                        onChange={(e) => setFormData(prev => ({ ...prev, school_email: e.target.value }))}
                                        className="input" />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'academic' && (
                        <div className="card">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Academic Year & Terms</h2>
                            <p className="text-gray-500 mb-4">Configure academic years and term dates</p>
                            <div className="space-y-4">
                                <div className="p-4 border rounded-lg flex justify-between items-center">
                                    <div>
                                        <p className="font-medium">2025</p>
                                        <p className="text-sm text-gray-500">Jan 6, 2025 - Nov 28, 2025</p>
                                    </div>
                                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">Current</span>
                                </div>
                            </div>
                            <button className="btn btn-secondary mt-4">Add Academic Year</button>
                        </div>
                    )}

                    {activeTab === 'payments' && (
                        <div className="card">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Settings</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="label">MPESA Paybill Number</label>
                                    <input type="text" value={formData.mpesa_paybill}
                                        onChange={(e) => setFormData(prev => ({ ...prev, mpesa_paybill: e.target.value }))}
                                        className="input" placeholder="e.g., 247247" />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'messaging' && (
                        <div className="card">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">SMS/Email Configuration</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="label" htmlFor="sms_api_key">SMS API Key (Africa's Talking)</label>
                                    <input id="sms_api_key" type="password" value={formData.sms_api_key}
                                        onChange={(e) => setFormData(prev => ({ ...prev, sms_api_key: e.target.value }))}
                                        className="input" />
                                </div>
                                <div>
                                    <label className="label" htmlFor="sms_api_secret">SMS API Secret / Username</label>
                                    <input id="sms_api_secret" type="text" value={formData.sms_api_secret}
                                        onChange={(e) => setFormData(prev => ({ ...prev, sms_api_secret: e.target.value }))}
                                        className="input" />
                                </div>
                                <div>
                                    <label className="label" htmlFor="sms_sender_id">SMS Sender ID</label>
                                    <input id="sms_sender_id" type="text" value={formData.sms_sender_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, sms_sender_id: e.target.value }))}
                                        className="input" placeholder="e.g., MWINGI_SCH" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
