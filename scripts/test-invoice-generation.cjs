const { getDatabase } = require('../electron/main/database/index.js');
const { registerFinanceHandlers } = require('../electron/main/ipc/finance/finance-handlers.ts');

const academicYearId = 1; // 2025
const termId = 1; // Term 1
void registerFinanceHandlers; // Suppress unused variable warning

console.log('--- Testing Batch Invoice Generation Logic ---');

const db = getDatabase();
// We are not actually running the app, so we don't need to register handlers, 
// but we might want to ensure the DB is initialized.
// For this script, we are just using the DB directly.

// 1. Get Fee Structure
const structure = db.prepare(`
    SELECT * FROM fee_structure 
    WHERE academic_year_id = ? AND term_id = ?
`).all(academicYearId, termId);

console.log(`Fee Structure Items found: ${structure.length}`);
if (structure.length > 0) {
    console.log('Sample structure item:', structure[0]);
}

// 2. Get Active Students with Enrollment
const enrollments = db.prepare(`
    SELECT e.*, s.first_name, s.last_name 
    FROM enrollment e
    JOIN student s ON e.student_id = s.id
    WHERE e.academic_year_id = ? AND e.term_id = ? AND e.status = 'ACTIVE'
`).all(academicYearId, termId);

console.log(`Active Enrollments found: ${enrollments.length}`);

if (structure.length > 0 && enrollments.length > 0) {
    console.log('Ready to generate...');
    
    // Simulate generation loop
    let count = 0;
    const checkInvoiceStmt = db.prepare('SELECT id FROM fee_invoice WHERE student_id = ? AND term_id = ?');
    
    for (const enrollment of enrollments) {
        const existing = checkInvoiceStmt.get(enrollment.student_id, enrollment.term_id);
        if (existing) {
            console.log(`Skipping student ${enrollment.student_id} (Invoice exists)`);
            continue;
        }

        const fees = structure.filter(f => 
            f.stream_id === enrollment.stream_id && 
            f.student_type === enrollment.student_type
        );

        if (fees.length === 0) {
             console.log(`No fees defined for Student ${enrollment.student_id} (Stream: ${enrollment.stream_id}, Type: ${enrollment.student_type})`);
             continue;
        }

        const total = fees.reduce((sum, f) => sum + f.amount, 0);
        console.log(`Will generate invoice for Student ${enrollment.student_id}: Amount ${total}`);
        count++;
    }
    
    console.log(`Total invoices to be generated: ${count}`);
} else {
    console.log('Cannot generate: Missing structure or enrollments.');
}