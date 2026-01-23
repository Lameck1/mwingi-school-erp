
 
const db = require('better-sqlite3')('C:/Users/lamec/AppData/Roaming/mwingi-school-erp/data/school_erp.db');

try {
    const user = db.prepare('SELECT * FROM user WHERE id = 1').get();
    if (user) {
        console.log('User 1 found:', user.username);
    } else {
        console.log('User 1 NOT found.');
    }
} catch (error) {
    console.error('Database Error:', error.message);
}
