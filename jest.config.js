export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/server', '<rootDir>/client', '<rootDir>/shared'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/client/src/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],
};


