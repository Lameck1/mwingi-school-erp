
const db = require('better-sqlite3')('C:/Users/lamec/AppData/Roaming/mwingi-school-erp/data/school_erp.db');

try {
    const users = db.prepare('SELECT * FROM users').all();
    console.log('Users found:', users.length);
    if (users.length > 0) {
        console.log('Users:', JSON.stringify(users, null, 2));
    } else {
        console.log('No users found in database.');
    }
} catch (error) {
    console.error('Database Error:', error.message);
}
