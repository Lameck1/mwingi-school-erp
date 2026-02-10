
const fs = require('node:fs');
const path = require('node:path');

try {
    const reportPath = path.resolve(process.argv[2] || 'lint_output.json');
    if (!fs.existsSync(reportPath)) {
        console.error(`${process.argv[2] || 'lint_output.json'} not found!`);
        process.exit(1);
    }
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    console.log('--- ERRORS ---');
    let errorC = 0;
    report.forEach(file => {
        if (file.errorCount > 0) {
            errorC++;
            console.log(`File: ${file.filePath}`);
            file.messages.forEach(msg => {
                if (msg.severity === 2) {
                    console.log(`  Line ${msg.line}: [${msg.ruleId}] ${msg.message}`);
                }
            });
        }
    });

    if (errorC === 0) console.log('No errors found.');

    console.log('\n--- WARNINGS (Top 10 Files) ---');
    const warningFiles = report.filter(f => f.warningCount > 0).sort((a, b) => b.warningCount - a.warningCount);
    warningFiles.slice(0, 10).forEach(file => {
        console.log(`File: ${file.filePath} (${file.warningCount} warnings)`);
        file.messages.slice(0, 3).forEach(msg => {
             if (msg.severity === 1) {
                console.log(`  Line ${msg.line}: [${msg.ruleId}] ${msg.message}`);
            }
        });
        if (file.warningCount > 3) console.log('  ...');
    });
} catch (e) {
    console.error(e);
}
