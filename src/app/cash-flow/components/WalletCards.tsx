'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Wallet as WalletType } from '@/services/cashFlowService';
import { 
  Banknote, 
  Building2, 
  Lock, 
  UserMinus, 
  TrendingUp,
  Wallet,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WalletCardsProps {
  wallets: WalletType[];
  loading: boolean;
  selectedWalletId: string | null;
  onSelectWallet: (id: string | null) => void;
}

export default function WalletCards({ wallets, loading, selectedWalletId, onSelectWallet }: WalletCardsProps) {
  const [changes, setChanges] = useState<Record<string, { diff: number }>>({});
  const prevBalancesRef = useRef<Record<string, number>>({});
  const isMounted = useRef(false);

  // Restore state from LocalStorage on mount
  useEffect(() => {
    try {
      const savedChanges = localStorage.getItem('wallet_last_changes');
      if (savedChanges) {
        setChanges(JSON.parse(savedChanges));
      }
      
      const savedBalances = localStorage.getItem('wallet_prev_balances');
      if (savedBalances) {
        prevBalancesRef.current = JSON.parse(savedBalances);
      }
    } catch (e) {
      console.error('Failed to load wallet state', e);
    } finally {
      isMounted.current = true;
    }
  }, []);

  useEffect(() => {
    if (loading || wallets.length === 0 || !isMounted.current) return;

    // If first run (prevBalancesRef is empty), initialize it with current wallets
    if (Object.keys(prevBalancesRef.current).length === 0) {
      wallets.forEach(w => prevBalancesRef.current[w.id] = w.balance);
      localStorage.setItem('wallet_prev_balances', JSON.stringify(prevBalancesRef.current));
      return;
    }

    // Check if ANY balance has changed
    let hasAnyBalanceMoved = false;
    wallets.forEach(w => {
      const prev = prevBalancesRef.current[w.id];
      if (prev !== undefined && prev !== w.balance) {
        hasAnyBalanceMoved = true;
      }
    });

    if (hasAnyBalanceMoved) {
      // If any balance moved, this is a NEW transaction.
      // We discard ALL old indicators (even if some wallets didn't change in this turn)
      const currentTransactionChanges: Record<string, { diff: number }> = {};
      
      wallets.forEach(w => {
        const prev = prevBalancesRef.current[w.id];
        if (prev !== undefined && prev !== w.balance) {
          const diff = w.balance - prev;
          if (Math.abs(diff) > 0) {
            currentTransactionChanges[w.id] = { diff };
          }
        }
        // Always sync prev balance to current
        prevBalancesRef.current[w.id] = w.balance;
      });

      setChanges(currentTransactionChanges);
      localStorage.setItem('wallet_last_changes', JSON.stringify(currentTransactionChanges));
      localStorage.setItem('wallet_prev_balances', JSON.stringify(prevBalancesRef.current));
    }
  }, [wallets, loading]); // Remove changes from dependency to avoid loop, we merge inside if needed but here we construct new object


  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const getWalletIcon = (id: string) => {
    switch (id) {
      case 'CASH': return <Banknote size={24} />;
      case 'BANK': return <Building2 size={24} />;
      case 'ESCROW': return <Lock size={24} />;
      case 'RECEIVABLE': return <UserMinus size={24} />;
      case 'REVENUE': return <TrendingUp size={24} />;
      default: return <Wallet size={24} />;
    }
  };

  const getWalletColor = (id: string) => {
    switch (id) {
      case 'CASH': return 'bg-green-50 text-green-600 border-green-200';
      case 'BANK': return 'bg-blue-50 text-blue-600 border-blue-200';
      case 'ESCROW': return 'bg-orange-50 text-orange-600 border-orange-200';
      case 'RECEIVABLE': return 'bg-purple-50 text-purple-600 border-purple-200';
      case 'REVENUE': return 'bg-indigo-50 text-indigo-600 border-indigo-200';
      default: return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      {wallets.map((wallet) => {
        const isSelected = selectedWalletId === wallet.id;
        const colorClass = getWalletColor(wallet.id);
        
        return (
          <div 
            key={wallet.id}
            onClick={() => onSelectWallet(isSelected ? null : wallet.id)}
            className={cn(
              "cursor-pointer relative overflow-hidden transition-all duration-200",
              "p-4 rounded-xl border-2 hover:shadow-md",
              isSelected 
                ? `ring-2 ring-offset-2 ring-blue-500 ${colorClass}` 
                : "bg-white border-gray-100 hover:border-gray-200"
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={cn(
                "p-2 rounded-lg",
                isSelected ? "bg-white/50" : "bg-gray-50 text-gray-500"
              )}>
                {getWalletIcon(wallet.id)}
              </div>
              {isSelected && (
                <div className="px-2 py-1 bg-white/50 rounded text-[10px] font-bold uppercase tracking-wider">
                  Đang xem
                </div>
              )}
            </div>
            
            <div>
              <p className={cn(
                "text-sm font-medium mb-1",
                isSelected ? "opacity-80" : "text-gray-500"
              )}>
                {wallet.name}
              </p>
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className={cn(
                  "text-xl font-bold truncate",
                  isSelected ? "" : "text-gray-900"
                )}>
                  {formatMoney(wallet.balance)}
                </h3>
                
                {/* Diff Indicator - Side by Side */}
                {changes[wallet.id] && (
                  <div className={cn(
                      "text-xs font-bold flex items-center px-1.5 py-0.5 rounded-md animate-in fade-in slide-in-from-left-1 duration-300",
                      changes[wallet.id].diff > 0 
                        ? "text-emerald-700 bg-emerald-100/80" 
                        : "text-rose-700 bg-rose-100/80"
                  )}>
                      {changes[wallet.id].diff > 0 ? '+' : ''}{formatMoney(changes[wallet.id].diff)}
                  </div>
                )}
              </div>
            </div>

            {/* Background decoration */}
            <div className="absolute -bottom-4 -right-4 opacity-5 pointer-events-none transform rotate-12 scale-150">
               {getWalletIcon(wallet.id)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
