import { PageHeader } from '../../components/patterns/PageHeader'

import { AssignAwardSection } from './AwardsManagement/AssignAwardSection'
import { AwardsListSection } from './AwardsManagement/AwardsListSection'
import { RejectAwardModal } from './AwardsManagement/RejectAwardModal'
import { useAwardsManagement } from './AwardsManagement/useAwardsManagement'

const AwardsManagement = () => {
    const d = useAwardsManagement()

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Awards Management"
                subtitle="Manage student awards and recognitions"
                breadcrumbs={[{ label: 'Academics', href: '/academics' }, { label: 'Awards' }]}
            />

            {/* Award Categories */}
            <div className="premium-card">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-semibold">Award Categories</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {d.categories.slice(0, 8).map(cat => (
                        <div key={cat.id} className="p-4 rounded-lg bg-secondary/50 border border-border">
                            <p className="font-semibold text-sm">{cat.name}</p>
                            <p className="text-xs text-foreground/60 mt-1">{cat.category_type.replaceAll('_', ' ')}</p>
                        </div>
                    ))}
                </div>
            </div>

            <AssignAwardSection
                showForm={d.showForm}
                setShowForm={d.setShowForm}
                selectedStudent={d.selectedStudent}
                setSelectedStudent={d.setSelectedStudent}
                selectedCategory={d.selectedCategory}
                setSelectedCategory={d.setSelectedCategory}
                students={d.students}
                categories={d.categories}
                loading={d.loading}
                handleAwardStudent={d.handleAwardStudent}
            />

            <AwardsListSection
                filteredAwards={d.filteredAwards}
                categoryMap={d.categoryMap}
                filterStatus={d.filterStatus}
                setFilterStatus={d.setFilterStatus}
                filterCategory={d.filterCategory}
                setFilterCategory={d.setFilterCategory}
                categories={d.categories}
                canApprove={d.canApprove}
                loading={d.loading}
                handleApproveAward={d.handleApproveAward}
                openRejectModal={d.openRejectModal}
                handleDeleteAward={d.handleDeleteAward}
            />

            <RejectAwardModal
                showRejectModal={d.showRejectModal}
                setShowRejectModal={d.setShowRejectModal}
                rejectionReason={d.rejectionReason}
                setRejectionReason={d.setRejectionReason}
                handleRejectAward={d.handleRejectAward}
                loading={d.loading}
            />
        </div>
    )
}

export default AwardsManagement
