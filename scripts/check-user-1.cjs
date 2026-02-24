const Database = require('better-sqlite3');
const { resolveDatabasePath } = require('./lib/db-path.cjs');

const dbPath = resolveDatabasePath();
const db = new Database(dbPath);

try {
    console.error('Using database:', dbPath);
    const user = db.prepare('SELECT * FROM user WHERE id = 1').get();
    if (user) {
        console.error('User 1 found:', user.username);
    } else {
        console.error('User 1 NOT found.');
    }
} catch (error) {
    console.error('Database Error:', error.message);
} finally {
    db.close();
}

