/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Handle __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = process.cwd();

console.log('==================================================');
console.log('       MWINGI SCHOOL ERP - STATUS CHECK           ');
console.log('==================================================');

// 1. Check Key Files (Phase 3 Deliverables)
const REQUIRED_FILES = [
  // UI Components
  'src/pages/Finance/CBC/CBCStrandManagement.tsx',
  'src/pages/Finance/CBC/JSSTransition.tsx',
  'src/pages/Operations/Boarding/BoardingProfitability.tsx',
  'src/pages/Operations/Transport/TransportRouteManagement.tsx',
  'src/pages/Finance/Grants/GrantTracking.tsx',
  'src/pages/Finance/StudentCost/StudentCostAnalysis.tsx',
  
  // Services
  'electron/main/services/operations/GrantTrackingService.ts',
  'electron/main/services/operations/StudentCostService.ts',
  'electron/main/services/operations/BoardingCostService.ts',
  'electron/main/services/operations/TransportCostService.ts',
  
  // IPC Handlers
  'electron/main/ipc/operations/operations-handlers.ts',
  'electron/main/ipc/operations/cbc-operations-handlers.ts',
  
  // API Types
  'src/types/electron-api/OperationsAPI.ts',
  'src/types/electron-api/JSSAPI.ts'
];

console.log('\n--- 1. Checking File Existence (Phase 3) ---');
let missingFiles = 0;
REQUIRED_FILES.forEach(file => {
    const fullPath = path.join(ROOT_DIR, file);
    if (fs.existsSync(fullPath)) {
        console.log(`[OK] ${file}`);
    } else {
        console.log(`[MISSING] ${file}`);
        missingFiles++;
    }
});

if (missingFiles === 0) {
    console.log('>> All required files are present.');
} else {
    console.log(`>> WARNING: ${missingFiles} required files are missing.`);
}

// 2. Check Database Migrations
console.log('\n--- 2. Checking Database Migrations ---');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'electron/main/database/migrations');
if (fs.existsSync(MIGRATIONS_DIR)) {
    const files = fs.readdirSync(MIGRATIONS_DIR);
    const requiredMigrations = [
        '012_cbc_features.ts',
        '008_asset_hire_exemptions.ts' 
    ];
    
    let missingMigrations = 0;
    requiredMigrations.forEach(mig => {
        const found = files.some(f => f.includes(mig.replace('.ts', '')) || f === mig);
        if (found) {
             console.log(`[OK] Migration found: ${mig}`);
        } else {
             console.log(`[WARNING] Migration might be missing: ${mig}`);
             missingMigrations++;
        }
    });
} else {
    console.log('[ERROR] Migrations directory not found!');
}

// 3. Check TypeScript Status
console.log('\n--- 3. Checking TypeScript Compilation ---');
console.log('Running tsc --noEmit (this may take a moment)...');
try {
    execSync('npx tsc --noEmit', { stdio: 'inherit' });
    console.log('[OK] TypeScript compilation passed.');
} catch (error) {
    console.log('[FAIL] TypeScript compilation failed. See output above.');
}

console.log('\n==================================================');
console.log('                 CHECK COMPLETE                   ');
console.log('==================================================');
