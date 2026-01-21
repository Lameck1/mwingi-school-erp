import { useEffect, useState } from 'react'
import { Save, Plus, Loader2 } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'

export default function FeeStructure() {
    const { showToast } = useToast()
    
    const [years, setYears] = useState<any[]>([])
    const [terms, setTerms] = useState<any[]>([])
    const [streams, setStreams] = useState<any[]>([])
    const [categories, setCategories] = useState<any[]>([])
    
    const [selectedYear, setSelectedYear] = useState('')
    const [selectedTerm, setSelectedTerm] = useState('')
    
    const [structure, setStructure] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [generating, setGenerating] = useState(false)

    // For new category
    const [showNewCategory, setShowNewCategory] = useState(false)
    const [newCategoryName, setNewCategoryName] = useState('')

    useEffect(() => {
        loadInitialData()
    }, [])

    useEffect(() => {
        if (selectedYear && selectedTerm) {
            loadStructure()
        }
    }, [selectedYear, selectedTerm])

    const loadInitialData = async () => {
        try {
            const [y, s, c] = await Promise.all([
                window.electronAPI.getAcademicYears(),
                window.electronAPI.getStreams(),
                window.electronAPI.getFeeCategories()
            ])
            setYears(y)
            setStreams(s)
            setCategories(c)

            // Auto-select current year/term if possible
            const currentYear = await window.electronAPI.getCurrentAcademicYear()
            if (currentYear) {
                setSelectedYear(currentYear.id.toString())
                const termList = await window.electronAPI.getTermsByYear(currentYear.id)
                setTerms(termList)
                const currentTerm = await window.electronAPI.getCurrentTerm()
                if (currentTerm) setSelectedTerm(currentTerm.id.toString())
                else if (termList.length > 0) setSelectedTerm(termList[0].id.toString())
            }
        } catch (error) {
            console.error(error)
            showToast('Failed to load initial data', 'error')
        }
    }

    const loadStructure = async () => {
        setLoading(true)
        try {
            const data = await window.electronAPI.getFeeStructure(Number(selectedYear), Number(selectedTerm))
            const map: Record<string, number> = {}
            data.forEach((item: any) => {
                const key = `${item.stream_id}-${item.student_type}-${item.fee_category_id}`
                map[key] = item.amount
            })
            setStructure(map)
        } catch (error) {
            console.error(error)
            showToast('Failed to load fee structure', 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleAmountChange = (streamId: number, studentType: string, categoryId: number, value: string) => {
        const key = `${streamId}-${studentType}-${categoryId}`
        setStructure(prev => ({ ...prev, [key]: Number(value) || 0 }))
    }

    const handleSave = async () => {
        if (!selectedYear || !selectedTerm) {
            showToast('Please select academic year and term', 'error')
            return
        }

        setSaving(true)
        try {
            const data = []
            for (const [key, amount] of Object.entries(structure)) {
                if (amount > 0) {
                    const [streamId, studentType, categoryId] = key.split('-')
                    data.push({
                        stream_id: Number(streamId),
                        student_type: studentType,
                        fee_category_id: Number(categoryId),
                        amount
                    })
                }
            }

            await window.electronAPI.saveFeeStructure(data, Number(selectedYear), Number(selectedTerm))
            showToast('Fee structure saved successfully', 'success')
        } catch (error) {
            console.error(error)
            showToast('Failed to save fee structure', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return
        try {
            await window.electronAPI.createFeeCategory(newCategoryName, '')
            setNewCategoryName('')
            setShowNewCategory(false)
            const c = await window.electronAPI.getFeeCategories()
            setCategories(c)
            showToast('Category created', 'success')
        } catch (error) {
            showToast('Failed to create category', 'error')
        }
    }

    const handleGenerateInvoices = async () => {
        // if (!confirm('This will generate invoices for all active students based on this structure. Are you sure?')) return

        setGenerating(true)
        try {
            const userStr = localStorage.getItem('school_erp_user')
            const parsed = userStr ? JSON.parse(userStr) : null
            const userId = (parsed && parsed.id) ? parsed.id : 1
            console.log('Generating invoices with UserID:', userId)

            const result = await window.electronAPI.generateBatchInvoices(Number(selectedYear), Number(selectedTerm), userId)
            console.log('Generate Result:', result)
            
            if (result.success) {
                showToast(`Successfully generated ${result.count} invoices`, 'success')
            } else {
                showToast(result.message || 'Failed to generate invoices', 'error')
            }
        } catch (error: any) {
            console.error('Generation Error:', error)
            showToast(`Error: ${error.message || 'Unknown error'}`, 'error')
        } finally {
            setGenerating(false)
        }
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Fee Structure</h1>
                    <p className="text-gray-500 mt-1">Manage fee amounts per class and term</p>
                </div>
                <div className="flex gap-2">
                     <button 
                        onClick={handleGenerateInvoices}
                        disabled={generating}
                        className="btn btn-secondary flex items-center gap-2"
                        title="Generate invoices for all students based on this structure"
                    >
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Batch Invoice
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>

            <div className="card mb-6 p-4">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                        <select 
                            value={selectedYear} 
                            onChange={e => {
                                setSelectedYear(e.target.value)
                                // Load terms for this year
                                window.electronAPI.getTermsByYear(Number(e.target.value)).then(setTerms)
                            }}
                            className="input w-48"
                            aria-label="Academic Year"
                        >
                            <option value="">Select Year</option>
                            {years.map(y => (
                                <option key={y.id} value={y.id}>{y.year_name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                        <select 
                            value={selectedTerm} 
                            onChange={e => setSelectedTerm(e.target.value)}
                            className="input w-48"
                            disabled={!selectedYear}
                            aria-label="Term"
                        >
                            <option value="">Select Term</option>
                            {terms.map(t => (
                                <option key={t.id} value={t.id}>{t.term_name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12">Loading...</div>
            ) : (
                <div className="card overflow-x-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-gray-900">Fee Matrix</h3>
                        <button 
                            onClick={() => setShowNewCategory(true)}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                        >
                            <Plus className="w-4 h-4" /> Add Category
                        </button>
                    </div>

                    {showNewCategory && (
                        <div className="mb-4 flex gap-2 items-center bg-blue-50 p-3 rounded-lg">
                            <input 
                                type="text" 
                                value={newCategoryName}
                                onChange={e => setNewCategoryName(e.target.value)}
                                placeholder="New Category Name (e.g. Swimming)"
                                className="input h-9"
                            />
                            <button onClick={handleCreateCategory} className="btn btn-primary btn-sm">Add</button>
                            <button onClick={() => setShowNewCategory(false)} className="text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
                        </div>
                    )}

                    <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-white z-10">Class / Stream</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-[120px] bg-white z-10">Type</th>
                                {categories.map(cat => (
                                    <th key={cat.id} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                                        {cat.category_name}
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Total</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {streams.map(stream => (
                                <>
                                    {['DAY_SCHOLAR', 'BOARDER'].map((type, idx) => (
                                        <tr key={`${stream.id}-${type}`} className={idx === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                                            {idx === 0 && (
                                                <td rowSpan={2} className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-inherit z-10 border-r">
                                                    {stream.stream_name}
                                                </td>
                                            )}
                                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500 sticky left-[120px] bg-inherit z-10 border-r">
                                                {type.replace('_', ' ')}
                                            </td>
                                            {categories.map(cat => {
                                                const key = `${stream.id}-${type}-${cat.id}`
                                                return (
                                                    <td key={cat.id} className="px-2 py-2 whitespace-nowrap">
                                                        <input 
                                                            type="number" 
                                                            min="0"
                                                            value={structure[key] || ''}
                                                            onChange={e => handleAmountChange(stream.id, type, cat.id, e.target.value)}
                                                            className="w-full text-right border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-1"
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                )
                                            })}
                                            <td className="px-4 py-2 whitespace-nowrap text-sm font-bold text-gray-900 text-right bg-gray-50">
                                                {categories.reduce((sum, cat) => {
                                                    const key = `${stream.id}-${type}-${cat.id}`
                                                    return sum + (structure[key] || 0)
                                                }, 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
