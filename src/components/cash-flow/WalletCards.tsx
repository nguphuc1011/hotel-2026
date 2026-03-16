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
  RefreshCcw,
  Users,
  FileWarning
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';

interface WalletCardsProps {
  wallets: WalletType[];
  loading: boolean;
  selectedWalletId: string | null;
  onSelectWallet: (id: string | null) => void;
  onRefresh?: () => void;
  customerDebt: number;
  onViewCustomerDebt: () => void;
}

export default function WalletCards({ 
  wallets, 
  loading, 
  selectedWalletId, 
  onSelectWallet, 
  onRefresh,
  customerDebt,
  onViewCustomerDebt
}: WalletCardsProps) {
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
    } else {
       // Sync balances if empty
       if (Object.keys(prevBalancesRef.current).length === 0) {
          wallets.forEach(w => prevBalancesRef.current[w.id] = w.balance);
          localStorage.setItem('wallet_prev_balances', JSON.stringify(prevBalancesRef.current));
       }
    }
  }, [wallets, loading]); // Remove changes from dependency to avoid loop, we merge inside if needed but here we construct new object


  const getWalletIcon = (id: string) => {
    switch (id) {
      case 'CASH': return <Banknote size={24} />;
      case 'BANK': return <Building2 size={24} />;
      case 'RECEIVABLE': return <Lock size={24} />;
      case 'DEBT': return <UserMinus size={24} />;
      case 'REVENUE': return <TrendingUp size={24} />;
      default: return <Wallet size={24} />;
    }
  };

  const getWalletColor = (id: string) => {
    switch (id) {
      case 'CASH': return 'bg-emerald-50 text-emerald-600 border-emerald-200';
      case 'BANK': return 'bg-blue-50 text-blue-600 border-blue-200';
      case 'RECEIVABLE': return 'bg-orange-50 text-orange-600 border-orange-200';
      case 'DEBT': return 'bg-rose-50 text-rose-600 border-rose-200';
      case 'REVENUE': return 'bg-indigo-50 text-indigo-600 border-indigo-200';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  // Chuẩn hóa danh sách 5 ví để hiển thị
  const displayWallets = [
    wallets.find(w => w.id === 'CASH') || { id: 'CASH', name: 'Tiền mặt', balance: 0 },
    wallets.find(w => w.id === 'BANK') || { id: 'BANK', name: 'Ngân hàng', balance: 0 },
    wallets.find(w => w.id === 'RECEIVABLE') || { id: 'RECEIVABLE', name: 'Công nợ tạm', balance: 0 },
    { id: 'DEBT', name: 'Công nợ khách', balance: Math.abs(customerDebt) },
    wallets.find(w => w.id === 'REVENUE') || { id: 'REVENUE', name: 'Doanh thu', balance: 0 },
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {displayWallets.map((wallet) => {
          const isSelected = selectedWalletId === wallet.id;
          const colorClass = getWalletColor(wallet.id);
          const icon = getWalletIcon(wallet.id);
          
          return (
            <div 
              key={wallet.id}
              onClick={() => {
                if (wallet.id === 'DEBT') {
                  onViewCustomerDebt();
                } else {
                  onSelectWallet(isSelected ? null : wallet.id);
                }
              }}
              className={cn(
                "cursor-pointer relative overflow-hidden transition-all duration-300 group",
                "p-5 rounded-2xl border border-slate-100 bg-white hover:border-slate-200 hover:shadow-xl hover:shadow-slate-200/50",
                isSelected && "ring-2 ring-slate-900 ring-offset-2 border-transparent shadow-lg"
              )}
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className={cn(
                    "p-2.5 rounded-xl transition-colors duration-300",
                    colorClass
                  )}>
                    {icon}
                  </div>
                  {isSelected && (
                    <div className="px-2 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-wider">
                      Đang chọn
                    </div>
                  )}
                </div>
                
                <div className="space-y-1">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    {wallet.id === 'RECEIVABLE' ? 'Khách đang ở' : 
                     wallet.id === 'DEBT' ? 'Khách đã đi' :
                     wallet.name}
                  </p>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">
                    {formatMoney(wallet.balance)}
                  </h3>
                </div>
              </div>

              {/* Decorative Background Icon */}
              <div className="absolute -bottom-6 -right-6 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500 pointer-events-none transform rotate-12 scale-[2.5]">
                 {icon}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
