'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Edit, Tag, Search, X, Save, AlertCircle } from 'lucide-react';
import { useNotification } from '@/context/NotificationContext';

type Category = {
  id: string;
  name: string;
  description: string | null;
};

export default function ServiceCategories() {
  const { showNotification } = useNotification();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({ name: '', description: '' });

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('service_categories')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setCategories(data as Category[] || []);
    } catch (err: any) {
      console.error('Lỗi tải loại dịch vụ:', err);
      setError(err.message);
      showNotification('Lỗi khi tải danh sách loại dịch vụ.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      let result;
      if (selectedCategory) {
        result = await supabase
          .from('service_categories')
          .update(formData)
          .eq('id', selectedCategory.id);
      } else {
        result = await supabase
          .from('service_categories')
          .insert([formData]);
      }

      if (result.error) throw result.error;

      showNotification(selectedCategory ? 'Đã cập nhật' : 'Đã thêm mới', 'success');
      setIsDialogOpen(false);
      fetchCategories();
    } catch (err: any) {
      console.error('Lỗi lưu loại dịch vụ:', err);
      alert(`LỖI:\n${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa loại dịch vụ này? Các dịch vụ thuộc loại này sẽ trở thành "Chưa phân loại".')) return;

    try {
      const { error } = await supabase.from('service_categories').delete().eq('id', id);
      if (error) throw error;
      showNotification('Đã xóa', 'success');
      fetchCategories();
    } catch (err: any) {
      console.error('Lỗi xóa:', err);
      showNotification('Lỗi khi xóa. Có thể có dữ liệu liên quan.', 'error');
    }
  };

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (error) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="h-12 w-12 text-rose-500 mx-auto mb-4" />
        <p className="text-slate-800 font-bold mb-4">Lỗi tải dữ liệu: {error}</p>
        <button onClick={() => fetchCategories()} className="bg-blue-600 text-white px-6 py-2 rounded-xl">Thử lại</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm tên loại..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 w-full rounded-xl bg-white border border-slate-200 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => {
            setSelectedCategory(null);
            setFormData({ name: '', description: '' });
            setIsDialogOpen(true);
          }}
          className="h-12 px-6 rounded-xl bg-blue-600 text-white font-bold flex items-center gap-2"
        >
          <Plus size={20} />
          Thêm loại
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          [1,2].map(i => <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-2xl" />)
        ) : filteredCategories.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
            <Tag size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-bold">Chưa có loại dịch vụ nào</p>
          </div>
        ) : (
          filteredCategories.map((category) => (
            <div key={category.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
              <div>
                <h4 className="font-bold text-slate-800">{category.name}</h4>
                <p className="text-xs text-slate-500">{category.description || 'Không có mô tả'}</p>
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={() => {
                    setSelectedCategory(category);
                    setFormData({ name: category.name, description: category.description || '' });
                    setIsDialogOpen(true);
                  }}
                  className="p-2 text-slate-400 hover:text-blue-600"
                >
                  <Edit size={18} />
                </button>
                <button onClick={() => handleDelete(category.id)} className="p-2 text-slate-400 hover:text-rose-600">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">{selectedCategory ? 'Sửa loại' : 'Thêm loại mới'}</h3>
              <button onClick={() => setIsDialogOpen(false)}><X /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Tên loại</label>
                <input 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full h-12 bg-slate-50 rounded-xl px-4 outline-none border border-transparent focus:border-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Mô tả</label>
                <textarea 
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-slate-50 rounded-xl p-4 outline-none border border-transparent focus:border-blue-500"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsDialogOpen(false)} className="flex-1 h-12 rounded-xl bg-slate-100 font-bold">Hủy</button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-[2] h-12 rounded-xl bg-blue-600 text-white font-bold"
                >
                  {submitting ? 'Đang lưu...' : 'Lưu dữ liệu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
