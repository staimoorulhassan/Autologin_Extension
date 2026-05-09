/**
 * Task 4: PopupClientContext
 * React Context that provides PopupClient instance to entire popup UI
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { PopupClient } from '../../messaging/popupClient';
import { MessageSystem } from '../../messaging/messageSystem';

interface PopupClientContextValue {
  client: PopupClient;
  isReady: boolean;
}

const PopupClientContext = createContext<PopupClientContextValue | undefined>(undefined);

interface PopupClientProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that initializes and provides PopupClient to children
 */
export function PopupClientProvider({ children }: PopupClientProviderProps) {
  const [client, setClient] = useState<PopupClient | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initialize message system and PopupClient
    const messageSystem = new MessageSystem();
    const popupClient = new PopupClient(messageSystem);

    setClient(popupClient);
    setIsReady(true);
  }, []);

  if (!client) {
    return null;
  }

  return (
    <PopupClientContext.Provider value={{ client, isReady }}>
      {children}
    </PopupClientContext.Provider>
  );
}

/**
 * Hook to use PopupClient context
 */
export function usePopupClientContext(): PopupClientContextValue {
  const context = useContext(PopupClientContext);

  if (!context) {
    throw new Error('usePopupClientContext must be used within PopupClientProvider');
  }

  return context;
}
