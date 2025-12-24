'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Edit, Tag, Search, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type Category = {
  id: string;
  name: string;
  description: string | null;
};

export default function ServiceCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({ name: '', description: '' });

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('service_categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      toast.error('Lỗi khi tải danh sách loại dịch vụ.');
    } else {
      setCategories(data as Category[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, description } = formData;
    
    if (selectedCategory) {
      const { error } = await supabase
        .from('service_categories')
        .update({ name, description })
        .eq('id', selectedCategory.id);
      if (error) toast.error('Lỗi khi cập nhật');
      else {
        toast.success('Đã cập nhật');
        setIsDialogOpen(false);
        fetchCategories();
      }
    } else {
      const { error } = await supabase
        .from('service_categories')
        .insert([{ name, description }]);
      if (error) toast.error('Lỗi khi thêm mới');
      else {
        toast.success('Đã thêm mới');
        setIsDialogOpen(false);
        fetchCategories();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa?')) return;
    const { error } = await supabase.from('service_categories').delete().eq('id', id);
    if (error) toast.error('Lỗi khi xóa. Có thể có dịch vụ đang thuộc loại này.');
    else {
      toast.success('Đã xóa');
      fetchCategories();
    }
  };

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm tên loại dịch vụ..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-14 w-full rounded-2xl bg-slate-200/50 pl-12 pr-4 text-base font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-inner"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-[2rem] bg-slate-100" />
          ))
        ) : filteredCategories.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-slate-200 py-20 text-slate-400 bg-white/50">
            <Tag className="h-12 w-12 opacity-20 mb-4" />
            <p className="text-lg font-bold">Không tìm thấy loại dịch vụ</p>
          </div>
        ) : (
          filteredCategories.map((category) => (
            <motion.div
              key={category.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="group relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h4 className="text-lg font-black text-slate-800">{category.name}</h4>
                  <p className="text-sm text-slate-500 line-clamp-2">{category.description || 'Chưa có mô tả'}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => {
                      setSelectedCategory(category);
                      setFormData({ name: category.name, description: category.description || '' });
                      setIsDialogOpen(true);
                    }}
                    className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    <Edit size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(category.id)}
                    className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto">
        <button
          onClick={() => {
            setSelectedCategory(null);
            setFormData({ name: '', description: '' });
            setIsDialogOpen(true);
          }}
          className="flex h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-base font-bold text-white shadow-xl shadow-blue-200 active:scale-[0.96] transition-all"
        >
          <Plus className="h-5 w-5" />
          THÊM LOẠI MỚI
        </button>
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {isDialogOpen && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center p-4">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative w-full max-w-lg rounded-[2.5rem] bg-slate-50 p-8 shadow-2xl"
            >
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-800">{selectedCategory ? 'Sửa loại dịch vụ' : 'Thêm loại dịch vụ'}</h3>
                  <button type="button" onClick={() => setIsDialogOpen(false)} className="rounded-full bg-slate-200 p-2 text-slate-500 hover:bg-slate-300 transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    <Tag size={18} />
                    <span className="font-bold text-sm">Thông tin loại dịch vụ</span>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Tên loại</label>
                      <input 
                        type="text" 
                        required
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        placeholder="VD: Nước uống"
                        className="h-14 w-full rounded-2xl border-transparent bg-slate-50 px-4 text-base font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Mô tả</label>
                      <textarea 
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        placeholder="Mô tả ngắn về loại dịch vụ..."
                        rows={3}
                        className="w-full rounded-2xl border-transparent bg-slate-50 p-4 text-base font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsDialogOpen(false)} className="flex-1 h-14 rounded-2xl bg-slate-200 font-bold text-slate-600 hover:bg-slate-300 transition-colors">Hủy</button>
                  <button type="submit" className="flex-[2] flex h-14 items-center justify-center rounded-2xl bg-blue-600 font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                    <Save className="mr-2" size={20}/>
                    {selectedCategory ? 'Lưu thay đổi' : 'Thêm mới'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
