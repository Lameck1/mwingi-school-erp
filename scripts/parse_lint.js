
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('lint_output.json', 'utf8'));

console.log('--- ERRORS ---');
report.forEach(file => {
    if (file.errorCount > 0) {
        console.log(`File: ${file.filePath}`);
        file.messages.forEach(msg => {
            if (msg.severity === 2) {
                console.log(`  Line ${msg.line}: [${msg.ruleId}] ${msg.message}`);
            }
        });
    }
});

console.log('\n--- WARNINGS (Top 10 Files) ---');

report.sort((a, b) => b.warningCount - a.warningCount).slice(0, 10).forEach(file => {
    if (file.warningCount > 0) {
        console.log(`File: ${file.filePath} (${file.warningCount} warnings)`);
        file.messages.slice(0, 3).forEach(msg => { // First 3 per file
             if (msg.severity === 1) {
                console.log(`  Line ${msg.line}: [${msg.ruleId}] ${msg.message}`);
            }
        });
        if (file.warningCount > 3) console.log('  ...');
    }
});
