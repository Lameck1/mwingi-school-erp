import { getDatabase } from '../../database'

export interface StudentCost {
    student_id: number
    term_id: number
    academic_year_id: number
    total_cost: number
    breakdown: CostBreakdown
}

export interface CostBreakdown {
    tuition_share: number
    boarding_share: number
    transport_share: number
    activity_share: number
    admin_share: number
    other_share: number
}

export class StudentCostService {
    private get db() {
        return getDatabase()
    }

    async calculateStudentCost(studentId: number, termId: number, academicYearId: number): Promise<StudentCost> {
        // 1. Get student details (boarding status, transport usage, activities)
        const student = this.db.prepare(`
            SELECT s.*, e.stream_id, e.student_type 
            FROM student s
            JOIN enrollment e ON s.id = e.student_id
            WHERE s.id = ? AND e.term_id = ? AND e.academic_year_id = ?
        `).get(studentId, termId, academicYearId) as unknown

        if (!student) throw new Error('Student not found or not enrolled in this term')

        // 2. Calculate Boarding Cost (if boarder)
        let boardingCost = 0
        if (student.student_type === 'BOARDER') {
             // Get average boarding cost per student from BoardingCostService logic
             // For now, we query the boarding_expense table and divide by total boarders
             const totalBoardingExpense = this.db.prepare(`
                SELECT SUM(amount) as total FROM boarding_expense 
                WHERE expense_date BETWEEN ? AND ? -- Term dates need to be fetched
             `).get('2026-01-01', '2026-04-01') as { total: number } // Mock dates
             
             // In real impl, we'd get term dates first.
             // Simplified: Get snapshot if available
             const snapshot = this.db.prepare(`
                SELECT * FROM student_cost_snapshot 
                WHERE academic_year = ? AND term = ?
             `).get(2026, 1) as unknown // Mock IDs

             if (snapshot) {
                 boardingCost = 25000 // Mock from snapshot logic
             }
        }

        // 3. Calculate Transport Cost (if uses transport)
        let transportCost = 0
        const transportAssignment = this.db.prepare(`
            SELECT * FROM student_route_assignment 
            WHERE student_id = ? AND is_active = 1
        `).get(studentId) as unknown

        if (transportAssignment) {
            // Get specific route cost per student
            // Simplified logic
            transportCost = 15000 
        }

        // 4. Activity Cost (CBC Strands)
        // Get strands student participates in
        const activityCost = 0
        // ... logic to sum strand expenses / students in strand

        // 5. General Admin/Tuition Cost (Overhead / Total Students)
        const overheadCost = 10000 // Mock

        const total = boardingCost + transportCost + activityCost + overheadCost

        return {
            student_id: studentId,
            term_id: termId,
            academic_year_id: academicYearId,
            total_cost: total,
            breakdown: {
                tuition_share: overheadCost * 0.4,
                boarding_share: boardingCost,
                transport_share: transportCost,
                activity_share: activityCost,
                admin_share: overheadCost * 0.6,
                other_share: 0
            }
        }
    }

    async getCostBreakdown(studentId: number, termId: number): Promise<CostBreakdown> {
        // Implementation would call calculateStudentCost
        // Mocking for now as calculateStudentCost needs proper Term date logic
        return {
            tuition_share: 5000,
            boarding_share: 15000,
            transport_share: 8000,
            activity_share: 2000,
            admin_share: 3000,
            other_share: 1000
        }
    }

    async getCostVsRevenue(studentId: number, termId: number): Promise<{ cost: number, revenue: number, subsidy: number }> {
        // 1. Get Cost
        const cost = (await this.getCostBreakdown(studentId, termId))
        const totalCost = Object.values(cost).reduce((a, b) => a + b, 0)

        // 2. Get Revenue (Fees Billed/Paid)
        // Check invoice for this term
        const invoice = this.db.prepare(`
            SELECT total_amount FROM fee_invoice 
            WHERE student_id = ? AND term_id = ?
        `).get(studentId, termId) as { total_amount: number }

        const revenue = (invoice?.total_amount || 0) / 100

        return {
            cost: totalCost,
            revenue,
            subsidy: Math.max(0, totalCost - revenue)
        }
    }

    async getAverageCostPerStudent(grade: number, termId: number): Promise<number> {
        // Query snapshot or calculate aggregate
        return 35000 // Mock
    }

    async getCostTrendAnalysis(studentId: number, periods: number): Promise<unknown[]> {
        return [
            { period: 'Term 1 2025', cost: 32000 },
            { period: 'Term 2 2025', cost: 34000 },
            { period: 'Term 3 2025', cost: 33000 },
        ]
    }
}


