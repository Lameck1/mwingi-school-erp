const Database = require('better-sqlite3');
const { resolveDatabasePath } = require('./lib/db-path.cjs');

const dbPath = resolveDatabasePath();
const db = new Database(dbPath);

try {
    console.error('Using database:', dbPath);
    const users = db.prepare('SELECT * FROM user').all();
    console.error('Users found:', users.length);
    if (users.length > 0) {
        console.error('Users:', JSON.stringify(users, null, 2));
    } else {
        console.error('No users found in database.');
    }
} catch (error) {
    console.error('Database Error:', error.message);
} finally {
    db.close();
}
