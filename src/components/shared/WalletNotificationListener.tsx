'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Wallet } from '@/services/cashFlowService';
import WalletNotificationModal, { WalletChange } from './WalletNotificationModal';

export default function WalletNotificationListener() {
  const [changes, setChanges] = useState<WalletChange[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('wallet-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallets',
        },
        (payload) => {
          const newWallet = payload.new as Wallet;
          const oldWallet = payload.old as Wallet;

          // Check if balance actually changed
          if (oldWallet.balance !== undefined && newWallet.balance !== oldWallet.balance) {
            const diff = newWallet.balance - oldWallet.balance;
            
            const newChange: WalletChange = {
              walletName: newWallet.name,
              diff,
              newBalance: newWallet.balance,
              timestamp: Date.now()
            };

            setChanges(prev => [newChange, ...prev].slice(0, 5)); // Keep last 5 changes
            setIsOpen(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <WalletNotificationModal 
      isOpen={isOpen} 
      onClose={() => {
        setIsOpen(false);
        setChanges([]); // Clear history on close
      }} 
      changes={changes} 
    />
  );
}
