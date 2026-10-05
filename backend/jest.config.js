/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: ['src/services/**/*.ts', 'src/validation/**/*.ts', 'src/utils/**/*.ts', '!src/**/*.spec.ts'],
  // Testumgebung bekommt einen festen Test-Schlüssel – niemals produktiv verwenden.
  setupFiles: ['<rootDir>/src/test-setup.ts'],
};
