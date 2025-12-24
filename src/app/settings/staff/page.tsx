'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';
import { cn } from '@/lib/utils';
import { 
  Users, 
  Plus, 
  Search, 
  Shield, 
  Phone, 
  User, 
  ChevronLeft, 
  Edit, 
  Trash2, 
  X, 
  Save, 
  CheckCircle2,
  Lock,
  Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Link from 'next/link';

// --- ZOD SCHEMA --- //
const staffSchema = z.object({
  username: z.string().min(3, 'Tên đăng nhập ít nhất 3 ký tự'),
  full_name: z.string().min(1, 'Họ tên không được trống'),
  role: z.enum(['admin', 'staff', 'manager']),
  phone: z.string().optional(),
  permissions: z.array(z.string()).default([]),
});

type StaffFormData = z.infer<typeof staffSchema>;

const ROLES = [
  { value: 'admin', label: 'Quản trị viên', icon: Shield, color: 'text-rose-600', bg: 'bg-rose-50' },
  { value: 'manager', label: 'Quản lý', icon: Lock, color: 'text-amber-600', bg: 'bg-amber-50' },
  { value: 'staff', label: 'Nhân viên', icon: User, color: 'text-blue-600', bg: 'bg-blue-50' },
];

const PERMISSIONS = [
  { id: 'CHECKIN_OUT', label: 'Check-in/Out' },
  { id: 'MANAGE_ROOMS', label: 'Quản lý phòng' },
  { id: 'MANAGE_SERVICES', label: 'Quản lý dịch vụ' },
  { id: 'VIEW_REPORTS', label: 'Xem báo cáo' },
  { id: 'MANAGE_STAFF', label: 'Quản lý nhân sự' },
];

export default function StaffPage() {
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'roles'>('list');

  // --- DATA FETCHING --- //
  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      // Giả sử bảng tên là 'profiles'
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('role');

      if (error) {
        console.error('Lỗi khi tải nhân viên:', error);
        // Fallback data if table doesn't exist for now
        setStaff([
          { id: '1', username: 'admin', full_name: 'Quản trị hệ thống', role: 'admin', phone: '0901234567', permissions: ['MANAGE_STAFF', 'VIEW_REPORTS', 'MANAGE_ROOMS', 'MANAGE_SERVICES', 'CHECKIN_OUT'], created_at: new Date().toISOString() },
          { id: '2', username: 'lethanh', full_name: 'Lê Thanh', role: 'manager', phone: '0907654321', permissions: ['VIEW_REPORTS', 'MANAGE_ROOMS', 'CHECKIN_OUT'], created_at: new Date().toISOString() },
          { id: '3', username: 'nhanvien1', full_name: 'Nguyễn An', role: 'staff', phone: '0912345678', permissions: ['CHECKIN_OUT'], created_at: new Date().toISOString() },
          { id: '4', username: 'nhanvien2', full_name: 'Trần Bình', role: 'staff', phone: '0987654321', permissions: ['CHECKIN_OUT', 'MANAGE_SERVICES'], created_at: new Date().toISOString() },
          { id: '5', username: 'quanly2', full_name: 'Phạm Văn', role: 'manager', phone: '0905555555', permissions: ['VIEW_REPORTS', 'MANAGE_ROOMS', 'MANAGE_SERVICES', 'CHECKIN_OUT'], created_at: new Date().toISOString() },
        ]);
      } else {
        setStaff(data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const { control, handleSubmit, reset, formState: { errors } } = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      role: 'staff',
      permissions: [],
    }
  });

  useEffect(() => {
    if (editingStaff) {
      reset({
        username: editingStaff.username,
        full_name: editingStaff.full_name,
        role: editingStaff.role,
        phone: editingStaff.phone || '',
        permissions: editingStaff.permissions || [],
      });
    } else {
      reset({
        username: '',
        full_name: '',
        role: 'staff',
        phone: '',
        permissions: [],
      });
    }
  }, [editingStaff, reset]);

  const onSubmit = async (data: StaffFormData) => {
    try {
      if (editingStaff) {
        const { error } = await supabase
          .from('profiles')
          .update(data)
          .eq('id', editingStaff.id);
        
        if (error) throw error;
        toast.success('Cập nhật nhân viên thành công!');
      } else {
        const { error } = await supabase
          .from('profiles')
          .insert([data]);
        
        if (error) throw error;
        toast.success('Thêm nhân viên mới thành công!');
      }
      setIsModalOpen(false);
      fetchStaff();
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi lưu dữ liệu');
      // Update local state if DB fails for demo purposes
      if (editingStaff) {
        setStaff(prev => prev.map(s => s.id === editingStaff.id ? { ...s, ...data } : s));
      } else {
        setStaff(prev => [...prev, { id: Math.random().toString(), ...data }]);
      }
      setIsModalOpen(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa nhân viên này?')) return;
    
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      toast.success('Đã xóa nhân viên');
      fetchStaff();
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi xóa');
      setStaff(prev => prev.filter(s => s.id !== id));
    }
  };

  const filteredStaff = staff.filter(s => 
    s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="pb-32 pt-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/settings" className="p-2 -ml-2 rounded-full active:bg-slate-200 transition-colors">
          <ChevronLeft className="h-6 w-6 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Quản lý Nhân viên</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phân quyền & Tài khoản</p>
        </div>
      </div>

      {/* Pill Tabs */}
      <div className="mb-8 flex p-1.5 bg-slate-200/50 rounded-[1.5rem] w-fit mx-auto sm:mx-0">
        <button
          onClick={() => setActiveTab('list')}
          className={cn(
            "px-6 py-2 rounded-full text-sm font-black transition-all",
            activeTab === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Danh sách
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={cn(
            "px-6 py-2 rounded-full text-sm font-black transition-all",
            activeTab === 'roles' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Vai trò
        </button>
      </div>

      {activeTab === 'list' ? (
        <>
          {/* Search Bar */}
          <div className="mb-8 sticky top-16 z-30 py-2 bg-slate-50/80 backdrop-blur-sm -mx-4 px-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên nhân viên, username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-14 w-full rounded-2xl bg-slate-200/50 pl-12 pr-4 text-base font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-inner"
              />
            </div>
          </div>

          {/* Staff Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AnimatePresence mode='popLayout'>
              {filteredStaff.map((person) => {
                const roleInfo = ROLES.find(r => r.value === person.role) || ROLES[2];
                return (
                  <motion.div
                    key={person.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group relative overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex gap-4">
                        <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center", roleInfo.bg)}>
                          <roleInfo.icon className={cn("h-7 w-7", roleInfo.color)} />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-lg font-black text-slate-800 leading-tight">{person.full_name}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">@{person.username}</span>
                            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider", roleInfo.bg, roleInfo.color)}>
                              {roleInfo.label}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setEditingStaff(person); setIsModalOpen(true); }}
                          className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <Edit size={18} />
                        </button>
                        <button 
                          onClick={() => handleDelete(person.id)}
                          className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center gap-6 border-t border-slate-50 pt-4">
                      <div className="flex items-center gap-2">
                        <Phone size={14} className="text-slate-300" />
                        <span className="text-xs font-bold text-slate-500">{person.phone || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Shield size={14} className="text-slate-300" />
                        <span className="text-xs font-bold text-slate-500">{person.permissions?.length || 0} quyền</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {ROLES.map((role) => (
            <div key={role.value} className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center", role.bg)}>
                  <role.icon className={cn("h-6 w-6", role.color)} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">{role.label}</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Phân quyền mặc định</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {PERMISSIONS.map(p => (
                  <span key={p.id} className="px-3 py-1 bg-slate-50 rounded-full text-[10px] font-bold text-slate-500 border border-slate-100">
                    {p.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => { setEditingStaff(null); setIsModalOpen(true); }}
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
                    {editingStaff ? 'Sửa nhân viên' : 'Thêm nhân viên'}
                  </h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Thông tin tài khoản</p>
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
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Username</label>
                      <Controller
                        name="username"
                        control={control}
                        render={({ field }) => (
                          <input
                            {...field}
                            className="h-14 w-full rounded-2xl bg-slate-50 px-4 text-base font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all border border-slate-100"
                            placeholder="admin123"
                          />
                        )}
                      />
                      {errors.username && <p className="text-rose-500 text-[10px] font-bold ml-4 uppercase">{errors.username.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Số điện thoại</label>
                      <Controller
                        name="phone"
                        control={control}
                        render={({ field }) => (
                          <input
                            {...field}
                            className="h-14 w-full rounded-2xl bg-slate-50 px-4 text-base font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all border border-slate-100"
                            placeholder="090..."
                          />
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Vai trò</label>
                    <div className="grid grid-cols-3 gap-2">
                      {ROLES.map((role) => (
                        <Controller
                          key={role.value}
                          name="role"
                          control={control}
                          render={({ field }) => (
                            <button
                              type="button"
                              onClick={() => field.onChange(role.value)}
                              className={cn(
                                "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2",
                                field.value === role.value 
                                  ? "border-blue-500 bg-blue-50" 
                                  : "border-slate-100 bg-white hover:border-slate-200"
                              )}
                            >
                              <role.icon className={cn("h-6 w-6", field.value === role.value ? "text-blue-600" : "text-slate-400")} />
                              <span className={cn("text-[10px] font-black uppercase tracking-tighter", field.value === role.value ? "text-blue-600" : "text-slate-500")}>
                                {role.label}
                              </span>
                            </button>
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Phân quyền</label>
                    <div className="flex flex-wrap gap-2">
                      {PERMISSIONS.map((perm) => (
                        <Controller
                          key={perm.id}
                          name="permissions"
                          control={control}
                          render={({ field }) => {
                            const isSelected = field.value?.includes(perm.id);
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  const current = field.value || [];
                                  if (isSelected) field.onChange(current.filter(i => i !== perm.id));
                                  else field.onChange([...current, perm.id]);
                                }}
                                className={cn(
                                  "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border",
                                  isSelected 
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                                    : "bg-slate-50 text-slate-400 border-slate-100"
                                )}
                              >
                                {perm.label}
                              </button>
                            );
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="w-full h-16 rounded-[2rem] bg-blue-600 text-white font-black text-lg shadow-xl shadow-blue-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                  >
                    <Save size={24} />
                    {editingStaff ? 'Lưu thay đổi' : 'Thêm nhân viên'}
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
