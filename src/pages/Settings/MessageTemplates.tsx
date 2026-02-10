import {
    Mail, MessageSquare, Plus, Save,
    Eye, Loader2
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../stores'

import type { MessageTemplate } from '../../types/electron-api/MessagingAPI'

type Template = MessageTemplate

export default function MessageTemplates() {
    const { user } = useAuthStore()
    const { showToast } = useToast()
    const [templates, setTemplates] = useState<Template[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showTemplateModal, setShowTemplateModal] = useState(false)
    const [editingTemplate, setEditingTemplate] = useState<Partial<Template>>({
        template_type: 'SMS',
        category: 'GENERAL'
    })

    const loadTemplates = useCallback(async () => {
        setLoading(true)
        try {
            const data = await window.electronAPI.getNotificationTemplates()
            setTemplates(data)
        } catch (error) {
            console.error('Failed to load templates:', error)
            showToast('Failed to load message templates', 'error')
        } finally {
            setLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        void loadTemplates()
    }, [loadTemplates])

    const handleSaveTemplate = async () => {
        if (!user) {return}
        if (!editingTemplate.template_name || !editingTemplate.body) {
            showToast('Name and body are required', 'error')
            return
        }

        setSaving(true)
        try {
            const payload: Omit<MessageTemplate, 'id' | 'variables' | 'is_active'> = {
                template_name: editingTemplate.template_name,
                template_type: editingTemplate.template_type || 'SMS',
                category: editingTemplate.category || 'GENERAL',
                subject: editingTemplate.subject ?? null,
                body: editingTemplate.body
            }

            const result = await window.electronAPI.createNotificationTemplate(payload, user.id)
            if (result.success) {
                setShowTemplateModal(false)
                setEditingTemplate({ template_type: 'SMS', category: 'GENERAL' })
                await loadTemplates()
                showToast('Template created successfully', 'success')
            } else {
                showToast(result.errors?.join(', ') || 'Failed to create template', 'error')
            }
        } catch (error) {
            console.error('Failed to save template:', error)
            showToast('An error occurred while saving', 'error')
        } finally {
            setSaving(false)
        }
    }

    const renderTemplates = () => {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center py-24 gap-4 bg-secondary/5 rounded-3xl border border-dashed border-border/40">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-xs font-bold uppercase tracking-widest text-foreground/40">Loading Templates...</p>
                </div>
            )
        }

        if (templates.length === 0) {
            return (
                <div className="text-center py-24 bg-secondary/5 rounded-3xl border border-dashed border-border/40">
                    <MessageSquare className="w-16 h-16 mx-auto mb-4 text-foreground/10" />
                    <p className="text-foreground/40 font-medium italic">No templates found. Start by creating one.</p>
                </div>
            )
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map(template => (
                    <div key={template.id} className="premium-card group relative hover:border-primary/30 transition-all duration-300">
                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-2 rounded-lg bg-secondary/80 hover:bg-primary/20 text-foreground hover:text-primary transition-all" type="button" aria-label={`Preview ${template.template_name}`}>
                                <Eye className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-4 mb-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner ${template.template_type === 'SMS'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : 'bg-indigo-500/10 text-indigo-500'
                                }`}>
                                {template.template_type === 'SMS' ? <MessageSquare className="w-5 h-5" /> : <Mail className="w-5 h-5" />}
                            </div>
                            <div>
                                <h4 className="font-bold text-foreground truncate max-w-[150px]">{template.template_name}</h4>
                                <span className="text-[10px] font-bold tracking-widest uppercase bg-secondary/50 px-2 py-0.5 rounded-md text-foreground/40 border border-border/20">
                                    {template.category}
                                </span>
                            </div>
                        </div>

                        {template.subject && (
                            <p className="text-xs font-bold text-foreground/60 mb-2 truncate">Subject: {template.subject}</p>
                        )}

                        <div className="bg-background/40 p-3 rounded-xl border border-border/10">
                            <p className="font-mono text-[11px] text-foreground/50 line-clamp-4 leading-relaxed italic">
                                "{template.body}"
                            </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-1.5">
                            {template.variables.map(v => (
                                <span key={v} className="text-[9px] font-mono bg-primary/5 text-primary px-2 py-0.5 rounded-md border border-primary/10">
                                    {`{{${v}}}`}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-slide-up">
            <div className="flex justify-between items-center bg-secondary/10 p-4 rounded-2xl border border-border/20">
                <div>
                    <h3 className="text-xl font-bold text-foreground">Message Templates</h3>
                    <p className="text-sm text-foreground/50 italic">Configure automated SMS and Email responses</p>
                </div>
                <button
                    onClick={() => {
                        setEditingTemplate({ template_type: 'SMS', category: 'GENERAL' })
                        setShowTemplateModal(true)
                    }}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    New Template
                </button>
            </div>

            {renderTemplates()}

            <Modal
                isOpen={showTemplateModal}
                onClose={() => setShowTemplateModal(false)}
                title="Create Notification Template"
            >
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="template-name" className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest ml-1">Template Name</label>
                            <input
                                id="template-name"
                                type="text"
                                value={editingTemplate.template_name || ''}
                                onChange={(e) => setEditingTemplate({ ...editingTemplate, template_name: e.target.value })}
                                className="input w-full bg-secondary/30"
                                placeholder="e.g. Fee Balance Reminder"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="template-category" className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest ml-1">Category</label>
                            <select
                                id="template-category"
                                value={editingTemplate.category || 'GENERAL'}
                                onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })}
                                className="input w-full bg-secondary/30"
                            >
                                <option value="GENERAL" className="bg-background">General</option>
                                <option value="FEE_REMINDER" className="bg-background">Fee Reminder</option>
                                <option value="PAYMENT_RECEIPT" className="bg-background">Payment Receipt</option>
                                <option value="ATTENDANCE" className="bg-background">Attendance Alert</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest ml-1">Delivery Channel</p>
                        <div className="flex gap-6 p-1 bg-secondary/30 rounded-xl w-fit">
                            <button
                                type="button"
                                onClick={() => setEditingTemplate({ ...editingTemplate, template_type: 'SMS' })}
                                className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${editingTemplate.template_type === 'SMS' ? 'bg-background text-primary shadow-sm' : 'text-foreground/40 hover:text-foreground'}`}
                            >
                                <MessageSquare className="w-4 h-4" /> SMS
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditingTemplate({ ...editingTemplate, template_type: 'EMAIL' })}
                                className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${editingTemplate.template_type === 'EMAIL' ? 'bg-background text-primary shadow-sm' : 'text-foreground/40 hover:text-foreground'}`}
                            >
                                <Mail className="w-4 h-4" /> Email
                            </button>
                        </div>
                    </div>

                    {editingTemplate.template_type === 'EMAIL' && (
                        <div className="space-y-2 animate-in slide-in-from-top-2">
                            <label htmlFor="template-subject" className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest ml-1">Email Subject</label>
                            <input
                                id="template-subject"
                                type="text"
                                value={editingTemplate.subject || ''}
                                onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                                className="input w-full bg-secondary/30"
                                placeholder="Enter message subject"
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <label htmlFor="template-body" className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest ml-1">Message Body</label>
                        <textarea
                            id="template-body"
                            rows={6}
                            value={editingTemplate.body || ''}
                            onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                            className="input w-full font-mono text-sm bg-secondary/30 min-h-[150px]"
                            placeholder="Type your message here... Use {{variable}} for dynamic data"
                        />
                        <div className="p-3 bg-primary/5 rounded-xl border border-primary/10">
                            <p className="text-[10px] font-bold text-primary mb-1 uppercase tracking-tight">Available Dynamic Variables</p>
                            <div className="flex flex-wrap gap-2 uppercase font-mono text-[9px] text-foreground/60">
                                <span>{"{{student_name}}"}</span> • <span>{"{{guardian_name}}"}</span> • <span>{"{{balance}}"}</span> • <span>{"{{date}}"}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border/20">
                        <button type="button" onClick={() => setShowTemplateModal(false)} className="btn btn-secondary px-8">Discard</button>
                        <button type="button" onClick={handleSaveTemplate} disabled={saving} className="btn btn-primary px-8 flex items-center gap-2 shadow-xl shadow-primary/20">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            <span>{saving ? 'Creating...' : 'Create Template'}</span>
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}

