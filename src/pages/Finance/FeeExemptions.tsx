import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'

import { ExemptionStatsCards } from './FeeExemptions/ExemptionStatsCards'
import { ExemptionsTable } from './FeeExemptions/ExemptionsTable'
import { GrantExemptionModal } from './FeeExemptions/GrantExemptionModal'
import { RevokeExemptionModal } from './FeeExemptions/RevokeExemptionModal'
import { useFeeExemptions } from './FeeExemptions/useFeeExemptions'

export default function FeeExemptions() {
    const d = useFeeExemptions()

    if (d.loading) {
        return <div className="p-6 text-center">Loading...</div>
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Fee Exemptions' }]} />
                    <h1 className="text-2xl font-bold text-foreground">Fee Exemptions</h1>
                    <p className="text-muted-foreground">Manage student fee exemptions and scholarships</p>
                </div>
                <button
                    onClick={() => d.setShowModal(true)}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80"
                >
                    + Grant Exemption
                </button>
            </div>

            <ExemptionStatsCards stats={d.stats} />

            {/* Filters */}
            <div className="flex gap-4">
                <select
                    value={d.statusFilter}
                    onChange={(e) => d.setStatusFilter(e.target.value as 'ACTIVE' | 'REVOKED' | 'all')}
                    className="px-4 py-2 border border-border rounded-lg bg-input text-foreground"
                    aria-label="Filter by status"
                >
                    <option value="all">All Status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="REVOKED">Revoked</option>
                </select>
            </div>

            <ExemptionsTable
                exemptions={d.exemptions}
                setSelectedExemption={d.setSelectedExemption}
                setShowRevokeModal={d.setShowRevokeModal}
            />

            <GrantExemptionModal
                showModal={d.showModal}
                setShowModal={d.setShowModal}
                formData={d.formData}
                setFormData={d.setFormData}
                academicYears={d.academicYears}
                terms={d.terms}
                feeCategories={d.feeCategories}
                selectedStudent={d.selectedStudent}
                setSelectedStudent={d.setSelectedStudent}
                studentSearch={d.studentSearch}
                setStudentSearch={d.setStudentSearch}
                filteredStudents={d.filteredStudents}
                setFilteredStudents={d.setFilteredStudents}
                handleCreate={d.handleCreate}
                handleYearChange={d.handleYearChange}
                handleSelectStudent={d.handleSelectStudent}
            />

            <RevokeExemptionModal
                showRevokeModal={d.showRevokeModal}
                setShowRevokeModal={d.setShowRevokeModal}
                selectedExemption={d.selectedExemption}
                setSelectedExemption={d.setSelectedExemption}
                revokeReason={d.revokeReason}
                setRevokeReason={d.setRevokeReason}
                handleRevoke={d.handleRevoke}
            />
        </div>
    )
}
