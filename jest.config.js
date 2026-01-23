export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/electron/main'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/*.test.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^\\.\\./database\\.js$': '<rootDir>/electron/main/database/index',
    '^\\.\\./database/utils/(.*)$': '<rootDir>/electron/main/database/utils/$1',
    '^\\.\\./database/(.*)$': '<rootDir>/electron/main/database/$1'
  },
  collectCoverageFrom: [
    'electron/main/**/*.ts',
    '!electron/main/**/*.d.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  transformIgnorePatterns: [
    'node_modules/(?!(bcryptjs)/)'
  ]
};