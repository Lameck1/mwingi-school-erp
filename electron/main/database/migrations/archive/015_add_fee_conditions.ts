
import { Database } from 'better-sqlite3'

export function up(db: Database) {
    console.warn('Running migration: 015_add_fee_conditions')

    // 1. Add columns to fee_structure
    try {
        // Check if column exists first to avoid error? SQLite add column is idempotent-ish but throws if exists
        interface TableColumnInfo {
            cid: number;
            name: string;
            type: string;
            notnull: number;
            dflt_value: unknown;
            pk: number;
        }
        const tableInfo = db.prepare("PRAGMA table_info(fee_structure)").all() as TableColumnInfo[];
        const hasCondition = tableInfo.some(c => c.name === 'condition_type');
        const hasFrequency = tableInfo.some(c => c.name === 'frequency');

        if (!hasCondition) {
            db.exec(`ALTER TABLE fee_structure ADD COLUMN condition_type TEXT DEFAULT 'ALL'`)
        }
        if (!hasFrequency) {
            db.exec(`ALTER TABLE fee_structure ADD COLUMN frequency TEXT DEFAULT 'PER_TERM'`)
        }
    } catch (error) {
        console.error('Error adding columns (might exist):', error)
    }

    // 2. Create Categories
    function getCategoryId(name: string, description: string = '') {
        const row = db.prepare('SELECT id FROM fee_category WHERE category_name = ?').get(name) as { id: number }
        if (row) return row.id
        const result = db.prepare('INSERT INTO fee_category (category_name, description) VALUES (?, ?)').run(name, description)
        return result.lastInsertRowid as number
    }

    const catIds = {
        Admission: getCategoryId('Admission', 'Admission Fee (New Students)'),
        Interview: getCategoryId('Interview', 'Interview Fee (New Students)'),
        Textbook: getCategoryId('Textbook', 'Textbook Fee (Annual)'),
        Activity: getCategoryId('Activity', 'Activity Fee (Annual)'),
        Motivation: getCategoryId('Motivation', 'Motivation Fee (Annual)'),
        Exam: getCategoryId('Exams', 'Exam and Project Fee (Termly)'),
    }

    // 3. Helper to get stream IDs
    const getStreamId = db.prepare('SELECT id FROM stream WHERE stream_code = ?')

    // Define groups
    const PRIMARY_STREAMS = ['BABY', 'PP1', 'PP2', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6']
    // Classes 1-8: Usually G1-G8.
    const CLASS_1_8 = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8']

    // All Streams for Admission/Interview
    const ALL_STREAMS = [...PRIMARY_STREAMS, 'G7', 'G8', 'G9']

    // Get Academic Year
    const acYear = db.prepare('SELECT id FROM academic_year WHERE is_current = 1').get() as { id: number } | undefined
    const acYearId = acYear ? acYear.id : 1

    const insertStmt = db.prepare(`
        INSERT INTO fee_structure 
        (academic_year_id, term_id, stream_id, fee_category_id, amount, student_type, condition_type, frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    db.transaction(() => {
        // Admission & Interview: All Streams, New Students, Once per year (or just once)
        for (const code of ALL_STREAMS) {
            const s = getStreamId.get(code) as { id: number } | undefined
            if (!s) continue

            for (let term = 1; term <= 3; term++) {
                // Admission: 2000 (New Students)
                insertStmt.run(acYearId, term, s.id, catIds.Admission, 200000, 'DAY_SCHOLAR', 'NEW_STUDENT', 'ONCE_PER_YEAR')
                insertStmt.run(acYearId, term, s.id, catIds.Admission, 200000, 'BOARDER', 'NEW_STUDENT', 'ONCE_PER_YEAR')

                // Interview: 500 (New Students)
                insertStmt.run(acYearId, term, s.id, catIds.Interview, 50000, 'DAY_SCHOLAR', 'NEW_STUDENT', 'ONCE_PER_YEAR')
                insertStmt.run(acYearId, term, s.id, catIds.Interview, 50000, 'BOARDER', 'NEW_STUDENT', 'ONCE_PER_YEAR')
            }
        }

        // Textbook: 500 (Classes 1-8, Once Per Year)
        // Motivation: 500 (Classes 1-8, Once Per Year)
        // Exam: 200 (Classes 1-8, Per Term)
        for (const code of CLASS_1_8) {
            const s = getStreamId.get(code) as { id: number } | undefined
            if (!s) continue

            for (let term = 1; term <= 3; term++) {
                // Textbook
                insertStmt.run(acYearId, term, s.id, catIds.Textbook, 50000, 'DAY_SCHOLAR', 'ALL', 'ONCE_PER_YEAR')
                insertStmt.run(acYearId, term, s.id, catIds.Textbook, 50000, 'BOARDER', 'ALL', 'ONCE_PER_YEAR')

                // Motivation
                insertStmt.run(acYearId, term, s.id, catIds.Motivation, 50000, 'DAY_SCHOLAR', 'ALL', 'ONCE_PER_YEAR')
                insertStmt.run(acYearId, term, s.id, catIds.Motivation, 50000, 'BOARDER', 'ALL', 'ONCE_PER_YEAR')

                // Exam
                insertStmt.run(acYearId, term, s.id, catIds.Exam, 20000, 'DAY_SCHOLAR', 'ALL', 'PER_TERM')
                insertStmt.run(acYearId, term, s.id, catIds.Exam, 20000, 'BOARDER', 'ALL', 'PER_TERM')
            }
        }

        // Activity: 500 (Primary, Once Per Year)
        for (const code of PRIMARY_STREAMS) {
            const s = getStreamId.get(code) as { id: number } | undefined
            if (!s) continue
            for (let term = 1; term <= 3; term++) {
                insertStmt.run(acYearId, term, s.id, catIds.Activity, 50000, 'DAY_SCHOLAR', 'ALL', 'ONCE_PER_YEAR')
                insertStmt.run(acYearId, term, s.id, catIds.Activity, 50000, 'BOARDER', 'ALL', 'ONCE_PER_YEAR')
            }
        }

    })()
}
