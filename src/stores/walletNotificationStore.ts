import { create } from 'zustand';

export interface WalletChange {
  walletName: string;
  diff: number;
  newBalance?: number;
}

interface WalletNotificationState {
  isOpen: boolean;
  changes: WalletChange[];
  showNotification: (changes: WalletChange[]) => void;
  closeNotification: () => void;
}

export const useWalletNotificationStore = create<WalletNotificationState>((set) => ({
  isOpen: false,
  changes: [],
  showNotification: (changes) => set({ isOpen: true, changes }),
  closeNotification: () => set({ isOpen: false }),
}));
