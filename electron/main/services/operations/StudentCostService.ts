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

interface StudentEnrollmentInfo {
    id: number
    student_type: string
    stream_id: number
    academic_year_id: number
    term_id: number
    [key: string]: unknown
}

interface StudentRouteAssignment {
    id: number
    student_id: number
    route_id: number
    is_active: number
}

interface SnapshotCosts {
    teachingCost: number
    facilitiesCost: number
    activitiesOverhead: number
    administrationCost: number
    overheadCost: number
    otherOverhead: number
}

export class StudentCostService {
    private get db() {
        return getDatabase()
    }

    private getAcademicYearValue(academicYearId: number): number {
        const row = this.db.prepare('SELECT year_name FROM academic_year WHERE id = ?').get(academicYearId) as { year_name?: string } | undefined
        const year = row?.year_name ? Number.parseInt(row.year_name, 10) : Number.NaN
        return Number.isFinite(year) ? year : new Date().getFullYear()
    }

    private getTermNumber(termId: number): number {
        const row = this.db.prepare('SELECT term_number FROM term WHERE id = ?').get(termId) as { term_number?: number } | undefined
        return row?.term_number ?? 1
    }

    private getStudentEnrollmentInfo(studentId: number, termId: number, academicYearId: number): StudentEnrollmentInfo {
        const student = this.db.prepare(`
            SELECT s.*, e.stream_id, e.student_type
            FROM student s
            JOIN enrollment e ON s.id = e.student_id
            WHERE s.id = ? AND e.term_id = ? AND e.academic_year_id = ?
        `).get(studentId, termId, academicYearId) as StudentEnrollmentInfo | undefined

        if (!student) {
            throw new Error('Student not found or not enrolled in this term')
        }

        return student
    }

    private getBoardingCost(
        student: StudentEnrollmentInfo,
        fiscalYear: number,
        termNumber: number,
        academicYearId: number,
        termId: number
    ): number {
        if (student.student_type !== 'BOARDER') {
            return 0
        }

        const totalBoardingExpenseRow = this.db.prepare(`
            SELECT COALESCE(SUM(amount_cents), 0) as total
            FROM boarding_expense
            WHERE fiscal_year = ? AND term = ?
        `).get(fiscalYear, termNumber) as { total: number }

        const boarderCountRow = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM enrollment
            WHERE academic_year_id = ? AND term_id = ? AND student_type = 'BOARDER' AND status = 'ACTIVE'
        `).get(academicYearId, termId) as { count: number }

        const boarderCount = boarderCountRow.count || 0
        if (boarderCount <= 0) {
            return 0
        }

        return Math.round((totalBoardingExpenseRow.total || 0) / boarderCount)
    }

    private getTransportCost(studentId: number, fiscalYear: number, termNumber: number): number {
        const transportAssignment = this.db.prepare(`
            SELECT * FROM student_route_assignment
            WHERE student_id = ? AND academic_year = ? AND term = ? AND is_active = 1
        `).get(studentId, fiscalYear, termNumber) as StudentRouteAssignment | undefined

        if (!transportAssignment) {
            return 0
        }

        const totalRouteExpenseRow = this.db.prepare(`
            SELECT COALESCE(SUM(amount_cents), 0) as total
            FROM transport_route_expense
            WHERE route_id = ? AND fiscal_year = ? AND term = ?
        `).get(transportAssignment.route_id, fiscalYear, termNumber) as { total: number }

        const routeStudentCountRow = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM student_route_assignment
            WHERE route_id = ? AND academic_year = ? AND term = ? AND is_active = 1
        `).get(transportAssignment.route_id, fiscalYear, termNumber) as { count: number }

        const routeCount = routeStudentCountRow.count || 0
        if (routeCount <= 0) {
            return 0
        }

