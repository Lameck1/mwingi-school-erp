import type { Database } from 'better-sqlite3'

export const MIGRATION_NAME = '1003_fix_grading_scale'

export function up(db: Database): void {
    console.warn('Running Migration 1003: Fix Grading Scale Short Codes')

    // We need to ensure the 'grade' column contains short codes (EE1, ME1) 
    // and not the long descriptions. The long descriptions belong in 'remarks'.

    const updates = [
        // ECDE / CBC
        { curriculum: 'CBC', min: 90, max: 100, grade: 'EE1', remarks: 'Exceeding Expectations' },
        { curriculum: 'CBC', min: 75, max: 89, grade: 'EE2', remarks: 'Exceeding Expectations' },
        { curriculum: 'CBC', min: 58, max: 74, grade: 'ME1', remarks: 'Meeting Expectations' },
        { curriculum: 'CBC', min: 41, max: 57, grade: 'ME2', remarks: 'Meeting Expectations' },
        { curriculum: 'CBC', min: 31, max: 40, grade: 'AE1', remarks: 'Approaching Expectations' },
        { curriculum: 'CBC', min: 21, max: 30, grade: 'AE2', remarks: 'Approaching Expectations' },
        { curriculum: 'CBC', min: 11, max: 20, grade: 'BE1', remarks: 'Below Expectations' },
        { curriculum: 'CBC', min: 0, max: 10, grade: 'BE2', remarks: 'Below Expectations' },

        // Duplicate for ECDE just in case
        { curriculum: 'ECDE', min: 90, max: 100, grade: 'EE1', remarks: 'Exceeding Expectations' },
        { curriculum: 'ECDE', min: 75, max: 89, grade: 'EE2', remarks: 'Exceeding Expectations' },
        { curriculum: 'ECDE', min: 58, max: 74, grade: 'ME1', remarks: 'Meeting Expectations' },
        { curriculum: 'ECDE', min: 41, max: 57, grade: 'ME2', remarks: 'Meeting Expectations' },
        { curriculum: 'ECDE', min: 31, max: 40, grade: 'AE1', remarks: 'Approaching Expectations' },
        { curriculum: 'ECDE', min: 21, max: 30, grade: 'AE2', remarks: 'Approaching Expectations' },
        { curriculum: 'ECDE', min: 11, max: 20, grade: 'BE1', remarks: 'Below Expectations' },
        { curriculum: 'ECDE', min: 0, max: 10, grade: 'BE2', remarks: 'Below Expectations' }
    ]

    const stmt = db.prepare(`
    UPDATE grading_scale 
    SET grade = ?, remarks = ? 
    WHERE curriculum = ? AND min_score = ? AND max_score = ?
  `)

    db.transaction(() => {
        for (const update of updates) {
            stmt.run(update.grade, update.remarks, update.curriculum, update.min, update.max)
        }
    })()
}

export function down(_db: Database): void {
    // No rollback needed for data corrections
}
