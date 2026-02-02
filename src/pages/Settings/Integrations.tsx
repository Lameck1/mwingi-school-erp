import { useState, useEffect } from 'react'
import { Save, Lock, Smartphone, Mail, Globe, Eye, EyeOff } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'

export default function IntegrationsSettings() {
    const { showToast } = useToast()
    const [loading, setLoading] = useState(false)
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

    const [smsConfig, setSmsConfig] = useState({
        provider: 'africastalking',
        api_key: '',
        username: '',
        sender_id: ''
    })

    const [smtpConfig, setSmtpConfig] = useState({
        host: '',
        port: '587',
        user: '',
        pass: '',
        secure: 'false'
    })

    useEffect(() => {
        loadConfigs()
    }, [])

    const loadConfigs = async () => {
        try {
            const all = await window.electronAPI.getAllConfigs()

            setSmsConfig(prev => ({
                ...prev,
                api_key: all['sms.api_key'] || '',
                username: all['sms.username'] || '',
                sender_id: all['sms.sender_id'] || ''
            }))

            setSmtpConfig(prev => ({
                ...prev,
                host: all['smtp.host'] || '',
                port: all['smtp.port'] || '587',
                user: all['smtp.user'] || '',
                pass: all['smtp.pass'] || ''
            }))

        } catch (error) {
            console.error(error)
            showToast('Failed to load integration settings', 'error')
        }
    }

    const handleSaveSMS = async () => {
        setLoading(true)
        try {
            await Promise.all([
                window.electronAPI.saveSecureConfig('sms.provider', smsConfig.provider),
                window.electronAPI.saveSecureConfig('sms.api_key', smsConfig.api_key),
                window.electronAPI.saveSecureConfig('sms.username', smsConfig.username),
                window.electronAPI.saveSecureConfig('sms.sender_id', smsConfig.sender_id)
            ])
            showToast('SMS Gateway settings saved securely', 'success')
        } catch (error) {
            showToast('Failed to save SMS settings', 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleSaveSMTP = async () => {
        setLoading(true)
        try {
            await Promise.all([
                window.electronAPI.saveSecureConfig('smtp.host', smtpConfig.host),
                window.electronAPI.saveSecureConfig('smtp.port', smtpConfig.port),
                window.electronAPI.saveSecureConfig('smtp.user', smtpConfig.user),
                window.electronAPI.saveSecureConfig('smtp.pass', smtpConfig.pass)
            ])
            showToast('SMTP settings saved securely', 'success')
        } catch (error) {
            showToast('Failed to save SMTP settings', 'error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6 animate-slide-up">
            <div className="flex items-center gap-4 border-b border-border/20 pb-6 mb-6">
                <div className="p-3 bg-primary/10 rounded-2xl">
                    <Globe className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-foreground font-heading">External Integrations</h2>
                    <p className="text-sm text-foreground/50 font-medium italic">Endpoint orchestration for SMS gateways and Email servers</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* SMS Gateway Section */}
                <div className="premium-card space-y-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Smartphone className="w-5 h-5 text-emerald-500" />
                            <h3 className="text-lg font-bold text-foreground">SMS Gateway</h3>
                        </div>
                        <div className="text-[9px] font-bold tracking-widest text-emerald-500 uppercase bg-emerald-500/10 px-2 py-0.5 rounded-md">Realtime</div>
                    </div>

                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Service Provider</label>
                            <select
                                className="input w-full bg-secondary/30"
                                value={smsConfig.provider}
                                onChange={e => setSmsConfig({ ...smsConfig, provider: e.target.value })}
                            >
                                <option value="africastalking" className="bg-background">Africa's Talking</option>
                                <option value="twilio" className="bg-background">Twilio (International)</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Username / SID</label>
                            <input
                                type="text"
                                className="input w-full bg-secondary/30"
                                value={smsConfig.username}
                                onChange={e => setSmsConfig({ ...smsConfig, username: e.target.value })}
                                placeholder="Enter service ID"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">API Key / Auth Token</label>
                            <div className="relative">
                                <input
                                    type={showKeys['sms'] ? "text" : "password"}
                                    className="input w-full bg-secondary/30 pr-10"
                                    value={smsConfig.api_key}
                                    onChange={e => setSmsConfig({ ...smsConfig, api_key: e.target.value })}
                                    placeholder="••••••••••••••••"
                                />
                                <button
                                    onClick={() => setShowKeys(p => ({ ...p, sms: !p.sms }))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
                                >
                                    {showKeys['sms'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-[10px] text-emerald-500 font-bold flex items-center gap-1.5 mt-2">
                                <Lock className="w-3 h-3" /> Encrypted with AES-256 standard
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Sender ID</label>
                            <input
                                type="text"
                                className="input w-full bg-secondary/30"
                                value={smsConfig.sender_id}
                                onChange={e => setSmsConfig({ ...smsConfig, sender_id: e.target.value })}
                                placeholder="SCHOOLNAME"
                            />
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                onClick={handleSaveSMS}
                                disabled={loading}
                                className="btn btn-primary px-8 flex items-center gap-2 shadow-lg shadow-primary/20"
                            >
                                <Save className="w-4 h-4" />
                                <span>Save SMS Config</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* SMTP Config Section */}
                <div className="premium-card space-y-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Mail className="w-5 h-5 text-indigo-500" />
                            <h3 className="text-lg font-bold text-foreground">Email Server (SMTP)</h3>
                        </div>
                        <div className="text-[9px] font-bold tracking-widest text-indigo-500 uppercase bg-indigo-500/10 px-2 py-0.5 rounded-md">Reliable</div>
                    </div>

                    <div className="space-y-5">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2 space-y-2">
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Host Address</label>
                                <input
                                    type="text"
                                    className="input w-full bg-secondary/30"
                                    value={smtpConfig.host}
                                    onChange={e => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                                    placeholder="smtp.gmail.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Port</label>
                                <input
                                    type="text"
                                    className="input w-full bg-secondary/30"
                                    value={smtpConfig.port}
                                    onChange={e => setSmtpConfig({ ...smtpConfig, port: e.target.value })}
                                    placeholder="587"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Auth Username / Email</label>
                            <input
                                type="text"
                                className="input w-full bg-secondary/30"
                                value={smtpConfig.user}
                                onChange={e => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                                placeholder="admin@school.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Password</label>
                            <div className="relative">
                                <input
                                    type={showKeys['smtp'] ? "text" : "password"}
                                    className="input w-full bg-secondary/30 pr-10"
                                    value={smtpConfig.pass}
                                    onChange={e => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                                    placeholder="••••••••••••••••"
                                />
                                <button
                                    onClick={() => setShowKeys(p => ({ ...p, smtp: !p.smtp }))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
                                >
                                    {showKeys['smtp'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-[10px] text-indigo-500 font-bold flex items-center gap-1.5 mt-2">
                                <Lock className="w-3 h-3" /> Encrypted with AES-256 standard
                            </p>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                onClick={handleSaveSMTP}
                                disabled={loading}
                                className="btn btn-primary px-8 flex items-center gap-2 shadow-lg shadow-primary/20"
                            >
                                <Save className="w-4 h-4" />
                                <span>Save Email Config</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
