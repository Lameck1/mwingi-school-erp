import { BookOpen, Plus, Edit, Trash2, CheckCircle2, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../stores'
import { type AcademicSubject } from '../../types/electron-api/AcademicAPI'

type SubjectFormState = {
  code: string
  name: string
  curriculum: string
  is_compulsory: boolean
  is_active: boolean
}

const emptyForm: SubjectFormState = {
  code: '',
  name: '',
  curriculum: 'CBC',
  is_compulsory: true,
  is_active: true
}

function toBoolean(value: boolean | number | null | undefined): boolean {
  return value === true || value === 1
}

export default function SubjectManagement() {
  const { user } = useAuthStore()
  const { showToast } = useToast()
  const [subjects, setSubjects] = useState<AcademicSubject[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<AcademicSubject | null>(null)
  const [form, setForm] = useState<SubjectFormState>(emptyForm)

  const curriculumOptions = useMemo(() => ([
    { value: 'CBC', label: 'CBC' },
    { value: '8-4-4', label: '8-4-4' },
    { value: 'ECDE', label: 'ECDE' }
  ]), [])

  const loadSubjects = useCallback(async () => {
    setLoading(true)
    try {
      const data = await globalThis.electronAPI.getAcademicSubjectsAdmin()
      setSubjects(data || [])
    } catch (error) {
      console.error('Failed to load subjects:', error)
      showToast('Failed to load subjects', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void loadSubjects()
  }, [loadSubjects])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (subject: AcademicSubject) => {
    setEditing(subject)
    setForm({
      code: String(subject.code ?? '').toUpperCase(),
      name: String(subject.name ?? ''),
      curriculum: String(subject.curriculum ?? 'CBC'),
      is_compulsory: toBoolean(subject.is_compulsory),
      is_active: toBoolean(subject.is_active)
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!user?.id) {
      showToast('You must be signed in to manage subjects', 'error')
      return
    }

    if (!form.code.trim() || !form.name.trim() || !form.curriculum.trim()) {
      showToast('Code, name, and curriculum are required', 'error')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        await globalThis.electronAPI.updateAcademicSubject(editing.id, {
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          curriculum: form.curriculum,
          is_compulsory: form.is_compulsory,
          is_active: form.is_active
        }, user.id)
        showToast('Subject updated', 'success')
      } else {
        await globalThis.electronAPI.createAcademicSubject({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          curriculum: form.curriculum,
          is_compulsory: form.is_compulsory,
          is_active: form.is_active
        }, user.id)
        showToast('Subject created', 'success')
      }
      setShowModal(false)
      await loadSubjects()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save subject', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (subject: AcademicSubject, desired: boolean) => {
    if (!user?.id) {
      showToast('You must be signed in to manage subjects', 'error')
      return
    }
    if (!confirm(`${desired ? 'Activate' : 'Deactivate'} subject "${subject.name}"?`)) {return}
    setSaving(true)
    try {
      await globalThis.electronAPI.setAcademicSubjectActive(subject.id, desired, user.id)
      await loadSubjects()
      showToast(`Subject ${desired ? 'activated' : 'deactivated'}`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Action failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const renderSubjectsContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-xs font-bold uppercase tracking-widest text-foreground/40">Loading Subjects...</p>
        </div>
      )
    }

    if (subjects.length === 0) {
      return (
        <div className="text-center py-24 bg-secondary/5 rounded-3xl border border-dashed border-border/40 m-4">
          <BookOpen className="w-16 h-16 text-foreground/10 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-foreground/80 font-heading">No Subjects Found</h3>
          <p className="text-foreground/40 font-medium italic mb-6">Add subjects to enable allocations and exam workflows</p>
          <button onClick={openCreate} className="btn btn-secondary border-2 border-dashed px-8">Add First Subject</button>
        </div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr className="border-b border-border/40">
              <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Code</th>
              <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Name</th>
              <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Curriculum</th>
              <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Compulsory</th>
              <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Status</th>
              <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40 text-right px-6">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {subjects.map((subject) => {
              const active = toBoolean(subject.is_active)
              return (
                <tr key={subject.id} className="group hover:bg-secondary/20 transition-colors">
                  <td className="py-4">
                    <span className="font-mono text-xs font-bold text-primary/60">{subject.code}</span>
                  </td>
                  <td className="py-4">
                    <span className="font-bold text-foreground">{subject.name}</span>
                  </td>
                  <td className="py-4">
                    <span className="text-xs font-bold text-foreground/60 uppercase tracking-wide">{subject.curriculum}</span>
                  </td>
                  <td className="py-4">
                    <span className="text-xs font-semibold text-foreground/60">{toBoolean(subject.is_compulsory) ? 'Yes' : 'No'}</span>
                  </td>
                  <td className="py-4">
                    <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest flex items-center gap-2 w-fit border ${active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-sm shadow-emerald-500/10' : 'bg-destructive/10 text-destructive border-destructive/20'
                      }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-destructive'}`} />
                      {active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(subject)}
                        className="p-2.5 bg-background border border-border/40 hover:border-blue-500/50 hover:text-blue-500 rounded-xl transition-all shadow-sm"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {active ? (
                        <button
                          onClick={() => handleToggleActive(subject, false)}
                          className="p-2.5 bg-background border border-border/40 hover:border-destructive/50 hover:text-destructive rounded-xl transition-all shadow-sm"
                          disabled={saving}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleActive(subject, true)}
                          className="p-2.5 bg-background border border-border/40 hover:border-emerald-500/50 hover:text-emerald-500 rounded-xl transition-all shadow-sm"
                          disabled={saving}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Subject Management"
        subtitle="Maintain academic subjects and curriculum coverage"
        breadcrumbs={[{ label: 'Academics' }, { label: 'Subjects' }]}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="text-foreground/50 text-sm font-medium">
          Active subjects are available for allocations, marks entry, and analytics.
        </div>
        <button
          onClick={openCreate}
          className="btn btn-primary flex items-center gap-2 py-3 px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
        >
          <Plus className="w-5 h-5" />
          <span>Add Subject</span>
        </button>
      </div>

      <div className="card overflow-hidden transition-all duration-300">
        {renderSubjectsContent()}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Subject' : 'Add Subject'}
        size="sm"
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <label htmlFor="field-256" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Subject Code *</label>
            <input id="field-256"
              type="text"
              value={form.code}
              onChange={(e) => setForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
              className="input w-full bg-secondary/30"
              placeholder="e.g. C-MATH"
            />
          </div>

          <div className="space-y-3">
            <label htmlFor="field-267" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Subject Name *</label>
            <input id="field-267"
              type="text"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="input w-full bg-secondary/30"
              placeholder="e.g. Mathematics"
            />
          </div>

          <Select
            label="Curriculum"
            value={form.curriculum}
            onChange={(val) => setForm(prev => ({ ...prev, curriculum: String(val) }))}
            options={curriculumOptions}
          />

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/20 p-4 bg-secondary/10">
            <div>
              <p className="text-sm font-semibold text-foreground">Compulsory Subject</p>
              <p className="text-xs text-foreground/40">Controls default subject allocation expectations</p>
            </div>
            <button
              onClick={() => setForm(prev => ({ ...prev, is_compulsory: !prev.is_compulsory }))}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border ${form.is_compulsory ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-secondary/30 text-foreground/40 border-border/30'}`}
            >
              {form.is_compulsory ? 'Yes' : 'No'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/20 p-4 bg-secondary/10">
            <div>
              <p className="text-sm font-semibold text-foreground">Active Status</p>
              <p className="text-xs text-foreground/40">Inactive subjects are hidden from allocations</p>
            </div>
            <button
              onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border ${form.is_active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-destructive/10 text-destructive border-destructive/20'}`}
            >
              {form.is_active ? 'Active' : 'Inactive'}
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
            <button onClick={() => setShowModal(false)} className="btn btn-secondary px-6">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary px-8 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {editing ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
