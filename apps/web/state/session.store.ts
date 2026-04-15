'use client';

import { create } from 'zustand';

type SessionState = {
  isAuthenticated: boolean;
  setAuthenticated: () => void;
  clearAuthenticated: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  isAuthenticated: false,
  setAuthenticated: () => set({ isAuthenticated: true }),
  clearAuthenticated: () => set({ isAuthenticated: false }),
}));
