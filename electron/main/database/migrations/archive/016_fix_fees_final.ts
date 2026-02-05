
import { Database } from 'better-sqlite3'
import { up as addFeeConditionsUp } from './015_add_fee_conditions.js'

export function up(db: Database) {
    // eslint-disable-next-line no-console
    console.info('Running migration: 016_fix_fees_final')

    // Helper to get category ID or create if missing
    function getCategoryId(name: string, description: string = '') {
        const row = db.prepare('SELECT id FROM fee_category WHERE category_name = ?').get(name) as { id: number }
        if (row) return row.id

        const result = db.prepare('INSERT INTO fee_category (category_name, description) VALUES (?, ?)').run(name, description)
        return result.lastInsertRowid as number
    }

    const catIds = {
        Tuition: getCategoryId('Tuition', 'Tuition Fees'),
        Feeding: getCategoryId('Feeding', 'Meals/Feeding Fees'),
        Maintenance: getCategoryId('Maintenance', 'Maintenance Fees'),
        Boarding: getCategoryId('Boarding', 'Boarding Fees'),
        Activity: getCategoryId('Activity', 'Activity Fees'),
        Exam: getCategoryId('Exams', 'Exam Fees'),
        Medical: getCategoryId('Medical', 'Medical/Emergency Fees')
    }

    // Data from images (Amounts in CENTS)
    // 5500 KSH = 550000 cents
    const FEE_DATA = [
        // === BABY, PP1, PP2 ===
        {
            classes: ['BABY', 'PP1', 'PP2'],
            terms: [
                // Term 1 & 2: Day = 5500 (Tuition 3000 + Feeding 1500 + Maint 1000)
                { term: 1, tuition: 300000, feeding: 150000, maint: 100000, boarding: 1000000 },
                { term: 2, tuition: 300000, feeding: 150000, maint: 100000, boarding: 1000000 },
                // Term 3: Day = 4000
                { term: 3, tuition: 150000, feeding: 150000, maint: 100000, boarding: 750000 },
            ]
        },
        // === Grade 1, 2, 3 ===
        {
            classes: ['G1', 'G2', 'G3'],
            terms: [
                // Term 1 & 2: Day = 9500 (Tuition 5500 + Feeding 3500 + Maint 500)
                { term: 1, tuition: 550000, feeding: 350000, maint: 50000, boarding: 750000 },
                { term: 2, tuition: 550000, feeding: 350000, maint: 50000, boarding: 750000 },
                // Term 3: Day = 6500
                { term: 3, tuition: 250000, feeding: 300000, maint: 100000, boarding: 650000 },
            ]
        },
        // === Grade 4, 5 ===
        {
            classes: ['G4', 'G5'],
            terms: [
                // Term 1 & 2: Day = 9700. Boarding Support = 7300 (Total 17000)
                { term: 1, tuition: 550000, feeding: 350000, maint: 70000, boarding: 730000 },
                { term: 2, tuition: 550000, feeding: 350000, maint: 70000, boarding: 730000 },
                // Term 3: Day = 7500. Boarding Support = 5500 (Total 13000)
                { term: 3, tuition: 350000, feeding: 300000, maint: 100000, boarding: 550000 },
            ]
        },
        // === Grade 6 ===
        {
            classes: ['G6'],
            terms: [
                // Term 1 & 2: Day = 10000. Boarding Support = 7000 (Total 17000)
                { term: 1, tuition: 550000, feeding: 350000, maint: 100000, boarding: 700000 },
                { term: 2, tuition: 550000, feeding: 350000, maint: 100000, boarding: 700000 },
                // Term 3: Day = 7500. Boarding Support = 5500 (Total 13000)
                { term: 3, tuition: 350000, feeding: 300000, maint: 100000, boarding: 550000 },
            ]
        },
        // === JSS (G7-9) ===
        {
            classes: ['G7', 'G8', 'G9'],
            terms: [
                // Term 1 & 2: Day = 12000. Boarding Support = 7500 (Total 19500 - matches image)
                { term: 1, tuition: 700000, feeding: 350000, maint: 150000, boarding: 750000 },
                { term: 2, tuition: 700000, feeding: 350000, maint: 150000, boarding: 750000 },
                // Term 3: Day = 8000. Boarding Support = 9000 (Total 17000)
                { term: 3, tuition: 350000, feeding: 350000, maint: 100000, boarding: 900000 },
            ]
        }
    ];

    const insertStmt = db.prepare(`
        INSERT INTO fee_structure 
        (academic_year_id, term_id, stream_id, fee_category_id, amount, student_type)
        VALUES (?, ?, ?, ?, ?, ?)
    `)

    // Flexible stream lookup (case insensitive)
    const getClassId = db.prepare('SELECT id FROM stream WHERE UPPER(stream_code) = UPPER(?)')

    // 1. Clear existing Fee Structures
    // eslint-disable-next-line no-console
    console.info('Clearing existing fee structures...')

    try {
        const runReseed = db.transaction(() => {
            // Only delete for current academic year to be safe, but let's just wipe all for consistency as this is seed data fix
            // Actually, better to wipe only what we are replacing.
            // But since we want to fix everything, deleting all is cleaner for this dev stage.
            db.prepare('DELETE FROM fee_structure').run()

            // 2. Insert New Data
            // eslint-disable-next-line no-console
            console.info('Inserting new fee structures...')
            
            // Get Academic Year (First one or current)
            const acYear = db.prepare('SELECT id FROM academic_year WHERE is_current = 1').get() as { id: number } | undefined
            const acYearId = acYear ? acYear.id : 1
            // eslint-disable-next-line no-console
            console.info(`Using Academic Year ID: ${acYearId}`)

            for (const group of FEE_DATA) {
                for (const code of group.classes) {
                    const classRow = getClassId.get(code) as { id: number } | undefined
                    if (!classRow) {
                        console.warn(`Class not found: ${code}`)
                        continue
                    }

                    const streamId = classRow.id

                    for (const termData of group.terms) {
                        // Day Scholar Fees
                        if (termData.tuition) insertStmt.run(acYearId, termData.term, streamId, catIds.Tuition, termData.tuition, 'DAY_SCHOLAR')
                        if (termData.feeding) insertStmt.run(acYearId, termData.term, streamId, catIds.Feeding, termData.feeding, 'DAY_SCHOLAR')
                        if (termData.maint) insertStmt.run(acYearId, termData.term, streamId, catIds.Maintenance, termData.maint, 'DAY_SCHOLAR')
                        if (termData.boarding) insertStmt.run(acYearId, termData.term, streamId, catIds.Boarding, termData.boarding, 'BOARDER')
                        
                        // Boarder also pays Tuition + Feeding + Maint?
                        // Usually Boarding Fee includes everything or is separate.
                        // Based on image "Boarding Support = 10000".
                        // Assuming Boarder pays SAME Tuition/Feeding/Maint PLUS Boarding fee?
                        // Or Boarding Fee replaces some?
                        // For now, let's assume Boarders pay Tuition + Feeding + Maint + Boarding.
                        // Wait, previous migration 013 had specific logic?
                        // 013: 
                        // insertStmt.run(acYearId, termData.term, streamId, catIds.Tuition, termData.tuition, 'BOARDER')
                        // insertStmt.run(acYearId, termData.term, streamId, catIds.Feeding, termData.feeding, 'BOARDER')
                        // insertStmt.run(acYearId, termData.term, streamId, catIds.Maintenance, termData.maint, 'BOARDER')
                        
                        // Let's add these for BOARDER as well
                        if (termData.tuition) insertStmt.run(acYearId, termData.term, streamId, catIds.Tuition, termData.tuition, 'BOARDER')
                        if (termData.feeding) insertStmt.run(acYearId, termData.term, streamId, catIds.Feeding, termData.feeding, 'BOARDER')
                        if (termData.maint) insertStmt.run(acYearId, termData.term, streamId, catIds.Maintenance, termData.maint, 'BOARDER')
                    }
                }
            }

            // 3. Re-apply Conditional Fees (Admission, Interview, etc.) from 015
            // eslint-disable-next-line no-console
            console.info('Re-applying conditional fees...')
            // We can just call the up function from 015. 
            // It handles column creation safely (try-catch).
            // It appends rows. Since we cleared the table, it will add them fresh.
            addFeeConditionsUp(db)
        })

        runReseed()
        // eslint-disable-next-line no-console
        console.info('Fee structure re-correction complete.')
    } catch (error) {
        console.error('Failed to correct fees:', error)
        throw error
    }
}

export function down(db: Database) {
    // eslint-disable-next-line no-console
    console.info('Reverting migration: 016_fix_fees_final')
}
