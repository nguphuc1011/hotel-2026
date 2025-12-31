'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumericInput } from '@/components/ui/NumericInput';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Package, Search, AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { Service } from '@/types';
import { cn } from '@/lib/utils';

interface InventoryAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
}

interface AuditItem {
  service_id: string;
  name: string;
  expected_stock: number;
  actual_stock: number;
  discrepancy: number;
}

export const InventoryAuditModal: React.FC<InventoryAuditModalProps> = ({
  isOpen,
  onClose,
  services
}) => {
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Initialize audit items from active services
      const initialItems = services.map(s => ({
        service_id: s.id,
        name: s.name,
        expected_stock: s.stock || 0,
        actual_stock: s.stock || 0,
        discrepancy: 0
      }));
      setAuditItems(initialItems);
      setNotes('');
      setSearchQuery('');
    }
  }, [isOpen, services]);

  const handleActualStockChange = (serviceId: string, value: number) => {
    setAuditItems(prev => prev.map(item => {
      if (item.service_id === serviceId) {
        const actual = Math.max(0, value);
        return {
          ...item,
          actual_stock: actual,
          discrepancy: actual - item.expected_stock
        };
      }
      return item;
    }));
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery) return auditItems;
    return auditItems.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [auditItems, searchQuery]);

  const stats = useMemo(() => {
    const totalDiscrepancy = auditItems.reduce((sum, item) => sum + Math.abs(item.discrepancy), 0);
    const issuesCount = auditItems.filter(item => item.discrepancy !== 0).length;
    return { totalDiscrepancy, issuesCount };
  }, [auditItems]);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.full_name || user?.email || 'Nhân viên';

      // 1. Create inventory audit record
      const { data: audit, error: auditError } = await supabase
        .from('inventory_audits')
        .insert([{
          staff_id: user?.id,
          staff_name: userName,
          items: auditItems,
          notes: notes,
          status: 'completed'
        }])
        .select()
        .single();

      if (auditError) throw auditError;

      // 2. Update stock in services table for items with discrepancy
      const updates = auditItems
        .filter(item => item.discrepancy !== 0)
        .map(item => supabase
          .from('services')
          .update({ stock: item.actual_stock })
          .eq('id', item.service_id)
        );

      if (updates.length > 0) {
        await Promise.all(updates);
      }

      toast.success('Đã hoàn tất kiểm kho và cập nhật số tồn thực tế');
      onClose();
    } catch (error: any) {
      toast.error('Lỗi khi lưu phiếu kiểm kho: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-none w-screen h-screen m-0 p-0 overflow-hidden bg-white border-none rounded-none shadow-none z-[9999] flex flex-col">
        <DialogHeader className="p-8 pb-4 flex-shrink-0 border-b border-slate-100">
          <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
            <DialogTitle className="text-3xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-4">
              <Package className="text-blue-600" size={32} /> Kiểm kho vật tư
            </DialogTitle>
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="rounded-full w-12 h-12 p-0 hover:bg-slate-100 text-slate-400"
            >
              <Package className="rotate-45" size={24} />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50/30">
          <div className="max-w-5xl mx-auto w-full p-8 space-y-10">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Tìm kiếm dịch vụ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-12 pl-12 pr-6 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold focus:border-blue-600 outline-none transition-all"
              />
            </div>
            <div className={cn(
              "px-6 h-12 rounded-2xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest",
              stats.issuesCount > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
            )}>
              {stats.issuesCount > 0 ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
              {stats.issuesCount > 0 ? `${stats.issuesCount} mặt hàng chênh lệch` : "Kho khớp 100%"}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto rounded-3xl border border-slate-100 bg-slate-50/50">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white shadow-sm z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Mặt hàng</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tồn sổ sách</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tồn thực tế</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Chênh lệch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr key={item.service_id} className="bg-white/50 hover:bg-white transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-700">{item.name}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-black text-slate-400">{item.expected_stock}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <NumericInput
                          value={item.actual_stock}
                          onChange={(val) => handleActualStockChange(item.service_id, val)}
                          className={cn(
                            "w-24 h-10 text-center font-black rounded-xl border-2 transition-all",
                            item.discrepancy !== 0 ? "border-rose-200 bg-rose-50 text-rose-600" : "border-slate-100 bg-white text-slate-700"
                          )}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn(
                        "font-black",
                        item.discrepancy === 0 ? "text-slate-300" : 
                        item.discrepancy > 0 ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {item.discrepancy > 0 ? '+' : ''}{item.discrepancy}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 pb-4">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ghi chú kiểm kho</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Lý do chênh lệch, tình trạng hàng hóa..."
              className="h-24 rounded-2xl border-slate-100 bg-slate-50 font-bold placeholder:text-slate-300 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="p-8 bg-slate-50 flex gap-4 border-t border-slate-100">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="flex-1 h-16 rounded-2xl font-black uppercase text-xs tracking-widest text-slate-400 hover:text-slate-600"
          >
            Đóng
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-[2] h-16 rounded-2xl font-black uppercase text-sm tracking-[0.2em] bg-slate-900 hover:bg-black text-white shadow-xl shadow-slate-200 transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Đang lưu..." : "Xác nhận hoàn tất kiểm kho"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
