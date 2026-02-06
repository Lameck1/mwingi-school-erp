import { useState, useEffect, useCallback } from 'react'
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend
} from 'recharts'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { StatCard } from '../../../components/patterns/StatCard'
import { Select } from '../../../components/ui/Select'
import { useToast } from '../../../contexts/ToastContext'
import { formatCurrency } from '../../../utils/format'
import { DollarSign, TrendingUp } from 'lucide-react'
import { ElectronAPI, Student, StudentCostResult } from '../../../types/electron-api'

export default function StudentCostAnalysis() {
    const { showToast } = useToast()
    const [, setLoading] = useState(false)
    const [students, setStudents] = useState<Student[]>([])
    const [selectedStudent, setSelectedStudent] = useState<string>('')
    const [costData, setCostData] = useState<StudentCostResult | null>(null)
    const [costVsRevenue, setCostVsRevenue] = useState<{ cost: number, revenue: number, subsidy: number } | null>(null)

    const loadStudents = useCallback(async () => {
        try {
            const data = await window.electronAPI.getStudents({ is_active: true })
            setStudents(data)
        } catch (error) {
            console.error(error)
        }
    }, [])

    const loadCostData = useCallback(async (studentId: number) => {
        setLoading(true)
        try {
            const termId = 1 // Default to Term 1 for now
            const academicYearId = 2026 // Default to 2026 for now

            const breakdown = await window.electronAPI.calculateStudentCost(studentId, termId, academicYearId)
            setCostData(breakdown)

            const vsRevenue = await window.electronAPI.getStudentCostVsRevenue(studentId, termId)
            setCostVsRevenue(vsRevenue)
        } catch (error) {
            console.error(error)
            showToast('Failed to calculate student cost', 'error')
        } finally {
            setLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        loadStudents()
    }, [loadStudents])

    useEffect(() => {
        if (selectedStudent) {
            loadCostData(parseInt(selectedStudent))
        }
    }, [selectedStudent, loadCostData])

    // Chart Data
    const pieData = costData ? [
        { name: 'Tuition', value: costData.breakdown.tuition_share },
        { name: 'Boarding', value: costData.breakdown.boarding_share },
        { name: 'Transport', value: costData.breakdown.transport_share },
        { name: 'Activity', value: costData.breakdown.activity_share },
        { name: 'Admin', value: costData.breakdown.admin_share }
    ].filter(d => d.value > 0) : []

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8']

    return (
        <div className="space-y-6">
            <PageHeader
                title="Student Cost Analysis"
                subtitle="Analyze per-student cost vs revenue"
                breadcrumbs={[{ label: 'Finance' }, { label: 'Cost Analysis' }]}
            />

            {/* Controls */}
            <div className="premium-card p-4">
                <div className="max-w-md">
                    <Select
                        label="Select Student"
                        value={selectedStudent}
                        onChange={(e) => setSelectedStudent(e.target.value)}
                        options={students.map(s => ({ value: s.id, label: `${s.admission_number} - ${s.first_name} ${s.last_name}` }))}
                        placeholder="Search student..."
                    />
                </div>
            </div>

            {selectedStudent && costData && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Key Metrics */}
                    <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <StatCard 
                            label="Total Cost Per Term" 
                            value={formatCurrency(costData.total_cost)} 
                            icon={DollarSign} 
                            color="text-red-500" 
                        />
                        <StatCard 
                            label="Revenue (Fees)" 
                            value={formatCurrency(costVsRevenue?.revenue || 0)} 
                            icon={DollarSign} 
                            color="text-green-500" 
                        />
                        <StatCard 
                            label="Subsidy / Deficit" 
                            value={formatCurrency((costVsRevenue?.revenue || 0) - costData.total_cost)} 
                            icon={TrendingUp} 
                            color={(costVsRevenue?.revenue || 0) - costData.total_cost >= 0 ? "text-green-500" : "text-red-500"} 
                        />
                    </div>

                    {/* Breakdown Table */}
                    <div className="lg:col-span-2 premium-card">
                        <h3 className="text-lg font-bold mb-4">Cost Components Breakdown</h3>
                        <table className="w-full text-left">
                            <thead className="border-b border-border/10">
                                <tr>
                                    <th className="py-2">Component</th>
                                    <th className="py-2 text-right">Amount</th>
                                    <th className="py-2 text-right">% of Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10">
                                {pieData.map((item, index) => (
                                    <tr key={index}>
                                        <td className="py-3">{item.name}</td>
                                        <td className="py-3 text-right">{formatCurrency(item.value)}</td>
                                        <td className="py-3 text-right">{((item.value / costData.total_cost) * 100).toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t border-border/20 font-bold">
                                <tr>
                                    <td className="py-3">Total</td>
                                    <td className="py-3 text-right">{formatCurrency(costData.total_cost)}</td>
                                    <td className="py-3 text-right">100%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Pie Chart */}
                    <div className="lg:col-span-1 premium-card flex flex-col items-center">
                        <h3 className="text-lg font-bold mb-4">Cost Distribution</h3>
                        <div className="w-full h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {pieData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
