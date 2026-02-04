// jest.setup.cjs - Global test setup and configuration

require('@testing-library/jest-dom');

// Mock electron IPC for tests
global.window = global.window || {};
global.window.electronAPI = {
  // Academic APIs
  getAcademicExams: jest.fn(),
  getExams: jest.fn(),
  getStreams: jest.fn(),
  getSubjects: jest.fn(),
  getStudents: jest.fn(),
  getTerms: jest.fn(),
  getAcademicYears: jest.fn(),

  // Merit List APIs
  generateMeritList: jest.fn(),
  getSubjectMeritList: jest.fn(),
  getMeritRankings: jest.fn(),
  getSubjectAnalytics: jest.fn(),
  getMostImprovedStudents: jest.fn(),
  exportToExcel: jest.fn(),
  exportToPDF: jest.fn(),

  // Exam Scheduling APIs
  generateExamTimetable: jest.fn(),
  detectExamClashes: jest.fn(),
  exportExamTimetableToPDF: jest.fn(),
  getVenues: jest.fn(),

  // Analytics APIs
  getPerformanceSummary: jest.fn(),
  getGradeDistribution: jest.fn(),
  getSubjectPerformance: jest.fn(),
  getStrugglingStudents: jest.fn(),
  getTermComparison: jest.fn(),
  exportAnalyticsToPDF: jest.fn(),

  // Awards APIs
  getAwards: jest.fn(),
  getAwardCategories: jest.fn(),
  awardStudent: jest.fn(),
  approveAward: jest.fn(),
  deleteAward: jest.fn(),

  // Most Improved APIs
  generateCertificate: jest.fn(),
  emailParents: jest.fn(),

  // Report Card APIs
  generateReportCards: jest.fn(),
  exportReportCardsToPDF: jest.fn(),

  // Settings APIs
  getSettings: jest.fn(),
  getCurrentAcademicYear: jest.fn(),
  getCurrentTerm: jest.fn(),
};

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};

// Setup default mock implementations
global.window.electronAPI.getAcademicExams.mockResolvedValue([]);
global.window.electronAPI.getStreams.mockResolvedValue([]);
global.window.electronAPI.getSubjects.mockResolvedValue([]);
global.window.electronAPI.getExams.mockResolvedValue([]);
global.window.electronAPI.getTerms.mockResolvedValue([]);
