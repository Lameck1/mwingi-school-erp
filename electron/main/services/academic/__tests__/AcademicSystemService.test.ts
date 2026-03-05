import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database
const logAuditMock = vi.fn()

vi.mock('../../../database', () => ({
    getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
    logAudit: (...args: unknown[]) => logAuditMock(...args)
}))

import { AcademicSystemService } from '../AcademicSystemService'

describe('AcademicSystemService', () => {
    let service: AcademicSystemService

    beforeEach(() => {
        logAuditMock.mockClear()
        db = new Database(':memory:')
        db.exec(`
            CREATE TABLE subject (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                curriculum TEXT NOT NULL,
                is_compulsory INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1
            );

            CREATE TABLE academic_year (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                is_current INTEGER DEFAULT 0
            );

            CREATE TABLE term (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                academic_year_id INTEGER,
                term_number INTEGER,
                name TEXT,
                status TEXT DEFAULT 'OPEN',
                is_current INTEGER DEFAULT 0
            );

            CREATE TABLE exam (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                academic_year_id INTEGER NOT NULL,
                term_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                weight REAL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE stream (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stream_name TEXT NOT NULL
            );

            CREATE TABLE staff (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name TEXT,
                last_name TEXT,
                email TEXT
            );

            CREATE TABLE user (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT,
                role TEXT NOT NULL
            );

            CREATE TABLE subject_allocation (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                academic_year_id INTEGER NOT NULL,
                term_id INTEGER NOT NULL,
                stream_id INTEGER NOT NULL,
                subject_id INTEGER NOT NULL,
                teacher_id INTEGER NOT NULL,
                UNIQUE(academic_year_id, term_id, stream_id, subject_id)
            );

            CREATE TABLE student (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name TEXT,
                last_name TEXT,
                admission_number TEXT
            );

            CREATE TABLE enrollment (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                stream_id INTEGER NOT NULL,
                status TEXT DEFAULT 'ACTIVE'
            );

            CREATE TABLE exam_result (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                subject_id INTEGER NOT NULL,
                score REAL,
                competency_level INTEGER,
                teacher_remarks TEXT,
                entered_by_user_id INTEGER,
                UNIQUE(exam_id, student_id, subject_id)
            );

            CREATE TABLE grading_scale (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                curriculum TEXT NOT NULL,
                grade TEXT NOT NULL,
                min_score REAL NOT NULL,
                max_score REAL NOT NULL
            );

            CREATE TABLE report_card_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                total_marks REAL,
                mean_score REAL,
                mean_grade TEXT,
                class_position INTEGER,
                UNIQUE(exam_id, student_id)
            );

            -- Seed data
            INSERT INTO academic_year (name, is_current) VALUES ('2024', 1);
            INSERT INTO term (academic_year_id, term_number, name, status, is_current)
                VALUES (1, 1, 'Term 1', 'OPEN', 1);
            INSERT INTO stream (stream_name) VALUES ('Form 1 East');
            INSERT INTO stream (stream_name) VALUES ('Form 1 West');
            INSERT INTO staff (first_name, last_name, email) VALUES ('John', 'Teacher', 'john@school.com');
            INSERT INTO user (email, role) VALUES ('admin@school.com', 'ADMIN');
            INSERT INTO user (email, role) VALUES ('john@school.com', 'TEACHER');

            -- Subjects
            INSERT INTO subject (code, name, curriculum, is_compulsory, is_active)
                VALUES ('MATH', 'Mathematics', '8-4-4', 1, 1);
            INSERT INTO subject (code, name, curriculum, is_compulsory, is_active)
                VALUES ('ENG', 'English', '8-4-4', 1, 1);
            INSERT INTO subject (code, name, curriculum, is_compulsory, is_active)
                VALUES ('SCI', 'Science', 'CBC', 0, 0);

            -- Students & enrollments
            INSERT INTO student (first_name, last_name, admission_number) VALUES ('Alice', 'Mwangi', 'ADM001');
            INSERT INTO student (first_name, last_name, admission_number) VALUES ('Bob', 'Kimani', 'ADM002');
            INSERT INTO enrollment (student_id, stream_id, status) VALUES (1, 1, 'ACTIVE');
            INSERT INTO enrollment (student_id, stream_id, status) VALUES (2, 1, 'ACTIVE');

            -- Grading scale (8-4-4)
            INSERT INTO grading_scale (curriculum, grade, min_score, max_score) VALUES ('8-4-4', 'A', 80, 100);
            INSERT INTO grading_scale (curriculum, grade, min_score, max_score) VALUES ('8-4-4', 'B', 60, 79);
            INSERT INTO grading_scale (curriculum, grade, min_score, max_score) VALUES ('8-4-4', 'C', 40, 59);
            INSERT INTO grading_scale (curriculum, grade, min_score, max_score) VALUES ('8-4-4', 'D', 20, 39);
            INSERT INTO grading_scale (curriculum, grade, min_score, max_score) VALUES ('8-4-4', 'F', 0, 19);
        `)

        service = new AcademicSystemService()
    })

    afterEach(() => {
        db.close()
    })

    // ── Subject Management ────────────────────────────────────────
    describe('getAllSubjects', () => {
        it('returns only active subjects', async () => {
            const subjects = await service.getAllSubjects()
            expect(subjects.length).toBe(2) // MATH & ENG active, SCI inactive
            expect(subjects.every(s => s.is_active === 1)).toBe(true)
        })
    })

    describe('getAllSubjectsAdmin', () => {
        it('returns all subjects including inactive', async () => {
            const subjects = await service.getAllSubjectsAdmin()
            expect(subjects.length).toBe(3)
        })
    })

    describe('createSubject', () => {
        it('creates a new subject', async () => {
            const result = await service.createSubject({
                code: 'HIS',
                name: 'History',
                curriculum: '8-4-4',
                is_compulsory: false,
            }, 1)
            expect(result.success).toBe(true)
            expect(result.id).toBeGreaterThan(0)
            expect(logAuditMock).toHaveBeenCalledWith(1, 'CREATE_SUBJECT', 'subject', result.id, null, expect.objectContaining({ code: 'HIS' }))
        })

        it('rejects duplicate subject code', async () => {
            await expect(service.createSubject({
                code: 'MATH',
                name: 'Duplicate Math',
                curriculum: '8-4-4',
            }, 1)).rejects.toThrow('Subject code already exists: MATH')
        })

        it('rejects empty code', async () => {
            await expect(service.createSubject({
                code: '',
                name: 'No Code',
                curriculum: '8-4-4',
            }, 1)).rejects.toThrow('required')
        })

        it('normalizes code to uppercase and trimmed', async () => {
            const result = await service.createSubject({
                code: '  geo  ',
                name: 'Geography',
                curriculum: '8-4-4',
            }, 1)
            const subject = db.prepare('SELECT code FROM subject WHERE id = ?').get(result.id) as any
            expect(subject.code).toBe('GEO')
        })
    })

    describe('updateSubject', () => {
        it('updates subject fields', async () => {
            const result = await service.updateSubject(1, {
                name: 'Advanced Mathematics',
                is_compulsory: false,
            }, 1)
            expect(result.success).toBe(true)
            const subject = db.prepare('SELECT name, is_compulsory FROM subject WHERE id = 1').get() as any
            expect(subject.name).toBe('Advanced Mathematics')
            expect(subject.is_compulsory).toBe(0)
        })

        it('rejects non-existent subject', async () => {
            await expect(service.updateSubject(999, { name: 'X' }, 1)).rejects.toThrow('Subject not found')
        })

        it('rejects duplicate code on update', async () => {
            await expect(service.updateSubject(2, { code: 'MATH' }, 1)).rejects.toThrow('Subject code already exists: MATH')
        })
    })

    describe('setSubjectActive', () => {
        it('deactivates a subject', async () => {
            const result = await service.setSubjectActive(1, false, 1)
            expect(result.success).toBe(true)
            const sub = db.prepare('SELECT is_active FROM subject WHERE id = 1').get() as any
            expect(sub.is_active).toBe(0)
            expect(logAuditMock).toHaveBeenCalledWith(1, 'DEACTIVATE_SUBJECT', 'subject', 1, expect.anything(), expect.anything())
        })

        it('activates a subject', async () => {
            const result = await service.setSubjectActive(3, true, 1) // SCI was inactive
            expect(result.success).toBe(true)
            const sub = db.prepare('SELECT is_active FROM subject WHERE id = 3').get() as any
            expect(sub.is_active).toBe(1)
        })

        it('rejects non-existent subject', async () => {
            await expect(service.setSubjectActive(999, true, 1)).rejects.toThrow('Subject not found')
        })
    })

    // ── Exam Management ──────────────────────────────────────────
    describe('getAllExams', () => {
        it('returns exams for year and term', async () => {
            db.prepare('INSERT INTO exam (academic_year_id, term_id, name, weight) VALUES (1, 1, \'Midterm\', 1)').run()
            db.prepare('INSERT INTO exam (academic_year_id, term_id, name, weight) VALUES (1, 1, \'Final\', 2)').run()
            const exams = await service.getAllExams(1, 1)
            expect(exams.length).toBe(2)
        })

        it('returns empty for non-existent year/term', async () => {
            const exams = await service.getAllExams(99, 99)
            expect(exams.length).toBe(0)
        })
    })

    describe('createExam', () => {
        it('creates an exam with default weight', async () => {
            await service.createExam({ academic_year_id: 1, term_id: 1, name: 'Quiz 1' }, 1)
            const exam = db.prepare('SELECT * FROM exam WHERE name = \'Quiz 1\'').get() as any
            expect(exam).toBeDefined()
            expect(exam.weight).toBe(1)
            expect(logAuditMock).toHaveBeenCalledWith(1, 'CREATE_EXAM', 'exam', 0, null, expect.objectContaining({ name: 'Quiz 1' }))
        })

        it('creates an exam with custom weight', async () => {
            await service.createExam({ academic_year_id: 1, term_id: 1, name: 'Final', weight: 3 }, 1)
            const exam = db.prepare('SELECT weight FROM exam WHERE name = \'Final\'').get() as any
            expect(exam.weight).toBe(3)
        })
    })

    describe('deleteExam', () => {
        it('deletes an exam', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Test\')').run()
            await service.deleteExam(10, 1)
            const exam = db.prepare('SELECT id FROM exam WHERE id = 10').get()
            expect(exam).toBeUndefined()
            expect(logAuditMock).toHaveBeenCalledWith(1, 'DELETE_EXAM', 'exam', 10, null, null)
        })
    })

    // ── Teacher Allocations ──────────────────────────────────────
    describe('allocateTeacher', () => {
        it('allocates a teacher to a subject/stream', async () => {
            await service.allocateTeacher({
                academic_year_id: 1, term_id: 1, stream_id: 1,
                subject_id: 1, teacher_id: 1,
            } as any, 1)
            const alloc = db.prepare('SELECT * FROM subject_allocation').get() as any
            expect(alloc).toBeDefined()
            expect(alloc.teacher_id).toBe(1)
            expect(logAuditMock).toHaveBeenCalledWith(1, 'ALLOCATE_TEACHER', 'subject_allocation', 0, null, expect.anything())
        })

        it('rejects allocation if term is CLOSED', async () => {
            db.prepare('UPDATE term SET status = \'CLOSED\' WHERE id = 1').run()
            await expect(service.allocateTeacher({
                academic_year_id: 1, term_id: 1, stream_id: 1,
                subject_id: 1, teacher_id: 1,
            } as any, 1)).rejects.toThrow('Term is CLOSED')
        })
    })

    describe('deleteAllocation', () => {
        it('deletes an allocation', async () => {
            db.prepare('INSERT INTO subject_allocation (id, academic_year_id, term_id, stream_id, subject_id, teacher_id) VALUES (1, 1, 1, 1, 1, 1)').run()
            await service.deleteAllocation(1, 1)
            const alloc = db.prepare('SELECT id FROM subject_allocation WHERE id = 1').get()
            expect(alloc).toBeUndefined()
        })

        it('rejects non-existent allocation', async () => {
            await expect(service.deleteAllocation(999, 1)).rejects.toThrow('Allocation not found')
        })
    })

    describe('getAllocations', () => {
        it('returns allocations with teacher/subject/stream names', async () => {
            db.prepare('INSERT INTO subject_allocation (academic_year_id, term_id, stream_id, subject_id, teacher_id) VALUES (1, 1, 1, 1, 1)').run()
            const allocs = await service.getAllocations(1, 1)
            expect(allocs.length).toBe(1)
            expect(allocs[0].teacher_name).toBe('John Teacher')
            expect(allocs[0].subject_name).toBe('Mathematics')
            expect(allocs[0].stream_name).toBe('Form 1 East')
        })

        it('filters by streamId when provided', async () => {
            db.prepare('INSERT INTO subject_allocation (academic_year_id, term_id, stream_id, subject_id, teacher_id) VALUES (1, 1, 1, 1, 1)').run()
            db.prepare('INSERT INTO subject_allocation (academic_year_id, term_id, stream_id, subject_id, teacher_id) VALUES (1, 1, 2, 1, 1)').run()
            const allocs = await service.getAllocations(1, 1, 2)
            expect(allocs.length).toBe(1)
            expect(allocs[0].stream_name).toBe('Form 1 West')
        })
    })

    // ── Results Management ───────────────────────────────────────
    describe('getResults', () => {
        it('returns results for admin user', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            db.prepare('INSERT INTO exam_result (exam_id, student_id, subject_id, score, entered_by_user_id) VALUES (10, 1, 1, 85, 1)').run()
            // userId 1 = ADMIN
            const results = await service.getResults(10, 1, 1, 1)
            expect(results.length).toBe(2) // Both enrolled students, one with result
            const alice = results.find(r => r.admission_number === 'ADM001')
            expect(alice?.score).toBe(85)
        })

        it('rejects unauthorized teacher', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            // userId 2 = TEACHER with no allocation
            await expect(service.getResults(10, 1, 1, 2)).rejects.toThrow('Unauthorized')
        })

        it('allows teacher with allocation', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            db.prepare('INSERT INTO subject_allocation (academic_year_id, term_id, stream_id, subject_id, teacher_id) VALUES (1, 1, 1, 1, 1)').run()
            // userId 2 = TEACHER, staff 1 has email john@school.com = user 2
            const results = await service.getResults(10, 1, 1, 2)
            expect(results.length).toBe(2)
        })
    })

    describe('saveResults', () => {
        it('saves exam results in batch', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            await service.saveResults(10, [
                { student_id: 1, subject_id: 1, score: 90, competency_level: null, teacher_remarks: 'Excellent' },
                { student_id: 2, subject_id: 1, score: 75, competency_level: null, teacher_remarks: 'Good' },
            ], 1)
            const results = db.prepare('SELECT * FROM exam_result WHERE exam_id = 10').all()
            expect(results.length).toBe(2)
        })

        it('rejects saving when exam not found', async () => {
            await expect(service.saveResults(999, [
                { student_id: 1, subject_id: 1, score: 90, competency_level: null, teacher_remarks: null },
            ], 1)).rejects.toThrow('Exam not found')
        })

        it('rejects saving when term is CLOSED', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            db.prepare('UPDATE term SET status = \'CLOSED\' WHERE id = 1').run()
            await expect(service.saveResults(10, [
                { student_id: 1, subject_id: 1, score: 90, competency_level: null, teacher_remarks: null },
            ], 1)).rejects.toThrow('Term is CLOSED')
        })

        it('rejects unauthorized teacher from saving', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            // userId 2 = TEACHER with no allocation to subject 1
            await expect(service.saveResults(10, [
                { student_id: 1, subject_id: 1, score: 90, competency_level: null, teacher_remarks: null },
            ], 2)).rejects.toThrow('Unauthorized')
        })
    })

    // ── processResults ───────────────────────────────────────────
    describe('processResults', () => {
        it('computes ranks and saves summaries for 8-4-4 scores', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            // Alice 90/100 MATH, Bob 70/100 MATH
            db.prepare('INSERT INTO exam_result (exam_id, student_id, subject_id, score, entered_by_user_id) VALUES (10, 1, 1, 90, 1)').run()
            db.prepare('INSERT INTO exam_result (exam_id, student_id, subject_id, score, entered_by_user_id) VALUES (10, 2, 1, 70, 1)').run()

            await service.processResults(10, 1)

            const summaries = db.prepare('SELECT * FROM report_card_summary WHERE exam_id = 10 ORDER BY class_position').all() as any[]
            expect(summaries.length).toBe(2)
            // Alice should be rank 1 (score 90 > 70)
            expect(summaries[0].student_id).toBe(1)
            expect(summaries[0].class_position).toBe(1)
            expect(summaries[0].mean_grade).toBe('A')
            // Bob should be rank 2
            expect(summaries[1].student_id).toBe(2)
            expect(summaries[1].class_position).toBe(2)
            expect(summaries[1].mean_grade).toBe('B')
        })

        it('handles CBC competency levels', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            // Student 1 has a CBC subject (SCI, id=3) with competency_level 3 → normalized to 75%
            db.prepare('INSERT INTO exam_result (exam_id, student_id, subject_id, score, competency_level, entered_by_user_id) VALUES (10, 1, 3, NULL, 3, 1)').run()

            await service.processResults(10, 1)

            const summary = db.prepare('SELECT * FROM report_card_summary WHERE exam_id = 10 AND student_id = 1').get() as any
            expect(summary).toBeDefined()
            expect(summary.mean_score).toBe(75) // (3/4)*100 = 75
            expect(summary.mean_grade).toBe('B')
        })

        it('assigns F grade when score is very low', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            db.prepare('INSERT INTO exam_result (exam_id, student_id, subject_id, score, entered_by_user_id) VALUES (10, 1, 1, 10, 1)').run()

            await service.processResults(10, 1)

            const summary = db.prepare('SELECT * FROM report_card_summary WHERE exam_id = 10 AND student_id = 1').get() as any
            expect(summary.mean_grade).toBe('F')
        })
    })

    // ── Stub methods ─────────────────────────────────────────────
    describe('generateCertificate', () => {
        it('returns not implemented', async () => {
            const result = await service.generateCertificate({
                studentId: 1, studentName: 'Alice', awardCategory: 'Best',
                academicYearId: 1, improvementPercentage: 10,
            })
            expect(result.success).toBe(false)
            expect(result.message).toContain('not implemented')
        })
    })

    describe('emailParents', () => {
        it('returns not implemented', async () => {
            const result = await service.emailParents({
                students: [{ student_id: 1, student_name: 'Alice', improvement_percentage: 10 }],
                awardCategory: 'Best', templateType: 'default',
            })
            expect(result.success).toBe(false)
            expect(result.message).toContain('not implemented')
        })
    })

    // ── Additional branch coverage ────────────────────────────────────
    describe('verifyAccess with streamId=0 (any stream check)', () => {
        it('allows teacher allocated to any stream for the subject', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            db.prepare('INSERT INTO subject_allocation (academic_year_id, term_id, stream_id, subject_id, teacher_id) VALUES (1, 1, 1, 1, 1)').run()
            // userId 2 = TEACHER, staff 1 email = john@school.com = user 2
            const results = await service.getResults(10, 1, 0, 2)
            // streamId=0 means check any stream allocation - should find the one for stream 1
            expect(results).toBeDefined()
        })

        it('rejects teacher with no allocation when streamId=0', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            // No allocation for user 2
            await expect(service.getResults(10, 1, 0, 2)).rejects.toThrow('Unauthorized')
        })
    })

    describe('verifyAccess returns false for non-existent user', () => {
        it('rejects when userId does not exist', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            await expect(service.getResults(10, 1, 1, 999)).rejects.toThrow('Unauthorized')
        })
    })

    describe('createSubject defaults', () => {
        it('creates subject with is_active=false', async () => {
            const result = await service.createSubject({
                code: 'PHY',
                name: 'Physics',
                curriculum: '8-4-4',
                is_active: false,
            }, 1)
            expect(result.success).toBe(true)
            const sub = db.prepare('SELECT is_active FROM subject WHERE id = ?').get(result.id) as any
            expect(sub.is_active).toBe(0)
        })

        it('creates subject with is_compulsory true', async () => {
            const result = await service.createSubject({
                code: 'BIO',
                name: 'Biology',
                curriculum: '8-4-4',
                is_compulsory: true,
            }, 1)
            expect(result.success).toBe(true)
            const sub = db.prepare('SELECT is_compulsory FROM subject WHERE id = ?').get(result.id) as any
            expect(sub.is_compulsory).toBe(1)
        })
    })

    describe('updateSubject with partial fields', () => {
        it('updates only is_active via updateSubject', async () => {
            const result = await service.updateSubject(1, { is_active: false }, 1)
            expect(result.success).toBe(true)
            const sub = db.prepare('SELECT is_active FROM subject WHERE id = 1').get() as any
            expect(sub.is_active).toBe(0)
        })

        it('updates code to uppercase', async () => {
            const result = await service.updateSubject(1, { code: 'mth' }, 1)
            expect(result.success).toBe(true)
            const sub = db.prepare('SELECT code FROM subject WHERE id = 1').get() as any
            expect(sub.code).toBe('MTH')
        })
    })

    describe('processResults edge cases', () => {
        it('assigns F grade when score outside all grading scale ranges', async () => {
            // Insert score that doesn't match any grading_scale range (e.g., negative)
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (20, 1, 1, \'Special\')').run()
            db.prepare('INSERT INTO exam_result (exam_id, student_id, subject_id, score, entered_by_user_id) VALUES (20, 1, 1, -5, 1)').run()

            await service.processResults(20, 1)

            const summary = db.prepare('SELECT * FROM report_card_summary WHERE exam_id = 20 AND student_id = 1').get() as any
            expect(summary.mean_grade).toBe('F')
        })

        it('skips students with no results', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (21, 1, 1, \'Empty\')').run()
            // No exam_result rows for exam 21
            await service.processResults(21, 1)
            const summaries = db.prepare('SELECT COUNT(*) as count FROM report_card_summary WHERE exam_id = 21').get() as any
            expect(summaries.count).toBe(0)
        })
    })

    describe('saveResults with empty array', () => {
        it('saves nothing when results array is empty (skips access check)', async () => {
            db.prepare('INSERT INTO exam (id, academic_year_id, term_id, name) VALUES (10, 1, 1, \'Midterm\')').run()
            await service.saveResults(10, [], 1)
            const results = db.prepare('SELECT COUNT(*) as count FROM exam_result WHERE exam_id = 10').get() as any
            expect(results.count).toBe(0)
        })
    })

    describe('checkTermOpen allows open and missing terms', () => {
        it('does not throw when term status is null/OPEN', async () => {
            // Add term with null status
            db.prepare('INSERT INTO term (id, academic_year_id, term_number, name) VALUES (5, 1, 2, \'Term 2\')').run()
            // Should not throw for allocateTeacher
            await expect(service.allocateTeacher({
                academic_year_id: 1, term_id: 5, stream_id: 1,
                subject_id: 1, teacher_id: 1,
            } as any, 1)).resolves.not.toThrow()
        })
    })
})
