import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'electron/main/database/school.db');

console.error('Opening DB at:', dbPath);
const db = new Database(dbPath);

const CATEGORIES = {
    TUITION: 'Tuition',
    FEEDING: 'Feeding',
    MAINT: 'Maintenance',
    BOARDING: 'Boarding'
};

function getCategoryId(name) {
    const row = db.prepare('SELECT id FROM fee_category WHERE category_name = ?').get(name);
    if (!row) {
        console.error(`Creating category: ${name}`);
        const info = db.prepare('INSERT INTO fee_category (category_name, description) VALUES (?, ?)').run(name, name + ' Fees');
        return info.lastInsertRowid;
    }
    return row.id;
}

const catIds = {
    Tuition: getCategoryId(CATEGORIES.TUITION),
    Feeding: getCategoryId(CATEGORIES.FEEDING),
    Maintenance: getCategoryId(CATEGORIES.MAINT),
    Boarding: getCategoryId(CATEGORIES.BOARDING)
};

// Data from images (Amounts in CENTS)
const FEE_DATA = [
    // === BABY, PP1, PP2 ===
    {
        classes: ['BABY', 'PP1', 'PP2'],
        terms: [
            // Term 1 & 2: Day = 7000, Boarding = 17000 (Diff 10000)
            { term: 1, tuition: 300000, feeding: 350000, maint: 50000, boarding: 1000000 },
            { term: 2, tuition: 300000, feeding: 350000, maint: 50000, boarding: 1000000 },
            // Term 3: Day = 5500, Boarding = 13000 (Diff 7500)
            { term: 3, tuition: 200000, feeding: 250000, maint: 100000, boarding: 750000 },
        ]
    },
    // === Grade 1, 2, 3 ===
    {
        classes: ['G1', 'G2', 'G3'],
        terms: [
            // Term 1 & 2: Day = 9500, Boarding Total = 17000 (Diff 7500)
            { term: 1, tuition: 550000, feeding: 350000, maint: 50000, boarding: 750000 },
            { term: 2, tuition: 550000, feeding: 350000, maint: 50000, boarding: 750000 },
            // Term 3: Day = 6500, Boarding Total = 13000 (Diff 6500)
            { term: 3, tuition: 250000, feeding: 300000, maint: 100000, boarding: 650000 },
        ]
    },
    // === Grade 4, 5 ===
    {
        classes: ['G4', 'G5'],
        terms: [
            // Term 1 & 2: Day = 9700. Boarding Total = 17000 (Diff 7300)
            { term: 1, tuition: 550000, feeding: 350000, maint: 70000, boarding: 730000 },
            { term: 2, tuition: 550000, feeding: 350000, maint: 70000, boarding: 730000 },
            // Term 3: Day = 7500. Boarding Total = 13000 (Diff 5500)
            { term: 3, tuition: 350000, feeding: 300000, maint: 100000, boarding: 550000 }, // Assuming 13k for term 3 based on trend
        ]
    },
    // === Grade 6 ===
    {
        classes: ['G6'],
        terms: [
             // Term 1 & 2: Day = 10000. Boarding Total = 17000 (Diff 7000)
             { term: 1, tuition: 550000, feeding: 350000, maint: 100000, boarding: 700000 },
             { term: 2, tuition: 550000, feeding: 350000, maint: 100000, boarding: 700000 },
             // Term 3: Day = 7500. Boarding Total = 13000 (Diff 5500)
             { term: 3, tuition: 350000, feeding: 300000, maint: 100000, boarding: 550000 },
        ]
    },
    // === JSS (G7-9) ===
    {
        classes: ['G7', 'G8', 'G9'],
        terms: [
            // Term 1 & 2: Day = 12000. Boarding = 19500 (Diff 7500)
            { term: 1, tuition: 700000, feeding: 350000, maint: 150000, boarding: 750000 },
            { term: 2, tuition: 700000, feeding: 350000, maint: 150000, boarding: 750000 },
            // Term 3: Day = 8000. Boarding = 17000 (Diff 9000)
            { term: 3, tuition: 350000, feeding: 350000, maint: 100000, boarding: 900000 },
        ]
    }
];

const insertStmt = db.prepare(`
    INSERT INTO fee_structure 
    (academic_year_id, term_id, class_id, fee_category_id, amount, student_type, is_optional)
    VALUES (?, ?, ?, ?, ?, ?, 0)
`);

const getClassId = db.prepare('SELECT id FROM stream WHERE stream_code = ?');

db.transaction(() => {
    console.error('Clearing existing fee structures...');
    db.prepare('DELETE FROM fee_structure').run();

    console.error('Inserting new fee structures...');
    
    for (const group of FEE_DATA) {
        for (const code of group.classes) {
            const classRow = getClassId.get(code);
            if (!classRow) {
                console.warn(`Class not found: ${code}`);
                continue;
            }
            
            for (const termData of group.terms) {
                // Day Scholar Items (Tuition, Feeding, Maintenance)
                insertStmt.run(1, termData.term, classRow.id, catIds.Tuition, termData.tuition, 'DAY_SCHOLAR');
                insertStmt.run(1, termData.term, classRow.id, catIds.Feeding, termData.feeding, 'DAY_SCHOLAR');
                insertStmt.run(1, termData.term, classRow.id, catIds.Maintenance, termData.maint, 'DAY_SCHOLAR');
                
                // Boarder Items (Tuition, Feeding, Maintenance + Boarding Fee)
                insertStmt.run(1, termData.term, classRow.id, catIds.Tuition, termData.tuition, 'BOARDER');
                insertStmt.run(1, termData.term, classRow.id, catIds.Feeding, termData.feeding, 'BOARDER');
                insertStmt.run(1, termData.term, classRow.id, catIds.Maintenance, termData.maint, 'BOARDER');
                insertStmt.run(1, termData.term, classRow.id, catIds.Boarding, termData.boarding, 'BOARDER');
            }
        }
    }
})();

console.error('Reseed complete!');

