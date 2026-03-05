import { type ChangeEvent } from 'react'
import { Heart, Phone, Mail, MapPin } from 'lucide-react'

import { type StudentFormData } from './useStudentForm'

interface GuardianRegistrySectionProps {
    formData: StudentFormData
    handleChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
}

export function GuardianRegistrySection({ formData, handleChange }: Readonly<GuardianRegistrySectionProps>) {
    return (
        <div className="card animate-slide-up delay-100">
            <div className="flex items-center gap-3 mb-8 border-b border-border/20 pb-4">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <Heart className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Guardian/Family Registry</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label htmlFor="student-guardian-name" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Primary Guardian Name</label>
                    <input id="student-guardian-name" name="guardian_name" value={formData.guardian_name} onChange={handleChange}
                        className="input border-border/20" placeholder="Enter full name" />
                </div>

                <div>
                    <label htmlFor="student-guardian-relationship" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Guardian Relationship</label>
                    <input
                        id="student-guardian-relationship"
                        name="guardian_relationship"
                        value={formData.guardian_relationship}
                        onChange={handleChange}
                        required
                        className="input border-border/20"
                        placeholder="e.g. Parent, Aunt, Uncle"
                    />
                </div>

                <div>
                    <label htmlFor="student-guardian-phone" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Contact Phone</label>
                    <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                        <input id="student-guardian-phone" name="guardian_phone" type="tel" value={formData.guardian_phone} onChange={handleChange}
                            className="input pl-11 border-border/20" placeholder="e.g. 0712 XXX XXX" />
                    </div>
                </div>

                <div className="md:col-span-2">
                    <label htmlFor="student-guardian-email" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-2 ml-1">Email (Optional)</label>
                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                        <input id="student-guardian-email" name="guardian_email" type="email" value={formData.guardian_email} onChange={handleChange}
                            className="input pl-11 border-border/20" placeholder="guardian@example.com" />
                    </div>
                </div>

                <div className="md:col-span-2">
                    <label htmlFor="student-address" className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest block mb-2 ml-1">Residential Address</label>
                    <div className="relative">
                        <MapPin className="absolute left-4 top-4 w-4 h-4 text-foreground/40" />
                        <textarea id="student-address" name="address" value={formData.address} onChange={handleChange}
                            className="input pl-11 border-border/40 focus:border-primary/50 transition-all min-h-[100px] font-medium" placeholder="Village, Town, Street details..." />
                    </div>
                </div>
            </div>
        </div>
    )
}
