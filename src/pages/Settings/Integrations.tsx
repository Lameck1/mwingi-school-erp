import { Save, Lock, Smartphone, Mail, Globe, Eye, EyeOff } from 'lucide-react'
import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'

import { useToast } from '../../contexts/ToastContext'
import { getIPCFailureMessage, isIPCFailure, unwrapIPCResult } from '../../utils/ipc'

const MASKED_SECRET_VALUE = '******'

type SmsConfigData = {
    provider: string
    api_key: string
    username: string
    sender_id: string
}

interface SmsGatewayCardProps {
    smsConfig: SmsConfigData
    setSmsConfig: Dispatch<SetStateAction<SmsConfigData>>
    showKeys: Record<string, boolean>
    setShowKeys: Dispatch<SetStateAction<Record<string, boolean>>>
    onSave: () => void
    loading: boolean
}

function SmsGatewayCard({ smsConfig, setSmsConfig, showKeys, setShowKeys, onSave, loading }: Readonly<SmsGatewayCardProps>) {
    return (
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
                    <label htmlFor="sms-provider" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Service Provider</label>
                    <select
                        id="sms-provider"
                        className="input w-full"
                        value={smsConfig.provider}
                        onChange={e => setSmsConfig({ ...smsConfig, provider: e.target.value })}
                    >
                        <option value="africastalking" className="bg-background">Africa's Talking</option>
                        <option value="twilio" className="bg-background">Twilio (International)</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <label htmlFor="sms-username" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Username / SID</label>
                    <input
                        id="sms-username"
                        type="text"
                        className="input w-full"
                        value={smsConfig.username}
                        onChange={e => setSmsConfig({ ...smsConfig, username: e.target.value })}
                        placeholder="Enter service ID"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="sms-api-key" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">API Key / Auth Token</label>
                    <div className="relative">
                        <input
                            id="sms-api-key"
                            type={showKeys['sms'] ? "text" : "password"}
                            className="input w-full pr-10"
                            value={smsConfig.api_key}
                            onChange={e => setSmsConfig({ ...smsConfig, api_key: e.target.value })}
                            placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                        />
                        <button
                            type="button"
                            onClick={() => setShowKeys(p => ({ ...p, sms: !p['sms'] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
                            aria-label={showKeys['sms'] ? 'Hide SMS API key' : 'Show SMS API key'}
                        >
                            {showKeys['sms'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <p className="text-[10px] text-emerald-500 font-bold flex items-center gap-1.5 mt-2">
                        <Lock className="w-3 h-3" /> Encrypted with AES-256 standard
                    </p>
                </div>

                <div className="space-y-2">
                    <label htmlFor="sms-sender-id" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Sender ID</label>
                    <input
                        id="sms-sender-id"
                        type="text"
                        className="input w-full"
                        value={smsConfig.sender_id}
                        onChange={e => setSmsConfig({ ...smsConfig, sender_id: e.target.value })}
                        placeholder="SCHOOLNAME"
                    />
                </div>

                <div className="pt-4 flex justify-end">
                    <button
                        onClick={onSave}
                        disabled={loading}
                        className="btn btn-primary px-8 flex items-center gap-2 shadow-lg shadow-primary/20"
                    >
                        <Save className="w-4 h-4" />
                        <span>Save SMS Config</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

type SmtpConfigData = {
    host: string
    port: string
    user: string
    pass: string
    secure: string
}

interface SmtpConfigCardProps {
    smtpConfig: SmtpConfigData
    setSmtpConfig: Dispatch<SetStateAction<SmtpConfigData>>
    showKeys: Record<string, boolean>
    setShowKeys: Dispatch<SetStateAction<Record<string, boolean>>>
    onSave: () => void
    loading: boolean
}

function SmtpConfigCard({ smtpConfig, setSmtpConfig, showKeys, setShowKeys, onSave, loading }: Readonly<SmtpConfigCardProps>) {
    return (
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
                        <label htmlFor="smtp-host" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Host Address</label>
                        <input
                            id="smtp-host"
                            type="text"
                            className="input w-full"
                            value={smtpConfig.host}
                            onChange={e => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                            placeholder="smtp.gmail.com"
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="smtp-port" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Port</label>
                        <input
                            id="smtp-port"
                            type="text"
                            className="input w-full"
                            value={smtpConfig.port}
                            onChange={e => setSmtpConfig({ ...smtpConfig, port: e.target.value })}
                            placeholder="587"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label htmlFor="smtp-user" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Auth Username / Email</label>
                    <input
                        id="smtp-user"
                        type="text"
                        className="input w-full"
                        value={smtpConfig.user}
                        onChange={e => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                        placeholder="admin@school.com"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="smtp-pass" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Password</label>
                    <div className="relative">
                        <input
                            id="smtp-pass"
                            type={showKeys['smtp'] ? "text" : "password"}
                            className="input w-full pr-10"
                            value={smtpConfig.pass}
                            onChange={e => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                            placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                        />
                        <button
                            type="button"
                            onClick={() => setShowKeys(p => ({ ...p, smtp: !p['smtp'] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
                            aria-label={showKeys['smtp'] ? 'Hide SMTP password' : 'Show SMTP password'}
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
                        onClick={onSave}
                        disabled={loading}
                        className="btn btn-primary px-8 flex items-center gap-2 shadow-lg shadow-primary/20"
                    >
                        <Save className="w-4 h-4" />
                        <span>Save Email Config</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

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

    const loadConfigs = useCallback(async () => {
        try {
            const all = unwrapIPCResult<Record<string, string>>(
                await globalThis.electronAPI.settings.getAllConfigs(),
                'Failed to load integration settings'
            )

            setSmsConfig(prev => ({
                ...prev,
                provider: all['sms_provider'] || all['sms.provider'] || prev.provider,
                api_key: all['sms_api_key'] || all['sms.api_key'] || '',
                username: all['sms_api_secret'] || all['sms.api_secret'] || all['sms.username'] || '',
                sender_id: all['sms_sender_id'] || all['sms.sender_id'] || ''
            }))

            setSmtpConfig(prev => ({
                ...prev,
                host: all['smtp_host'] || all['smtp.host'] || '',
                port: all['smtp_port'] || all['smtp.port'] || '587',
                user: all['smtp_user'] || all['smtp.user'] || '',
                pass: all['smtp_pass'] || all['smtp.pass'] || ''
            }))

        } catch (error) {
            console.error(error)
            setSmsConfig({
                provider: 'africastalking',
                api_key: '',
                username: '',
                sender_id: ''
            })
            setSmtpConfig({
                host: '',
                port: '587',
                user: '',
                pass: '',
                secure: 'false'
            })
            showToast('Failed to load integration settings', 'error')
        }
    }, [showToast])

    useEffect(() => {
        loadConfigs().catch((err: unknown) => console.error('Failed to load integration configs', err))
    }, [loadConfigs])

    const shouldPersistConfigValue = (value: string): boolean => value.trim() !== MASKED_SECRET_VALUE

    const normalizeSecureSaveResult = (result: unknown, fallback: string): boolean => {
        if (typeof result === 'boolean') {
            return result
        }
        if (isIPCFailure(result)) {
            throw new Error(getIPCFailureMessage(result, fallback))
        }
        throw new Error(fallback)
    }

    const handleSaveSMS = async () => {
        setLoading(true)
        try {
            const saveOperations: Promise<unknown>[] = [
                globalThis.electronAPI.settings.saveSecureConfig('sms_provider', smsConfig.provider)
            ]

            if (shouldPersistConfigValue(smsConfig.api_key)) {
                saveOperations.push(globalThis.electronAPI.settings.saveSecureConfig('sms_api_key', smsConfig.api_key))
            }
            if (shouldPersistConfigValue(smsConfig.username)) {
                saveOperations.push(globalThis.electronAPI.settings.saveSecureConfig('sms_api_secret', smsConfig.username))
            }
            if (shouldPersistConfigValue(smsConfig.sender_id)) {
                saveOperations.push(globalThis.electronAPI.settings.saveSecureConfig('sms_sender_id', smsConfig.sender_id))
            }

            const saveResults = (await Promise.all(saveOperations)).map((result) =>
                normalizeSecureSaveResult(result, 'Failed to persist SMS configuration')
            )
            if (saveResults.some((saved) => !saved)) {
                throw new Error('One or more SMS configuration values were not persisted')
            }
            showToast('SMS Gateway settings saved securely', 'success')
        } catch (error) {
            console.error('Failed to save SMS settings:', error)
            showToast(error instanceof Error ? error.message : 'Failed to save SMS settings', 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleSaveSMTP = async () => {
        setLoading(true)
        try {
            const saveOperations: Promise<unknown>[] = []

            if (shouldPersistConfigValue(smtpConfig.host)) {
                saveOperations.push(globalThis.electronAPI.settings.saveSecureConfig('smtp_host', smtpConfig.host))
            }
            if (shouldPersistConfigValue(smtpConfig.port)) {
                saveOperations.push(globalThis.electronAPI.settings.saveSecureConfig('smtp_port', smtpConfig.port))
            }
            if (shouldPersistConfigValue(smtpConfig.user)) {
                saveOperations.push(globalThis.electronAPI.settings.saveSecureConfig('smtp_user', smtpConfig.user))
            }
            if (shouldPersistConfigValue(smtpConfig.pass)) {
                saveOperations.push(globalThis.electronAPI.settings.saveSecureConfig('smtp_pass', smtpConfig.pass))
            }
            if (saveOperations.length === 0) {
                showToast('No SMTP changes to save', 'warning')
                return
            }

            const saveResults = (await Promise.all(saveOperations)).map((result) =>
                normalizeSecureSaveResult(result, 'Failed to persist SMTP configuration')
            )
            if (saveResults.some((saved) => !saved)) {
                throw new Error('One or more SMTP configuration values were not persisted')
            }
            showToast('SMTP settings saved securely', 'success')
        } catch (error) {
            console.error('Failed to save SMTP settings:', error)
            showToast(error instanceof Error ? error.message : 'Failed to save SMTP settings', 'error')
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
                <SmsGatewayCard
                    smsConfig={smsConfig}
                    setSmsConfig={setSmsConfig}
                    showKeys={showKeys}
                    setShowKeys={setShowKeys}
                    onSave={handleSaveSMS}
                    loading={loading}
                />

                <SmtpConfigCard
                    smtpConfig={smtpConfig}
                    setSmtpConfig={setSmtpConfig}
                    showKeys={showKeys}
                    setShowKeys={setShowKeys}
                    onSave={handleSaveSMTP}
                    loading={loading}
                />
            </div>
        </div>
    )
}
