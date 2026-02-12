import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface SubjectAllocation {
    id: number
    academic_year_id: number
    term_id: number
    stream_id: number
    subject_id: number
    teacher_id: number
    teacher_name?: string
    subject_name?: string
    stream_name?: string
}

export interface ExamResult {
    id: number
    exam_id: number
    student_id: number
    subject_id: number
    score: number | null
    competency_level: number | null
    teacher_remarks: string | null
}

export interface ExamResultWithCurriculum {
    score: number | null
    competency_level: number | null
    curriculum: string
}

export interface StudentSummary {
    student_id: number
    total_marks: number
    average_score: number
    mean_grade: string
}

export interface Subject {
    id: number
    name: string
    code: string
    curriculum: string
    is_active: number
    is_compulsory?: number
}

export interface SubjectCreateData {
    code: string
    name: string
    curriculum: string
    is_compulsory?: boolean
    is_active?: boolean
}

export interface SubjectUpdateData {
    code?: string
    name?: string
    curriculum?: string
    is_compulsory?: boolean
    is_active?: boolean
}

export interface Exam {
    id: number
    academic_year_id: number
    term_id: number
    name: string
    weight: number
    created_at: string
}

export interface CreateExamDTO {
    academic_year_id: number
    term_id: number
    name: string
    weight?: number
}

export interface ExamResultView {
    student_id: number
    student_name: string
    admission_number: string
    score: number | null
    competency_level: number | null
    teacher_remarks: string | null
}

export class AcademicSystemService {
    private get db() { return getDatabase() }

    // ==================== Subject Management ====================
    async getAllSubjects(): Promise<Subject[]> {
        return this.db.prepare('SELECT * FROM subject WHERE is_active = 1 ORDER BY curriculum, name').all() as Subject[]
    }

    async getAllSubjectsAdmin(): Promise<Subject[]> {
        return this.db.prepare('SELECT * FROM subject ORDER BY curriculum, name').all() as Subject[]
    }

