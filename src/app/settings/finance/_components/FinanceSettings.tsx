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
    <div className="space-y-10">
      <div>
        <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight mb-2">Cấu hình Thu Chi</h1>
        <p className="text-slate-500 font-bold text-sm tracking-wide">Quản lý các danh mục thu và chi của khách sạn</p>
      </div>

      {categories.length === 0 && !loading && (
        <div className="p-8 bg-blue-50 rounded-[2rem] border border-blue-100 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h4 className="text-blue-900 font-black uppercase tracking-tight mb-1">Chưa có danh mục</h4>
            <p className="text-blue-600/80 text-sm font-bold">Thiết lập các danh mục mặc định cho khách sạn (Tiền phòng, Điện nước, Lương...)</p>
          </div>
          <Button 
            onClick={handleInitializeDefaultCategories}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] tracking-widest h-12 px-8 rounded-xl shadow-lg shadow-blue-200"
          >
            Thiết lập danh mục mặc định
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Income Categories */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <ArrowUpCircle className="text-emerald-500" size={20} /> Danh mục Thu
            </h3>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleAddCategory('income')}
              className="text-emerald-600 font-black text-[10px] uppercase tracking-widest gap-2"
            >
              <PlusCircle size={16} /> Thêm mới
            </Button>
          </div>
          <div className="space-y-3">
            {categories.filter(c => c.type === 'income').map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="font-bold text-slate-700">{cat.name}</span>
                  {cat.is_system && (
                    <span className="text-[8px] font-black uppercase bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">Hệ thống</span>
                  )}
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  {!cat.is_system && (
                    <>
                      <button 
                        onClick={() => handleEditCategory(cat)}
                        className="text-slate-300 hover:text-blue-500 transition-all"
                        title="Sửa"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="text-slate-300 hover:text-rose-500 transition-all"
                        title="Xóa"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Expense Categories */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <ArrowDownCircle className="text-rose-500" size={20} /> Danh mục Chi
            </h3>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleAddCategory('expense')}
              className="text-rose-600 font-black text-[10px] uppercase tracking-widest gap-2"
            >
              <PlusCircle size={16} /> Thêm mới
            </Button>
          </div>
          <div className="space-y-3">
            {categories.filter(c => c.type === 'expense').map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="font-bold text-slate-700">{cat.name}</span>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => handleEditCategory(cat)}
                    className="text-slate-300 hover:text-blue-500 transition-all"
                    title="Sửa"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="text-slate-300 hover:text-rose-500 transition-all"
                    title="Xóa"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
