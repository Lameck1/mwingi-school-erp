const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../database/school_erp.db');
const db = new Database(dbPath);

try {
    const users = db.prepare('SELECT * FROM user').all();
    console.log('Users found:', users.length);
    if (users.length > 0) {
        console.log('Users:', JSON.stringify(users, null, 2));
    } else {
        console.log('No users found in database.');
    }
} catch (error) {
    console.error('Database Error:', error.message);
} finally {
    db.close();
}