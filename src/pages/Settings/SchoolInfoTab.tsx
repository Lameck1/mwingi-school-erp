import { type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { School, Image as ImageIcon, Loader2, Upload, Trash2 } from 'lucide-react'

import { type SettingsFormData } from './useSettingsPage'

interface SchoolInfoTabProps {
    saving: boolean
    logoDataUrl: string | null
    logoInputRef: RefObject<HTMLInputElement | null>
    handleLogoSelect: (e: ChangeEvent<HTMLInputElement>) => void
    handleRemoveLogo: () => void
    formData: SettingsFormData
    setFormData: Dispatch<SetStateAction<SettingsFormData>>
}

export function SchoolInfoTab({ saving, logoDataUrl, logoInputRef, handleLogoSelect, handleRemoveLogo, formData, setFormData }: Readonly<SchoolInfoTabProps>) {
    return (
        <div className="card animate-slide-up">
            <div className="flex items-center gap-3 mb-8 pb-3 border-b border-border/10">
                <div className="p-2 bg-primary/10 rounded-lg">
                    <School className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground font-heading">Identity &amp; Localization</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="md:col-span-2 flex flex-col sm:flex-row items-center gap-6 p-6 bg-secondary/10 rounded-3xl border border-border/20">
                    <div className="relative group">
                        <div className="w-32 h-32 rounded-2xl bg-background border-2 border-dashed border-border/40 flex items-center justify-center overflow-hidden transition-all group-hover:border-primary/40 relative">
                            {logoDataUrl ? (
                                <img src={logoDataUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                            ) : (
                                <ImageIcon className="w-12 h-12 text-foreground/5" />
                            )}
                            {saving && (
                                <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 space-y-3">
                        <h3 className="text-sm font-bold text-foreground">School Logo</h3>
                        <p className="text-xs text-foreground/40 leading-relaxed font-medium"> This logo will appear on official report cards, invoices, and other generated documents. Recommended: Clear PNG with transparent background. Max 5MB. </p>
                        <div className="flex flex-wrap gap-2">
                            <input
                                type="file"
                                ref={logoInputRef}
                                onChange={handleLogoSelect}
                                accept="image/*"
                                className="hidden"
                                aria-label="Upload school logo"
                            />
                            <button
                                onClick={() => logoInputRef.current?.click()}
                                disabled={saving}
                                className="btn btn-secondary px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                            >
                                <Upload className="w-3 h-3" />
                                {logoDataUrl ? 'Change Logo' : 'Upload Logo'}
                            </button>
                            {logoDataUrl && (
                                <button
                                    onClick={handleRemoveLogo}
                                    disabled={saving}
                                    className="btn hover:bg-destructive/10 text-destructive px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border border-destructive/20"
                                >
                                    <Trash2 className="w-3 h-3" />
                                    Remove
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="school_type">Institution Type *</label>
                    <select
                        id="school_type"
                        value={formData.school_type}
                        onChange={(e) => setFormData(prev => ({ ...prev, school_type: e.target.value }))}
                        className="input w-full"
                    >
                        <option value="PUBLIC">Public School (MoE Compliant)</option>
                        <option value="PRIVATE">Private Institution</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="school_name">Official School Name *</label>
                    <input id="school_name" type="text" value={formData.school_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, school_name: e.target.value }))}
                        className="input w-full" placeholder="e.g. Mwingi Adventist School" />
                </div>
                <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="school_motto">Operating Motto</label>
                    <input id="school_motto" type="text" value={formData.school_motto}
                        onChange={(e) => setFormData(prev => ({ ...prev, school_motto: e.target.value }))}
                        className="input w-full" placeholder="e.g. Excellence in Service" />
                </div>
                <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="address">Physical Address</label>
                    <textarea id="address" value={formData.address}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                        className="input w-full" rows={3} placeholder="Mwingi-Garissa Rd, Box 123..." />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="phone">Contact Hotline</label>
                    <input id="phone" type="tel" value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        className="input w-full" placeholder="+254 700 000000" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="email">Administrative Email</label>
                    <input id="email" type="email" value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        className="input w-full" placeholder="admin@school.ac.ke" />
                </div>
            </div>
        </div>
    )
}
