import { Save, Loader2 } from 'lucide-react'

import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'

import { FeeMatrixSection } from './FeeStructure/FeeMatrixSection'
import { FeeStructureFilters } from './FeeStructure/FeeStructureFilters'
import { useFeeStructure } from './FeeStructure/useFeeStructure'

export default function FeeStructure() {
    const d = useFeeStructure()

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Fee Structure' }]} />
                    <h1 className="text-xl md:text-3xl font-bold text-foreground font-heading">Fee Structure</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Manage fee amounts per class and term</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={d.handleGenerateInvoices}
                        disabled={d.generating}
                        className="btn btn-secondary flex items-center gap-2"
                        title="Generate invoices for all students based on this structure"
                    >
                        {d.generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Batch Invoice
                    </button>
                    <button
                        onClick={d.handleSave}
                        disabled={d.saving}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        {d.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>

            <FeeStructureFilters
                years={d.years}
                terms={d.terms}
                selectedYear={d.selectedYear}
                selectedTerm={d.selectedTerm}
                onYearChange={d.handleYearChange}
                onTermChange={d.setSelectedTerm}
            />

            <FeeMatrixSection
                loading={d.loading}
                categories={d.categories}
                streams={d.streams}
                structure={d.structure}
                onAmountChange={d.handleAmountChange}
                showNewCategory={d.showNewCategory}
                onToggleNewCategory={d.setShowNewCategory}
                newCategoryName={d.newCategoryName}
                onNewCategoryNameChange={d.setNewCategoryName}
                onCreateCategory={d.handleCreateCategory}
            />
        </div>
    )
}
