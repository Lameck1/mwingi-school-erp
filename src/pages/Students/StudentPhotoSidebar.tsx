import { type ChangeEvent, type RefObject } from 'react'
import { Save, Loader2, Shield, Calendar, Camera, Trash2, Upload } from 'lucide-react'

interface StudentPhotoSidebarProps {
    photoDataUrl: string | null
    photoInputRef: RefObject<HTMLInputElement | null>
    onPhotoSelect: (e: ChangeEvent<HTMLInputElement>) => void
    onRemovePhoto: () => void
    saving: boolean
    isEdit: boolean
    onCancel: () => void
    notes: string
    onNotesChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}

export function StudentPhotoSidebar({ photoDataUrl, photoInputRef, onPhotoSelect, onRemovePhoto, saving, isEdit, onCancel, notes, onNotesChange }: Readonly<StudentPhotoSidebarProps>) {
    return (
        <div className="space-y-8">
            <div className="card animate-slide-up delay-200">
                <div className="flex flex-col items-center gap-6 mb-8">
                    <div className="relative group">
                        <div className="w-40 h-40 rounded-3xl bg-secondary/30 border-2 border-dashed border-border/40 flex items-center justify-center overflow-hidden transition-all group-hover:border-primary/40 relative shadow-inner">
                            {photoDataUrl ? (
                                <img src={photoDataUrl} alt="Student" className="w-full h-full object-cover" />
                            ) : (
                                <div className="flex flex-col items-center gap-2 opacity-20">
                                    <Camera className="w-12 h-12" />
                                    <span className="text-[8px] font-bold uppercase tracking-widest">No Photo</span>
                                </div>
                            )}
                            {saving && (
                                <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                </div>
                            )}
                        </div>
                        <input
                            type="file"
                            ref={photoInputRef}
                            onChange={onPhotoSelect}
                            accept="image/*"
                            className="hidden"
                            aria-label="Upload student photo"
                        />
                        <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            className="absolute -bottom-2 -right-2 p-3 bg-primary text-primary-foreground rounded-2xl shadow-xl hover:scale-110 active:scale-95 transition-all border-4 border-background"
                            title="Upload Photo"
                        >
                            <Upload className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="text-center">
                        <h3 className="text-sm font-bold text-foreground">Student Identification Photo</h3>
                        <p className="text-[10px] text-foreground/40 mt-1 font-medium">Capture or upload a clear frontal portrait</p>
                        {photoDataUrl && (
                            <button
                                type="button"
                                onClick={onRemovePhoto}
                                className="mt-3 text-[10px] font-bold text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1 mx-auto"
                            >
                                <Trash2 className="w-3 h-3" />
                                Remove Photo
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 mb-6 pt-6 border-t border-border/10">
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
                        onClick={onCancel}
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
                    value={notes}
                    onChange={onNotesChange}
                    className="input border-border/20 min-h-[150px] text-xs"
                    placeholder="Clinical history, fee arrangements, or special behavioral notes..."
                />
            </div>
        </div>
    )
}
