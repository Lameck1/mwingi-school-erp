import { Save, Loader2 } from 'lucide-react'
import { type Dispatch, type SetStateAction } from 'react'

import { type NewYearData } from './useSettingsPage'
import { Modal } from '../../components/ui/Modal'

interface AcademicYearModalProps {
    isOpen: boolean
    onClose: () => void
    newYearData: NewYearData
    setNewYearData: Dispatch<SetStateAction<NewYearData>>
    handleCreateYear: () => void
    saving: boolean
}

export function AcademicYearModal({ isOpen, onClose, newYearData, setNewYearData, handleCreateYear, saving }: Readonly<AcademicYearModalProps>) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Establish New Academic Cycle"
            size="sm"
        >
            <div className="space-y-6">
                <div className="space-y-2">
                    <label htmlFor="new-year-name" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Cycle Name</label>
                    <input
                        id="new-year-name"
                        type="text"
                        className="input w-full"
                        placeholder="e.g. Academic Year 2025"
                        value={newYearData.year_name}
                        onChange={e => setNewYearData(prev => ({ ...prev, year_name: e.target.value }))}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label htmlFor="new-year-start-date" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Start Date</label>
                        <input
                            id="new-year-start-date"
                            type="date"
                            title="Start Date"
                            className="input w-full"
                            value={newYearData.start_date}
                            onChange={e => setNewYearData(prev => ({ ...prev, start_date: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="new-year-end-date" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">End Date</label>
                        <input
                            id="new-year-end-date"
                            type="date"
                            title="End Date"
                            className="input w-full"
                            value={newYearData.end_date}
                            onChange={e => setNewYearData(prev => ({ ...prev, end_date: e.target.value }))}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-secondary/20 rounded-xl border border-border/20">
                    <input
                        type="checkbox"
                        id="is_current"
                        className="w-4 h-4 rounded border-border/20 text-primary focus:ring-primary/20 bg-background"
                        checked={newYearData.is_current}
                        onChange={e => setNewYearData(prev => ({ ...prev, is_current: e.target.checked }))}
                    />
                    <label htmlFor="is_current" className="text-sm font-bold text-foreground/60 select-none">Set as Active Current Session</label>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={onClose} className="btn btn-secondary px-6">Cancel</button>
                    <button
                        type="button"
                        onClick={handleCreateYear}
                        disabled={saving}
                        className="btn btn-primary px-8 flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>Create Cycle</span>
                    </button>
                </div>
            </div>
        </Modal>
    )
}
