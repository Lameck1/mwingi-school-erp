import type Database from 'better-sqlite3'

export const up = (db: Database.Database): void => {
    try {
        db.prepare(`
            ALTER TABLE school_settings
            ADD COLUMN school_type TEXT NOT NULL DEFAULT 'PUBLIC' CHECK(school_type IN ('PUBLIC', 'PRIVATE'))
        `).run()
    } catch (e) {
        if (!(e instanceof Error) || !e.message.includes('duplicate column name')) {
            throw e
        }
    }
}

export const down = (db: Database.Database): void => {
    // SQLite doesn't easily support DROP COLUMN with constraints in older versions, 
    // but in modern SQLite, ALTER TABLE DROP COLUMN is supported.
    try {
        db.prepare('ALTER TABLE school_settings DROP COLUMN school_type').run()
    } catch (e) {
        console.warn('Could not drop school_type column during rollback', e)
    }
}
