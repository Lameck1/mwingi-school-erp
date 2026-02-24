const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATABASE_FILE_CANDIDATES = ['school_erp_clean_v3.db', 'school_erp.db'];

function getUserDataDirCandidates() {
  if (process.env.MWINGI_USER_DATA_DIR && process.env.MWINGI_USER_DATA_DIR.trim().length > 0) {
    return [process.env.MWINGI_USER_DATA_DIR.trim()];
  }

  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [
      path.join(appData, 'mwingi-school-erp'),
      path.join(appData, 'Mwingi School ERP'),
    ];
  }

  return [
    path.join(home, '.config', 'mwingi-school-erp'),
    path.join(home, '.config', 'Mwingi School ERP'),
  ];
}

function resolveDatabasePath() {
  const userDataDirs = getUserDataDirCandidates();

  for (const userDataDir of userDataDirs) {
    const dataDir = path.join(userDataDir, 'data');
    for (const fileName of DATABASE_FILE_CANDIDATES) {
      const candidatePath = path.join(dataDir, fileName);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return path.join(userDataDirs[0], 'data', DATABASE_FILE_CANDIDATES[0]);
}

module.exports = {
  getUserDataDirCandidates,
  resolveDatabasePath,
  DATABASE_FILE_CANDIDATES,
};
