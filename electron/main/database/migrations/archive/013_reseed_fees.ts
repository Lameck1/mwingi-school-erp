

import { Database } from 'better-sqlite3'

export function up(db: Database) {
    console.error('Running migration: 013_reseed_fees')

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
    const FEE_DATA = [
        // === BABY, PP1, PP2 ===
        {
            classes: ['BABY', 'PP1', 'PP2'],
            terms: [
                // Term 1 & 2: Day = 7000, Boarding Support = 10000 (Total 17000)
                { term: 1, tuition: 300000, feeding: 350000, maint: 50000, boarding: 1000000 },
                { term: 2, tuition: 300000, feeding: 350000, maint: 50000, boarding: 1000000 },
                // Term 3: Day = 5500, Boarding Support = 7500 (Total 13000)
                { term: 3, tuition: 200000, feeding: 250000, maint: 100000, boarding: 750000 },
            ]
        },
        // === Grade 1, 2, 3 ===
        {
            classes: ['G1', 'G2', 'G3'],
            terms: [
                // Term 1 & 2: Day = 9500, Boarding Support = 7500 (Total 17000)
                { term: 1, tuition: 550000, feeding: 350000, maint: 50000, boarding: 750000 },
                { term: 2, tuition: 550000, feeding: 350000, maint: 50000, boarding: 750000 },
                // Term 3: Day = 6500, Boarding Support = 6500 (Total 13000)
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
                // Day breakdown T3: Tution 3500, Feeding 3500, Maint 1000 = 8000.
                { term: 3, tuition: 350000, feeding: 350000, maint: 100000, boarding: 900000 },
            ]
        }
    ];

    const insertStmt = db.prepare(`
        INSERT INTO fee_structure 
        (academic_year_id, term_id, stream_id, fee_category_id, amount, student_type)
        VALUES (?, ?, ?, ?, ?, ?)
    `)

    const getClassId = db.prepare('SELECT id FROM stream WHERE stream_code = ?')

    // 1. Clear existing Fee Structures
    console.error('Clearing existing fee structures...')

    try {
        const runReseed = db.transaction(() => {
            db.prepare('DELETE FROM fee_structure').run()

            // 2. Insert New Data
            console.error('Inserting new fee structures...')
            let count = 0

            // Get Academic Year (First one or current)
            const acYear = db.prepare('SELECT id FROM academic_year WHERE is_current = 1').get() as { id: number } | undefined
            const acYearId = acYear ? acYear.id : 1
            console.warn(`Using Academic Year ID: ${acYearId}`)

            for (const group of FEE_DATA) {
                for (const code of group.classes) {
                    const classRow = getClassId.get(code) as { id: number } | undefined
                    if (!classRow) {
                        console.warn(`Class not found: ${code}`)
                        continue
                    }

                    for (const termData of group.terms) {
                        try {
                            // Day Scholar Items (Tuition, Feeding, Maintenance)
                            insertStmt.run(acYearId, termData.term, classRow.id, catIds.Tuition, termData.tuition, 'DAY_SCHOLAR')
                            insertStmt.run(acYearId, termData.term, classRow.id, catIds.Feeding, termData.feeding, 'DAY_SCHOLAR')
                            insertStmt.run(acYearId, termData.term, classRow.id, catIds.Maintenance, termData.maint, 'DAY_SCHOLAR')
                            count += 3

                            // Boarder Items (Tuition, Feeding, Maintenance + Boarding Fee)
                            insertStmt.run(acYearId, termData.term, classRow.id, catIds.Tuition, termData.tuition, 'BOARDER')
                            insertStmt.run(acYearId, termData.term, classRow.id, catIds.Feeding, termData.feeding, 'BOARDER')
                            insertStmt.run(acYearId, termData.term, classRow.id, catIds.Maintenance, termData.maint, 'BOARDER')
                            insertStmt.run(acYearId, termData.term, classRow.id, catIds.Boarding, termData.boarding, 'BOARDER')
                            count += 4
                        } catch (itemErr: unknown) {
                            console.error(`Failed to insert fees for Class ${code}, Term ${termData.term}:`, (itemErr as Error).message)
                            throw itemErr
                        }
                    }
                }
            }
            console.warn(`Inserted ${count} fee structure items.`)
        })

        runReseed()
    } catch (err: unknown) {
        console.error('Migration 013_reseed_fees FAILED:', err)
        console.error('Stack:', (err as Error).stack)
        // We re-throw so the app knows it failed, but now we have logs
        throw err
    }
}
