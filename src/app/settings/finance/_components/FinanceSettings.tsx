'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  PlusCircle, 
  Trash2, 
  Edit2,
  ArrowUpCircle, 
  ArrowDownCircle,
  Settings2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CashflowCategory } from '@/types';

export default function FinanceSettings() {
  const [categories, setCategories] = useState<CashflowCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('cashflow_categories')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Không thể tải danh mục');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    
    const channel = supabase
      .channel('category_settings_changes')
      .on('postgres_changes', { event: '*', table: 'cashflow_categories', schema: 'public' }, () => fetchCategories())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleAddCategory = async (type: 'income' | 'expense') => {
    const name = prompt(`Nhập tên danh mục ${type === 'income' ? 'thu' : 'chi'} mới:`);
    if (!name) return;

    try {
      const { error } = await supabase.from('cashflow_categories').insert([{
        name,
        type,
        color: type === 'income' ? '#10b981' : '#f43f5e'
      }]);

      if (error) throw error;
      toast.success('Đã thêm danh mục');
      fetchCategories();
    } catch (error) {
      toast.error('Lỗi khi thêm danh mục');
    }
  };

  const handleInitializeDefaultCategories = async () => {
    try {
      setLoading(true);
      const defaultCategories = [
        { name: 'Tiền phòng', type: 'income', color: '#10b981', is_system: true },
        { name: 'Minibar', type: 'income', color: '#3b82f6', is_system: false },
        { name: 'Giặt ủi', type: 'income', color: '#8b5cf6', is_system: false },
        { name: 'Nhập hàng', type: 'expense', color: '#f43f5e', is_system: false },
        { name: 'Điện nước', type: 'expense', color: '#f59e0b', is_system: false },
        { name: 'Lương nhân viên', type: 'expense', color: '#ef4444', is_system: false },
        { name: 'Sửa chữa', type: 'expense', color: '#64748b', is_system: false }
      ];

      const { error } = await supabase.from('cashflow_categories').insert(defaultCategories);
      if (error) throw error;
      
      toast.success('Đã khởi tạo danh mục mặc định');
      fetchCategories();
    } catch (error) {
      console.error('Initialization error:', error);
      toast.error('Không thể khởi tạo danh mục');
    } finally {
      setLoading(false);
    }
  };

  const handleEditCategory = async (category: CashflowCategory) => {
    if (category.is_system) {
      toast.error('Không thể sửa danh mục hệ thống');
      return;
    }
    const newName = prompt(`Nhập tên mới cho danh mục "${category.name}":`, category.name);
    if (!newName || newName === category.name) return;

    try {
      const { error } = await supabase
        .from('cashflow_categories')
        .update({ name: newName })
        .eq('id', category.id);

      if (error) throw error;
      toast.success('Đã cập nhật danh mục');
      fetchCategories();
    } catch (error) {
      toast.error('Lỗi khi cập nhật danh mục');
    }
  };

  const handleDeleteCategory = async (id: string, isSystem?: boolean) => {
    if (isSystem) {
      toast.error('Không thể xóa danh mục hệ thống');
      return;
    }
    if (!confirm('Bạn có chắc chắn muốn xóa danh mục này?')) return;

    try {
      const { error } = await supabase.from('cashflow_categories').delete().eq('id', id);
      if (error) throw error;
      toast.success('Đã xóa danh mục');
      fetchCategories();
    } catch (error) {
      toast.error('Lỗi khi xóa danh mục');
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* 1. Header Section - Apple Style */}
      <div className="relative overflow-hidden bg-white p-10 rounded-[3rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.05)] border-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-50 rounded-full blur-3xl -ml-24 -mb-24 opacity-50" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest">
              <Settings2 size={12} strokeWidth={3} />
              Cấu hình hệ thống
            </div>
            <h1 className="text-4xl font-black text-slate-800 uppercase tracking-tighter leading-none">
              Danh mục <span className="text-indigo-600">Thu Chi</span>
            </h1>
            <p className="text-slate-400 font-bold text-sm tracking-tight max-w-md">
              Tùy chỉnh các nguồn thu và khoản chi để báo cáo tài chính chính xác hơn.
            </p>
          </div>

          {categories.length === 0 && !loading && (
            <button 
              onClick={handleInitializeDefaultCategories}
              className="group relative flex items-center gap-4 p-1 pl-6 bg-slate-900 rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-slate-200"
            >
              <span className="text-white font-black uppercase text-[10px] tracking-widest">Thiết lập mặc định</span>
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white group-hover:bg-indigo-500 transition-colors">
                <PlusCircle size={20} />
              </div>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 2. Income Categories Section */}
        <div className="bg-white rounded-[3rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.05)] border-none overflow-hidden flex flex-col max-h-[600px]">
          <div className="p-8 pb-4 flex items-center justify-between shrink-0 sticky top-0 bg-white/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm shadow-emerald-100">
                <ArrowUpCircle size={24} strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Nguồn Thu</h3>
            </div>
            <button 
              onClick={() => handleAddCategory('income')}
              className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-emerald-500 hover:text-white transition-all duration-300 hover:shadow-lg hover:shadow-emerald-100 active:scale-90"
            >
              <PlusCircle size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 pt-0 no-scrollbar space-y-2">
            {categories.filter(c => c.type === 'income').length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center opacity-30">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Trống</p>
              </div>
            ) : (
              categories.filter(c => c.type === 'income').map(cat => (
                <div 
                  key={cat.id} 
                  className="group flex items-center justify-between p-3 pl-4 bg-slate-50/50 hover:bg-white rounded-[1.5rem] transition-all duration-300 hover:shadow-md active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-2 h-6 rounded-full shadow-sm" 
                      style={{ backgroundColor: cat.color }} 
                    />
                    <div className="flex flex-col">
                      <span className="font-black text-slate-700 text-xs uppercase tracking-tight">{cat.name}</span>
                      {cat.is_system && (
                        <span className="text-[7px] font-black uppercase text-emerald-500 tracking-widest">Hệ thống</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                    {!cat.is_system && (
                      <>
                        <button 
                          onClick={() => handleEditCategory(cat)}
                          className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:shadow-sm transition-all active:scale-90"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-400 hover:text-rose-600 hover:shadow-sm transition-all active:scale-90"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 3. Expense Categories Section */}
        <div className="bg-white rounded-[3rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.05)] border-none overflow-hidden flex flex-col max-h-[600px]">
          <div className="p-8 pb-4 flex items-center justify-between shrink-0 sticky top-0 bg-white/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 shadow-sm shadow-rose-100">
                <ArrowDownCircle size={24} strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Khoản Chi</h3>
            </div>
            <button 
              onClick={() => handleAddCategory('expense')}
              className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-rose-500 hover:text-white transition-all duration-300 hover:shadow-lg hover:shadow-rose-100 active:scale-90"
            >
              <PlusCircle size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 pt-0 no-scrollbar space-y-2">
            {categories.filter(c => c.type === 'expense').length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center opacity-30">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Trống</p>
              </div>
            ) : (
              categories.filter(c => c.type === 'expense').map(cat => (
                <div 
                  key={cat.id} 
                  className="group flex items-center justify-between p-3 pl-4 bg-slate-50/50 hover:bg-white rounded-[1.5rem] transition-all duration-300 hover:shadow-md active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-2 h-6 rounded-full shadow-sm" 
                      style={{ backgroundColor: cat.color }} 
                    />
                    <div className="flex flex-col">
                      <span className="font-black text-slate-700 text-xs uppercase tracking-tight">{cat.name}</span>
                      {cat.is_system && (
                        <span className="text-[7px] font-black uppercase text-rose-500 tracking-widest">Hệ thống</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                    {!cat.is_system && (
                      <>
                        <button 
                          onClick={() => handleEditCategory(cat)}
                          className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:shadow-sm transition-all active:scale-90"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-400 hover:text-rose-600 hover:shadow-sm transition-all active:scale-90"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
