'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/lib/supabase';
import { Customer } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import { 
  UserCircle, 
  Plus, 
  Search, 
  Phone, 
  CreditCard, 
  ChevronLeft, 
  Edit, 
  Trash2, 
  X, 
  Save, 
  History,
  Car,
  TrendingUp,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Link from 'next/link';

// --- ZOD SCHEMA --- //
const customerSchema = z.object({
  full_name: z.string().min(1, 'Họ tên không được trống'),
  phone: z.string().min(10, 'Số điện thoại không hợp lệ'),
  id_card: z.string().min(1, 'Số CCCD/Passport không được trống'),
  plate_number: z.string().optional(),
  total_spent: z.coerce.number().default(0),
  visit_count: z.coerce.number().default(1),
});

type CustomerFormData = z.infer<typeof customerSchema>;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // --- DATA FETCHING --- //
  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Lỗi khi tải khách hàng:', error);
        toast.error('Lỗi khi tải danh sách khách hàng');
        // Fallback data for development
        setCustomers([
          { id: '1', full_name: 'Nguyễn Văn An', phone: '0987654321', id_card: '001234567890', total_spent: 1250000, visit_count: 3, plate_number: '51F-123.45', created_at: new Date().toISOString() },
          { id: '2', full_name: 'Trần Thị Bích', phone: '0912345678', id_card: '002345678901', total_spent: 780000, visit_count: 1, created_at: new Date().toISOString() },
          { id: '3', full_name: 'Lê Hoàng Long', phone: '0905123456', id_card: '003456789012', total_spent: 3400000, visit_count: 5, plate_number: '29A-678.90', created_at: new Date().toISOString() },
          { id: '4', full_name: 'Phạm Minh Châu', phone: '0334567890', id_card: '004567890123', total_spent: 550000, visit_count: 2, created_at: new Date().toISOString() },
        ]);
      } else {
        setCustomers(data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const { control, handleSubmit, reset, formState: { errors } } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      total_spent: 0,
      visit_count: 1,
    }
  });

  useEffect(() => {
    if (editingCustomer) {
      reset({
        full_name: editingCustomer.full_name,
        phone: editingCustomer.phone,
        id_card: editingCustomer.id_card,
        plate_number: editingCustomer.plate_number || '',
        total_spent: editingCustomer.total_spent,
        visit_count: editingCustomer.visit_count,
      });
    } else {
      reset({
        full_name: '',
        phone: '',
        id_card: '',
        plate_number: '',
        total_spent: 0,
        visit_count: 1,
      });
    }
  }, [editingCustomer, reset]);

  const onSubmit = async (data: CustomerFormData) => {
    try {
      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(data)
          .eq('id', editingCustomer.id);
        
        if (error) throw error;
        toast.success('Cập nhật khách hàng thành công!');
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([data]);
        
        if (error) throw error;
        toast.success('Thêm khách hàng mới thành công!');
      }
      setIsModalOpen(false);
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi lưu dữ liệu');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa khách hàng này?')) return;
    
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      toast.success('Đã xóa khách hàng');
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi xóa');
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery) ||
    c.id_card.includes(searchQuery)
  );

  return (
    <div className="pb-32 pt-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/settings" className="p-2 -ml-2 rounded-full active:bg-slate-200 transition-colors">
          <ChevronLeft className="h-6 w-6 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Quản lý Khách hàng</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Danh sách & Lịch sử</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-8 sticky top-16 z-30 py-2 bg-slate-50/80 backdrop-blur-sm -mx-4 px-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm tên, số điện thoại, CCCD..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-14 w-full rounded-2xl bg-slate-200/50 pl-12 pr-4 text-base font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-inner"
          />
        </div>
      </div>

      {/* Stats Summary (Mini) */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-[2rem] border border-blue-100">
          <div className="flex items-center gap-2 mb-1">
            <UserCircle size={14} className="text-blue-500" />
            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Tổng số khách</span>
          </div>
          <p className="text-2xl font-black text-blue-700">{customers.length}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded-[2rem] border border-emerald-100">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-emerald-500" />
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Chi tiêu TB</span>
          </div>
          <p className="text-2xl font-black text-emerald-700">
            {customers.length > 0 
              ? formatCurrency(customers.reduce((acc, c) => acc + (c.total_spent || 0), 0) / customers.length)
              : '0đ'
            }
          </p>
        </div>
      </div>

      {/* Customer Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AnimatePresence mode='popLayout'>
          {filteredCustomers.map((customer) => (
            <motion.div
              key={customer.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="group relative overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex items-start justify-between">
                <div className="flex gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400">
                    <User size={28} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-slate-800 leading-tight">{customer.full_name}</h3>
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-slate-400" />
                      <span className="text-xs font-bold text-slate-500">{customer.phone}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => { setEditingCustomer(customer); setIsModalOpen(true); }}
                    className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    <Edit size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(customer.id)}
                    className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-50 pt-4">
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Số lần ở</p>
                  <div className="flex items-center gap-1.5">
                    <History size={12} className="text-slate-300" />
                    <span className="text-xs font-black text-slate-700">{customer.visit_count} lần</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tổng chi tiêu</p>
                  <div className="flex items-center gap-1.5">
                    <TrendingUp size={12} className="text-emerald-400" />
                    <span className="text-xs font-black text-emerald-600">{formatCurrency(customer.total_spent)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
                  <CreditCard size={10} className="text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500">{customer.id_card}</span>
                </div>
                {customer.plate_number && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
                    <Car size={10} className="text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-500">{customer.plate_number}</span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => { setEditingCustomer(null); setIsModalOpen(true); }}
        className="fixed bottom-24 right-6 h-16 w-16 rounded-full bg-blue-600 text-white shadow-2xl shadow-blue-200 flex items-center justify-center z-40"
      >
        <Plus size={32} />
      </motion.button>

      {/* Modal / Dialog */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-lg bg-white rounded-t-[3rem] sm:rounded-[3rem] p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-800">
                    {editingCustomer ? 'Sửa khách hàng' : 'Thêm khách hàng'}
                  </h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Thông tin cá nhân</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-transform"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Họ và tên</label>
                    <div className="relative">
                      <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <Controller
                        name="full_name"
                        control={control}
                        render={({ field }) => (
                          <input
                            {...field}
                            className="h-14 w-full rounded-2xl bg-slate-50 pl-12 pr-4 text-base font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all border border-slate-100"
                            placeholder="VD: Nguyễn Văn A"
                          />
                        )}
                      />
                    </div>
                    {errors.full_name && <p className="text-rose-500 text-[10px] font-bold ml-4 uppercase">{errors.full_name.message}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Số điện thoại</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <Controller
                          name="phone"
                          control={control}
                          render={({ field }) => (
                            <input
                              {...field}
                              className="h-14 w-full rounded-2xl bg-slate-50 pl-12 pr-4 text-base font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all border border-slate-100"
                              placeholder="090..."
                            />
                          )}
                        />
                      </div>
                      {errors.phone && <p className="text-rose-500 text-[10px] font-bold ml-4 uppercase">{errors.phone.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">CCCD / Passport</label>
                      <div className="relative">
                        <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <Controller
                          name="id_card"
                          control={control}
                          render={({ field }) => (
                            <input
                              {...field}
                              className="h-14 w-full rounded-2xl bg-slate-50 pl-12 pr-4 text-base font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all border border-slate-100"
                              placeholder="001..."
                            />
                          )}
                        />
                      </div>
                      {errors.id_card && <p className="text-rose-500 text-[10px] font-bold ml-4 uppercase">{errors.id_card.message}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Biển số xe (nếu có)</label>
                    <div className="relative">
                      <Car className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <Controller
                        name="plate_number"
                        control={control}
                        render={({ field }) => (
                          <input
                            {...field}
                            className="h-14 w-full rounded-2xl bg-slate-50 pl-12 pr-4 text-base font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all border border-slate-100"
                            placeholder="51A-123.45"
                          />
                        )}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Số lần ở</label>
                      <Controller
                        name="visit_count"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            {...field}
                            className="h-14 w-full rounded-2xl bg-slate-50 px-4 text-base font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all border border-slate-100"
                          />
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Tổng chi tiêu (VNĐ)</label>
                      <Controller
                        name="total_spent"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            {...field}
                            className="h-14 w-full rounded-2xl bg-slate-50 px-4 text-base font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all border border-slate-100"
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="w-full h-16 rounded-[2rem] bg-blue-600 text-white font-black text-lg shadow-xl shadow-blue-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                  >
                    <Save size={24} />
                    {editingCustomer ? 'Lưu thay đổi' : 'Thêm khách hàng'}
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
