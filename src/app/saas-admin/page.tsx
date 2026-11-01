'use client';

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Users, 
  Phone, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Search,
  Edit2,
  Trash2,
  ExternalLink,
  Sparkles,
  SlidersHorizontal,
  ChevronRight,
  ArrowLeft,
  X,
  Check,
  Globe
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';

interface Hotel {
  id: string;
  name: string;
  phone: string;
  status: string;
  slug: string;
  created_at: string;
  features?: Record<string, boolean>;
}

export default function SaaSAdminPage() {
  const { can, isLoading: isAuthLoading } = usePermission();
  const { confirm: confirmDialog } = useGlobalDialog();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null);
  const [selectedHotelForFeatures, setSelectedHotelForFeatures] = useState<Hotel | null>(null);

  const FEATURE_LABELS: Record<string, { label: string; desc: string }> = {
    shift_management: { label: 'Quản lý ca làm việc', desc: 'Bàn giao ca, đối soát tiền mặt thực tế vs sổ sách' },
    employee_debt: { label: 'Quản lý nợ nhân viên', desc: 'Ghi nhận và thu nợ nhân viên khi lệch ca' },
    advanced_reports: { label: 'Báo cáo P&L nâng cao', desc: 'Phân tích doanh thu, chi phí OpEx và giá vốn COGS' },
    saas_admin_access: { label: 'Quyền truy cập SaaS Admin', desc: 'Cho phép tài khoản này truy cập phòng quản trị tổng' },
    admin_command_center: { label: 'Trung tâm chỉ huy (Command Center)', desc: 'Theo dõi hoạt động và giao dịch nhạy cảm realtime' }
  };

  // Form state
  const [formData, setFormData] = useState({
    hotelName: '',
    adminName: '',
    adminPhone: '',
    adminPin: '',
    hotelSlug: ''
  });

  useEffect(() => {
    fetchHotels();
  }, []);

  const fetchHotels = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('hotels')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHotels(data || []);
    } catch (error: any) {
      toast.error('Lỗi tải danh sách khách hàng: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingHotel(null);
    setFormData({ hotelName: '', adminName: '', adminPhone: '', adminPin: '1234', hotelSlug: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (hotel: Hotel) => {
    setEditingHotel(hotel);
    setFormData({ 
      hotelName: hotel.name, 
      adminName: '', 
      adminPhone: hotel.phone || '', 
      adminPin: '', 
      hotelSlug: hotel.slug 
    });
    setIsModalOpen(true);
  };

  const handleOpenFeatures = (hotel: Hotel) => {
    setSelectedHotelForFeatures(hotel);
    setIsFeatureModalOpen(true);
  };

  const handleToggleFeature = async (featureKey: string) => {
    if (!selectedHotelForFeatures) return;

    const currentFeatures = selectedHotelForFeatures.features || {};
    const updatedFeatures = {
      ...currentFeatures,
      [featureKey]: !currentFeatures[featureKey]
    };

    try {
      const { error } = await supabase
        .from('hotels')
        .update({ features: updatedFeatures })
        .eq('id', selectedHotelForFeatures.id);

      if (error) throw error;

      setSelectedHotelForFeatures({
        ...selectedHotelForFeatures,
        features: updatedFeatures
      });
      
      setHotels(hotels.map(h => 
        h.id === selectedHotelForFeatures.id 
          ? { ...h, features: updatedFeatures } 
          : h
      ));
      
      toast.success(`Đã cập nhật tính năng cho ${selectedHotelForFeatures.name}`);
    } catch (error: any) {
      toast.error('Lỗi cập nhật tính năng: ' + error.message);
    }
  };

  const handleDeleteHotel = async (id: string, name: string) => {
    const confirmed = await confirmDialog({
      title: `Xác nhận xóa khách sạn "${name}"?`,
      message: 'Hành động này sẽ XÓA VĨNH VIỄN toàn bộ cơ sở dữ liệu gồm Phòng, Đơn đặt, Dịch vụ, Sổ quỹ và Nhân viên của khách sạn này. Không thể hoàn tác!',
      confirmLabel: 'XÓA TOÀN BỘ DỮ LIỆU',
      type: 'confirm'
    });

    if (!confirmed) return;

    try {
      const { data, error } = await supabase.rpc('fn_delete_hotel', { p_hotel_id: id });
      if (error) throw error;
      if (data?.success) {
        toast.success(data.message);
        fetchHotels();
      } else {
        toast.error(data?.message || 'Xóa thất bại');
      }
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingHotel) {
      setIsSubmitting(true);
      try {
        const { data, error } = await supabase.rpc('fn_update_hotel', {
          p_hotel_id: editingHotel.id,
          p_name: formData.hotelName.trim(),
          p_phone: formData.adminPhone.trim(),
          p_slug: formData.hotelSlug.trim().toLowerCase()
        });

        if (error) throw error;
        
        if (data && data.success) {
          toast.success(data.message);
          setIsModalOpen(false);
          fetchHotels();
        } else {
          toast.error(data?.message || 'Cập nhật thất bại');
        }
      } catch (error: any) {
        toast.error('Lỗi cập nhật: ' + error.message);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      if (!formData.hotelName || !formData.adminName || !formData.adminPhone || !formData.adminPin) {
        return toast.error('Vui lòng nhập đầy đủ thông tin bắt buộc');
      }

      setIsSubmitting(true);
      try {
        const { data, error } = await supabase.rpc('fn_onboard_new_hotel', {
          p_hotel_name: formData.hotelName.trim(),
          p_admin_name: formData.adminName.trim(),
          p_admin_phone: formData.adminPhone.trim(),
          p_admin_pin: formData.adminPin.trim(),
          p_hotel_slug: formData.hotelSlug.trim().toLowerCase() || null
        });

        if (error) throw error;

        if (data && data.success) {
          toast.success('Khởi tạo khách hàng mới thành công!');
          setIsModalOpen(false);
          fetchHotels();
        } else {
          toast.error(data?.message || 'Khởi tạo thất bại');
        }
      } catch (error: any) {
        toast.error('Lỗi: ' + error.message);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const filteredHotels = hotels.filter(h => {
    const matchSearch = 
      h.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      h.phone?.includes(searchTerm) ||
      h.slug?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchSearch) return false;
    if (statusFilter === 'active') return h.status === 'active';
    if (statusFilter === 'inactive') return h.status !== 'active';
    return true;
  });

  const activeHotelsCount = hotels.filter(h => h.status === 'active').length;
  const newThisMonthCount = hotels.filter(h => {
    const d = new Date(h.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-slate-600 animate-spin" />
          <p className="text-sm font-medium text-slate-500">Đang kiểm tra quyền quản trị...</p>
        </div>
      </div>
    );
  }

  if (!can(PERMISSION_KEYS.VIEW_SAAS_ADMIN)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] p-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mb-4">
          <ShieldCheck size={32} />
        </div>
        <h1 className="text-xl font-bold text-slate-800 mb-1">Truy cập bị từ chối</h1>
        <p className="text-sm text-slate-500 max-w-sm mb-6">Bạn không có quyền quản trị hệ thống SaaS. Vui lòng đăng nhập với tài khoản Quản trị viên cấp cao.</p>
        <button 
          onClick={() => window.history.back()}
          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-all"
        >
          Quay lại trang trước
        </button>
      </div>
    );
  }

  return (
    <div className="text-slate-900">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6 pb-24">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-700 text-white flex items-center justify-center shadow-sm">
              <Building2 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">SaaS Multi-Tenant Admin</h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                  Global
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">Quản lý trung tâm, cấp phát khách hàng mới và phân bổ tính năng</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchHotels}
              className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl text-slate-600 transition-all shadow-sm"
              title="Làm mới dữ liệu"
            >
              <Loader2 size={18} className={loading ? "animate-spin" : ""} />
            </button>
            <button 
              onClick={handleOpenCreate}
              className="h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-[0.98]"
            >
              <Plus size={18} /> Thêm khách hàng mới
            </button>
          </div>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng khách sạn</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{hotels.length}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 size={24} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Đang hoạt động</p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">{activeHotelsCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={24} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mới trong tháng</p>
              <p className="text-3xl font-bold text-purple-600 mt-1">{newThisMonthCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Sparkles size={24} />
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Tìm theo tên khách sạn, số điện thoại, slug..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200/80 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-400 transition-all"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium hidden sm:inline">Lọc trạng thái:</span>
              <div className="inline-flex bg-slate-100 p-1 rounded-xl text-xs font-medium">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Tất cả ({hotels.length})
                </button>
                <button
                  onClick={() => setStatusFilter('active')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'active' ? 'bg-white text-emerald-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Hoạt động
                </button>
                <button
                  onClick={() => setStatusFilter('inactive')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'inactive' ? 'bg-white text-rose-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Tạm khóa
                </button>
              </div>
            </div>
          </div>

          {/* Hotels Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200/60 text-xs font-semibold text-slate-500">
                  <th className="px-5 py-3.5">Khách sạn & Đường dẫn (Slug)</th>
                  <th className="px-5 py-3.5">Số điện thoại liên hệ</th>
                  <th className="px-5 py-3.5">Trạng thái</th>
                  <th className="px-5 py-3.5">Tính năng Pro</th>
                  <th className="px-5 py-3.5">Ngày tạo</th>
                  <th className="px-5 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-slate-500">Đang tải danh sách khách sạn...</p>
                    </td>
                  </tr>
                ) : filteredHotels.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-300 flex items-center justify-center mx-auto mb-3">
                        <Building2 size={28} />
                      </div>
                      <p className="text-base font-semibold text-slate-700">Không tìm thấy khách hàng nào</p>
                      <p className="text-xs text-slate-400 mt-1">Thử thay đổi từ khóa tìm kiếm hoặc bấm Thêm khách hàng mới.</p>
                    </td>
                  </tr>
                ) : (
                  filteredHotels.map((hotel) => {
                    const activeFeaturesCount = Object.values(hotel.features || {}).filter(Boolean).length;
                    return (
                      <tr key={hotel.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-sm shadow-sm group-hover:bg-slate-200/80 transition-all">
                              {hotel.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{hotel.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/50">
                                  /{hotel.slug}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-slate-600 font-medium text-xs">
                            <Phone size={13} className="text-slate-400" />
                            {hotel.phone || 'Chưa cập nhật'}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            hotel.status === 'active' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70' 
                              : 'bg-rose-50 text-rose-700 border border-rose-200/70'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${hotel.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            {hotel.status === 'active' ? 'Hoạt động' : 'Tạm khóa'}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <button
                            onClick={() => handleOpenFeatures(hotel)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition-all"
                            title="Bấm để cấu hình tính năng"
                          >
                            <SlidersHorizontal size={13} className="text-slate-500" />
                            <span>{activeFeaturesCount} / {Object.keys(FEATURE_LABELS).length} bật</span>
                          </button>
                        </td>

                        <td className="px-5 py-4 text-xs text-slate-500 font-medium">
                          {new Date(hotel.created_at).toLocaleDateString('vi-VN')}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <a 
                              href={`/${hotel.slug}/login`} 
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Mở cổng đăng nhập của khách sạn này"
                            >
                              <ExternalLink size={16} />
                            </a>
                            <button 
                              onClick={() => handleOpenEdit(hotel)}
                              className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                              title="Sửa thông tin"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteHotel(hotel.id, hotel.name)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Xóa khách sạn"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Tạo / Sửa khách sạn */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {editingHotel ? 'Cập nhật thông tin khách sạn' : 'Khởi tạo khách hàng mới (Onboarding)'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {editingHotel ? 'Chỉnh sửa tên, số điện thoại hoặc đường dẫn slug' : 'Hệ thống tự động thiết lập ví tiền, bảng giá, phòng mẫu và tài khoản Owner'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tên khách sạn <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      required
                      value={formData.hotelName}
                      onChange={e => setFormData({ ...formData, hotelName: e.target.value })}
                      placeholder="VD: Khách Sạn Sài Gòn Star"
                      className="w-full h-11 pl-10 pr-3.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Đường dẫn truy cập (Slug) <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      required={!editingHotel}
                      value={formData.hotelSlug}
                      onChange={e => setFormData({ ...formData, hotelSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                      placeholder="VD: saigon-star"
                      className="w-full h-11 pl-10 pr-3.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-mono transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Đường dẫn đăng nhập sẽ là: <code className="font-mono text-slate-600 bg-slate-100 px-1 py-0.5 rounded">/{formData.hotelSlug || 'slug'}/login</code></p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Số điện thoại liên hệ <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="tel" 
                      required
                      value={formData.adminPhone}
                      onChange={e => setFormData({ ...formData, adminPhone: e.target.value })}
                      placeholder="VD: 0912345678"
                      className="w-full h-11 pl-10 pr-3.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                    />
                  </div>
                </div>

                {!editingHotel && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Họ tên Chủ khách sạn (Owner) <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                          type="text" 
                          required
                          value={formData.adminName}
                          onChange={e => setFormData({ ...formData, adminName: e.target.value })}
                          placeholder="VD: Nguyễn Văn A"
                          className="w-full h-11 pl-10 pr-3.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mã PIN đăng nhập ban đầu <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                          type="text" 
                          required
                          maxLength={6}
                          value={formData.adminPin}
                          onChange={e => setFormData({ ...formData, adminPin: e.target.value })}
                          placeholder="VD: 1234"
                          className="w-full h-11 pl-10 pr-3.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-mono tracking-wider transition-all"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {!editingHotel && (
                  <div className="bg-blue-50/80 border border-blue-200/60 rounded-xl p-3.5 flex gap-2.5">
                    <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={16} />
                    <p className="text-xs text-blue-800 leading-relaxed font-medium">
                      Khi bấm khởi tạo, Backend tự động sinh sẵn Ví tiền mặt/ngân hàng, danh mục Thu Chi chuẩn, cấu hình bảng giá mẫu và Phòng 101 để khách sạn có thể dùng ngay.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-all"
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-all"
                  >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                    {editingHotel ? 'Lưu thay đổi' : 'Khởi tạo ngay'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Cấu hình Tính năng Pro */}
        {isFeatureModalOpen && selectedHotelForFeatures && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles size={18} className="text-emerald-600" /> Cấu hình tính năng
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Khách sạn: <span className="font-semibold text-slate-800">{selectedHotelForFeatures.name}</span>
                  </p>
                </div>
                <button 
                  onClick={() => setIsFeatureModalOpen(false)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-3">
                {Object.keys(FEATURE_LABELS).map((featureKey) => {
                  const isEnabled = selectedHotelForFeatures.features?.[featureKey] === true;
                  const item = FEATURE_LABELS[featureKey];
                  return (
                    <div 
                      key={featureKey}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-all"
                    >
                      <div className="pr-4">
                        <p className="font-semibold text-slate-900 text-sm">{item.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleFeature(featureKey)}
                        className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 ease-in-out shrink-0 focus:outline-none ${
                          isEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${
                          isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                <button 
                  onClick={() => setIsFeatureModalOpen(false)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
