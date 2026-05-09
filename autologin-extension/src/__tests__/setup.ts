/**
 * Jest Test Setup
 * Configures testing environment and global mocks
 */

import '@testing-library/jest-dom';

// Chrome types are provided by @types/chrome — no redeclaration needed

declare const global: any;

global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    lastError: undefined,
    onMessage: {
      addListener: jest.fn()
    },
    onInstalled: {
      addListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    sendMessage: jest.fn()
  }
} as any;

// Suppress console logs in tests
const originalLog = console.log;
const originalError = console.error;

beforeEach(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
});

// Set up test timeout
jest.setTimeout(30000);
