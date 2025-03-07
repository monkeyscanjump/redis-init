module.exports = {
  testEnvironment: 'node',
  collectCoverage: false,
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/tests/"
  ],
  collectCoverageFrom: [
    'lib/**/*.js'
  ],
  coverageReporters: ['text', 'lcov', 'clover'],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  setupFilesAfterEnv: ['./tests/setup.js']
};
