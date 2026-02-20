import type { Database } from 'better-sqlite3'

export const MIGRATION_NAME = '1002_fix_subject_names'

export function up(db: Database): void {
    console.warn('Running Migration 1002: Fix Truncated Subject Names')

    const updates = [
        { code: 'E-ENV', name: 'Environmental Activities' },
        { code: 'E-LANG', name: 'Language Activities' },
        { code: 'E-MATH', name: 'Mathematical Activities' },
        { code: 'E-PSY', name: 'Psychomotor and Creative Activities' },
        { code: 'E-REL', name: 'Religious Education Activities' },
        { code: 'C-ENV', name: 'Environmental Activities' },
        { code: 'C-HYG', name: 'Hygiene and Nutrition' },
        { code: 'C-REL', name: 'Christian Religious Education' },
        { code: 'C-PE', name: 'Movement and Physical Education' }
    ]

    const stmt = db.prepare('UPDATE subject SET name = ? WHERE code = ?')

    db.transaction(() => {
        for (const update of updates) {
            stmt.run(update.name, update.code)
        }
    })()
}

export function down(_db: Database): void {
    // No rollback needed for data corrections
}