        return Math.round((totalRouteExpenseRow.total || 0) / routeCount)
    }

    private getActivityCost(studentId: number, fiscalYear: number, termNumber: number): number {
        const participations = this.db.prepare(`
            SELECT cbc_strand_id
            FROM student_activity_participation
            WHERE student_id = ? AND academic_year = ? AND term = ? AND is_active = 1
        `).all(studentId, fiscalYear, termNumber) as { cbc_strand_id: number }[]

        let activityCost = 0

        for (const participation of participations) {
            const totalStrandExpenseRow = this.db.prepare(`
                SELECT COALESCE(SUM(amount_cents), 0) as total
                FROM cbc_strand_expense
                WHERE cbc_strand_id = ? AND fiscal_year = ? AND term = ?
            `).get(participation.cbc_strand_id, fiscalYear, termNumber) as { total: number }

            const strandStudentCountRow = this.db.prepare(`
                SELECT COUNT(*) as count
                FROM student_activity_participation
                WHERE cbc_strand_id = ? AND academic_year = ? AND term = ? AND is_active = 1
            `).get(participation.cbc_strand_id, fiscalYear, termNumber) as { count: number }

            const strandCount = strandStudentCountRow.count || 0
            if (strandCount > 0) {
                activityCost += Math.round((totalStrandExpenseRow.total || 0) / strandCount)
            }
        }

        return activityCost
    }

    private getSnapshotCosts(fiscalYear: number, termNumber: number): SnapshotCosts {
        const snapshot = this.db.prepare(`
            SELECT * FROM student_cost_snapshot
            WHERE academic_year = ? AND term = ?
        `).get(fiscalYear, termNumber) as {
            cost_per_student: number
            teaching_cost_per_student: number
            facilities_cost_per_student: number
            activities_cost_per_student: number
            administration_cost_per_student: number
        } | undefined

        const teachingCost = snapshot?.teaching_cost_per_student || 0
        const facilitiesCost = snapshot?.facilities_cost_per_student || 0
        const activitiesOverhead = snapshot?.activities_cost_per_student || 0
        const administrationCost = snapshot?.administration_cost_per_student || 0
        const overheadCost = snapshot?.cost_per_student || (teachingCost + facilitiesCost + activitiesOverhead + administrationCost)
        const otherOverhead = Math.max(0, overheadCost - (teachingCost + facilitiesCost + activitiesOverhead + administrationCost))

        return {
            teachingCost,
            facilitiesCost,
            activitiesOverhead,
            administrationCost,
            overheadCost,
            otherOverhead
        }
    }

    async calculateStudentCost(studentId: number, termId: number, academicYearId: number): Promise<StudentCost> {
        const student = this.getStudentEnrollmentInfo(studentId, termId, academicYearId)
        const fiscalYear = this.getAcademicYearValue(academicYearId)
        const termNumber = this.getTermNumber(termId)

        const boardingCost = this.getBoardingCost(student, fiscalYear, termNumber, academicYearId, termId)
        const transportCost = this.getTransportCost(studentId, fiscalYear, termNumber)
        const activityCost = this.getActivityCost(studentId, fiscalYear, termNumber)
        const snapshotCosts = this.getSnapshotCosts(fiscalYear, termNumber)

        const total = boardingCost + transportCost + activityCost + snapshotCosts.overheadCost

        return {
            student_id: studentId,
            term_id: termId,
            academic_year_id: academicYearId,
            total_cost: total,
            breakdown: {
                tuition_share: snapshotCosts.teachingCost,
                boarding_share: boardingCost,
                transport_share: transportCost,
                activity_share: activityCost + snapshotCosts.activitiesOverhead,
                admin_share: snapshotCosts.administrationCost,
                other_share: snapshotCosts.facilitiesCost + snapshotCosts.otherOverhead
            }
        }
    }

    async getCostBreakdown(studentId: number, termId: number): Promise<CostBreakdown> {
        const term = this.db.prepare('SELECT academic_year_id FROM term WHERE id = ?').get(termId) as { academic_year_id: number } | undefined
        if (!term) {
            throw new Error('Term not found')
        }

        const cost = await this.calculateStudentCost(studentId, termId, term.academic_year_id)
        return cost.breakdown
    }

    async getCostVsRevenue(studentId: number, termId: number): Promise<{ cost: number, revenue: number, subsidy: number, surplus_or_deficit: number }> {
        const cost = await this.getCostBreakdown(studentId, termId)
        const totalCost = Object.values(cost).reduce((a, b) => a + b, 0)

        const invoice = this.db.prepare(`
            SELECT total_amount FROM fee_invoice
            WHERE student_id = ? AND term_id = ?
        `).get(studentId, termId) as { total_amount: number } | undefined

        const revenue = invoice?.total_amount || 0
        const surplusOrDeficit = revenue - totalCost

        return {
            cost: totalCost,
            revenue,
            subsidy: Math.max(0, totalCost - revenue),
            surplus_or_deficit: surplusOrDeficit
        }
    }

    async getAverageCostPerStudent(_grade: number, termId: number): Promise<number> {
        const term = this.db.prepare('SELECT academic_year_id FROM term WHERE id = ?').get(termId) as { academic_year_id: number } | undefined
        if (!term) {
            return 0
        }

        const fiscalYear = this.getAcademicYearValue(term.academic_year_id)
        const termNumber = this.getTermNumber(termId)
        const snapshot = this.db.prepare(`
            SELECT cost_per_student FROM student_cost_snapshot
            WHERE academic_year = ? AND term = ?
        `).get(fiscalYear, termNumber) as { cost_per_student: number } | undefined

        return snapshot?.cost_per_student || 0
    }

    async getCostTrendAnalysis(_studentId: number, periods: number): Promise<unknown[]> {
        const rows = this.db.prepare(`
            SELECT academic_year, term, cost_per_student
            FROM student_cost_snapshot
            ORDER BY academic_year DESC, term DESC
            LIMIT ?
        `).all(periods) as { academic_year: number; term: number; cost_per_student: number }[]

        return rows.map((row) => ({
            period: `Term ${row.term} ${row.academic_year}`,
            cost: row.cost_per_student
        }))
    }
}