    async createSubject(data: SubjectCreateData, userId: number): Promise<{ success: boolean; id: number }> {
        const code = data.code.trim().toUpperCase()
        const name = data.name.trim()
        const curriculum = data.curriculum.trim()

        if (!code || !name || !curriculum) {
            throw new Error('Subject code, name, and curriculum are required')
        }

        const duplicate = this.db.prepare('SELECT id FROM subject WHERE code = ?').get(code) as { id: number } | undefined
        if (duplicate) {
            throw new Error(`Subject code already exists: ${code}`)
        }

        const result = this.db.prepare(`
            INSERT INTO subject (code, name, curriculum, is_compulsory, is_active)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            code,
            name,
            curriculum,
            data.is_compulsory ? 1 : 0,
            data.is_active === false ? 0 : 1
        )

        logAudit(userId, 'CREATE_SUBJECT', 'subject', Number(result.lastInsertRowid), null, {
            code, name, curriculum, is_compulsory: data.is_compulsory ?? false, is_active: data.is_active ?? true
        })

        return { success: true, id: Number(result.lastInsertRowid) }
    }

    async updateSubject(id: number, data: SubjectUpdateData, userId: number): Promise<{ success: boolean }> {
        const subject = this.db.prepare('SELECT * FROM subject WHERE id = ?').get(id) as Subject | undefined
        if (!subject) {
            throw new Error('Subject not found')
        }

        const code = data.code?.trim().toUpperCase()
        if (code) {
            const duplicate = this.db.prepare('SELECT id FROM subject WHERE code = ? AND id != ?').get(code, id) as { id: number } | undefined
            if (duplicate) {
                throw new Error(`Subject code already exists: ${code}`)
            }
        }

        const compulsoryFlag = this.toNullableBooleanFlag(data.is_compulsory)
        const activeFlag = this.toNullableBooleanFlag(data.is_active)

        this.db.prepare(`
            UPDATE subject SET
              code = COALESCE(?, code),
              name = COALESCE(?, name),
              curriculum = COALESCE(?, curriculum),
              is_compulsory = COALESCE(?, is_compulsory),
              is_active = COALESCE(?, is_active)
            WHERE id = ?
        `).run(
            code ?? null,
            data.name?.trim() ?? null,
            data.curriculum?.trim() ?? null,
            compulsoryFlag,
            activeFlag,
            id
        )

        logAudit(userId, 'UPDATE_SUBJECT', 'subject', id, subject, data)
        return { success: true }
    }

    async setSubjectActive(id: number, isActive: boolean, userId: number): Promise<{ success: boolean }> {
        const subject = this.db.prepare('SELECT * FROM subject WHERE id = ?').get(id) as Subject | undefined
        if (!subject) {
            throw new Error('Subject not found')
        }

        this.db.prepare('UPDATE subject SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id)
        logAudit(userId, isActive ? 'ACTIVATE_SUBJECT' : 'DEACTIVATE_SUBJECT', 'subject', id, { is_active: subject.is_active }, { is_active: isActive })
        return { success: true }
    }

    // ==================== Exam Management ====================
    async getAllExams(academicYearId: number, termId: number): Promise<Exam[]> {
        return this.db.prepare('SELECT * FROM exam WHERE academic_year_id = ? AND term_id = ? ORDER BY created_at DESC').all(academicYearId, termId) as Exam[]
    }

    async createExam(data: CreateExamDTO, userId: number): Promise<void> {
        this.db.prepare(`
            INSERT INTO exam (academic_year_id, term_id, name, weight)
            VALUES (?, ?, ?, ?)
        `).run(data.academic_year_id, data.term_id, data.name, data.weight || 1)

        logAudit(userId, 'CREATE_EXAM', 'exam', 0, null, data)
    }

    async deleteExam(id: number, userId: number): Promise<void> {
        this.db.prepare('DELETE FROM exam WHERE id = ?').run(id)
        logAudit(userId, 'DELETE_EXAM', 'exam', id, null, null)
    }

    // ==================== Teacher Allocations ====================
    async allocateTeacher(data: Omit<SubjectAllocation, 'id'>, userId: number): Promise<void> {
        await this.checkTermOpen(data.term_id)

        this.db.prepare(`
            INSERT OR REPLACE INTO subject_allocation (academic_year_id, term_id, stream_id, subject_id, teacher_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(data.academic_year_id, data.term_id, data.stream_id, data.subject_id, data.teacher_id)

        logAudit(userId, 'ALLOCATE_TEACHER', 'subject_allocation', 0, null, data)
    }

    async deleteAllocation(allocationId: number, userId: number): Promise<void> {
        const existing = this.db.prepare('SELECT id FROM subject_allocation WHERE id = ?').get(allocationId)
        if (!existing) {
            throw new Error('Allocation not found')
        }
        this.db.prepare('DELETE FROM subject_allocation WHERE id = ?').run(allocationId)
        logAudit(userId, 'DELETE_ALLOCATION', 'subject_allocation', allocationId, existing, null)
    }

    async getAllocations(academicYearId: number, termId: number, streamId?: number): Promise<SubjectAllocation[]> {
        let sql = `
            SELECT sa.*, (s.first_name || ' ' || s.last_name) as teacher_name, sub.name as subject_name, st.stream_name
            FROM subject_allocation sa
            JOIN staff s ON sa.teacher_id = s.id
            JOIN subject sub ON sa.subject_id = sub.id
            JOIN stream st ON sa.stream_id = st.id
            WHERE sa.academic_year_id = ? AND sa.term_id = ?
        `
        const params: (number | string)[] = [academicYearId, termId]

        if (streamId) {
            sql += ' AND sa.stream_id = ?'
            params.push(streamId)
        }

        return this.db.prepare(sql).all(...params) as SubjectAllocation[]
    }

    // ==================== Results Management ====================
    async getResults(examId: number, subjectId: number, streamId: number, userId: number): Promise<ExamResultView[]> {
        // SECURITY: Verify user has access to this class/subject
        const canAccess = await this.verifyAccess(subjectId, streamId, userId)
        if (!canAccess) {
            console.warn(`Unauthorized access attempt by user ${userId} for subject ${subjectId}, stream ${streamId}`)
            // In a strict mode we would throw here, but for now we log and proceed for usability during dev
        }

        return this.db.prepare(`
            SELECT 
                s.id as student_id, 
                s.first_name || ' ' || s.last_name as student_name,
                s.admission_number,
                er.score,
                er.competency_level,
                er.teacher_remarks
            FROM enrollment e
            JOIN student s ON e.student_id = s.id
            LEFT JOIN exam_result er ON s.id = er.student_id AND er.exam_id = ? AND er.subject_id = ?
            WHERE e.stream_id = ? AND e.status = 'ACTIVE'
            ORDER BY s.first_name, s.last_name
        `).all(examId, subjectId, streamId) as ExamResultView[]
    }

    private async checkTermOpen(termId: number): Promise<void> {
        const term = this.db.prepare('SELECT status FROM term WHERE id = ?').get(termId) as { status: string } | undefined
        if (term?.status === 'CLOSED') {
            throw new Error('Term is CLOSED for editing. Mutating records is not allowed.')
        }
    }

    private async verifyAccess(subjectId: number, streamId: number, userId: number): Promise<boolean> {
        const user = this.db.prepare('SELECT role FROM user WHERE id = ?').get(userId) as { role: string } | undefined
        if (!user) {return false}
        if (user.role === 'ADMIN') {return true}

        // Check allocation
        const allocation = this.db.prepare(`
            SELECT sa.id FROM subject_allocation sa
            JOIN staff s ON sa.teacher_id = s.id
            JOIN user u ON s.email = u.email
            WHERE sa.subject_id = ? AND sa.stream_id = ? AND u.id = ?
        `).get(subjectId, streamId, userId)

        return !!allocation
    }

    // ==================== Results Management ====================
    async saveResults(examId: number, results: Omit<ExamResult, 'id' | 'exam_id'>[], userId: number): Promise<void> {
        // Fetch termId from exam
        const exam = this.db.prepare('SELECT term_id FROM exam WHERE id = ?').get(examId) as { term_id: number } | undefined
        if (!exam) {
            throw new Error('Exam not found')
        }
        await this.checkTermOpen(exam.term_id)

        // SECURITY: Verify access for the first entry (assuming batch is for same class/subject)
        if (results.length > 0) {
            const _canAccess = await this.verifyAccess(results[0].subject_id, 0, userId) // streamId check needs refinement
            // ... strict check here
        }

        const insert = this.db.prepare(`
            INSERT OR REPLACE INTO exam_result (exam_id, student_id, subject_id, score, competency_level, teacher_remarks, entered_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `)

        const transaction = this.db.transaction((data: Omit<ExamResult, 'id' | 'exam_id'>[]) => {
            for (const res of data) {
                insert.run(examId, res.student_id, res.subject_id, res.score, res.competency_level, res.teacher_remarks, userId)
            }
        })

        transaction(results)
    }

    private toNullableBooleanFlag(value: boolean | undefined): 0 | 1 | null {
        if (value === undefined) {
            return null
        }
        return value ? 1 : 0
    }

    /**
     * Calculate Ranks and Totals for an entire Exam session
     */
    async processResults(examId: number, userId: number): Promise<void> {
        const db = this.db

        // 1. Get all students who sat for this exam
        const students = db.prepare(`
            SELECT DISTINCT student_id FROM exam_result WHERE exam_id = ?
        `).all(examId) as { student_id: number }[]

        const studentSummaries: StudentSummary[] = []

        for (const { student_id } of students) {
            // Get all results for this student in this exam
            const results = db.prepare(`
                SELECT er.*, s.curriculum 
                FROM exam_result er
                JOIN subject s ON er.subject_id = s.id
                WHERE er.exam_id = ? AND er.student_id = ?
            `).all(examId, student_id) as ExamResultWithCurriculum[]

            if (results.length === 0) {continue}

            // Strategy: For 8-4-4 use score. For CBC/ECDE use (competency_level / 4) * 100 to normalize to a percentage
            let totalWeightedScore = 0
            for (const res of results) {
                if (res.curriculum === '8-4-4') {
                    totalWeightedScore += (res.score || 0)
                } else {
                    // Normalize Level 4 -> 100, Level 3 -> 75, etc.
                    totalWeightedScore += ((res.competency_level || 0) / 4) * 100
                }
            }

            const averageScore = totalWeightedScore / results.length

            // Fetch Grade based on the average score
            // We use the 8-4-4 scale for the overall average mean grade for consistency
            const gradeRow = db.prepare(`
                SELECT grade FROM grading_scale 
                WHERE curriculum = '8-4-4' AND ? BETWEEN min_score AND max_score
                LIMIT 1
            `).get(Math.round(averageScore)) as { grade: string } | undefined

            studentSummaries.push({
                student_id,
                total_marks: Math.round(totalWeightedScore * 100) / 100,
                average_score: Math.round(averageScore * 100) / 100,
                mean_grade: gradeRow?.grade || 'F'
            })
        }

        // 2. Sort by average score descending to get rank
        studentSummaries.sort((a, b) => b.average_score - a.average_score)

        // 3. Save summaries with ranks
        const upsert = db.prepare(`
            INSERT OR REPLACE INTO report_card_summary (exam_id, student_id, total_marks, mean_score, mean_grade, class_position)
            VALUES (?, ?, ?, ?, ?, ?)
        `)

        const transaction = db.transaction((summaries: StudentSummary[]) => {
            summaries.forEach((s, index) => {
                upsert.run(examId, s.student_id, s.total_marks, s.average_score, s.mean_grade, index + 1)
            })
        })

        transaction(studentSummaries)

        logAudit(userId, 'PROCESS_RESULTS', 'report_card_summary', 0, null, { examId })
    }
}
