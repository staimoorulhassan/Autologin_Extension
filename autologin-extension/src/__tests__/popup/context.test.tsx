/**
 * Task 4: Popup Context Tests
 * Tests for React Context that manages PopupClient state
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { PopupClientProvider, usePopupClientContext } from '../../popup/context/PopupClientContext';

// Mock PopupClient
jest.mock('../../messaging/popupClient', () => ({
  PopupClient: jest.fn().mockImplementation(() => ({
    ping: jest.fn().mockResolvedValue(true),
    getCredentials: jest.fn().mockResolvedValue([]),
  })),
}));

// Test component that uses context
function TestComponent() {
  const { isReady } = usePopupClientContext();

  if (!isReady) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div data-testid="client-ready">Client Ready</div>
    </div>
  );
}

describe('Task 4: Popup Context', () => {
  describe('PopupClientContext', () => {
    test('should provide PopupClient instance', async () => {
      render(
        React.createElement(PopupClientProvider, {
          children: React.createElement(TestComponent),
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('client-ready')).toBeInTheDocument();
      });
    });

    test('should initialize and show ready state', async () => {
      render(
        React.createElement(PopupClientProvider, {
          children: React.createElement(TestComponent),
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('client-ready')).toBeInTheDocument();
      });
    });

    test('should throw if hook used outside provider', () => {
      // Suppress console errors for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        render(React.createElement(TestComponent));
      }).toThrow();

      consoleSpy.mockRestore();
    });

    test('should expose isReady state', async () => {
      render(
        React.createElement(PopupClientProvider, {
          children: React.createElement(TestComponent),
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('client-ready')).toBeInTheDocument();
      });
    });
  });
});
