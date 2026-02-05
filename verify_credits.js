import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'electron/main/database/school.db');
console.error('Opening DB at:', dbPath);

try {
    const db = new Database(dbPath);
    const students = db.prepare(`
        SELECT first_name, last_name, credit_balance 
        FROM student 
        WHERE credit_balance > 0
    `).all();

    console.error('Students with Credit Balance:');
    students.forEach(s => {
        // Divide by 100 to show shillings if stored in cents
        console.error(`${s.first_name} ${s.last_name}: ${s.credit_balance} cents (Ksh ${s.credit_balance / 100})`);
    });
} catch (e) {
    console.error(e);
}

