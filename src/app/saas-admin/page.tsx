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
  ArrowRight,
  LayoutDashboard,
  Search,
  Edit2,
  Trash2,
  MoreVertical,
  ExternalLink
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

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
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null);
  const [selectedHotelForFeatures, setSelectedHotelForFeatures] = useState<Hotel | null>(null);

  const FEATURE_LABELS: Record<string, string> = {
    shift_management: 'Quản lý ca làm việc',
    employee_debt: 'Quản lý nợ nhân viên',
    advanced_reports: 'Báo cáo nâng cao (P&L)',
    saas_admin_access: 'Quyền truy cập SaaS Admin'
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
    setFormData({ hotelName: '', adminName: '', adminPhone: '', adminPin: '', hotelSlug: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (hotel: Hotel) => {
    setEditingHotel(hotel);
    setFormData({ 
      hotelName: hotel.name, 
      adminName: '', // Không sửa admin qua form này để bảo mật
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

    const updatedFeatures = {
      ...(selectedHotelForFeatures.features || {}),
      [featureKey]: !selectedHotelForFeatures.features?.[featureKey]
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
      
      // Update local list
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
    if (!confirm(`CẢNH BÁO CỰC KỲ QUAN TRỌNG:\n\nBạn có chắc chắn muốn xóa khách sạn "${name}"?\n\nHành động này sẽ XÓA VĨNH VIỄN toàn bộ dữ liệu bao gồm: Phòng, Đơn đặt, Tiền tệ, Nhân viên và Khách hàng của khách sạn này.\n\nKHÔNG THỂ PHỤC HỒI!`)) {
      return;
    }

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
      // Logic Update
      setIsSubmitting(true);
      try {
        const { data, error } = await supabase.rpc('fn_update_hotel', {
          p_hotel_id: editingHotel.id,
          p_name: formData.hotelName,
          p_phone: formData.adminPhone,
          p_slug: formData.hotelSlug
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
      // Logic Create (Giữ nguyên RPC cũ)
      if (!formData.hotelName || !formData.adminName || !formData.adminPhone || !formData.adminPin) {
        return toast.error('Vui lòng nhập đầy đủ thông tin');
      }

      setIsSubmitting(true);
      try {
        const { data, error } = await supabase.rpc('fn_onboard_new_hotel', {
          p_hotel_name: formData.hotelName,
          p_admin_name: formData.adminName,
          p_admin_phone: formData.adminPhone,
          p_admin_pin: formData.adminPin,
          p_hotel_slug: formData.hotelSlug || null
        });

        if (error) throw error;

        if (data && data.success) {
          toast.success(data.message);
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

  const filteredHotels = hotels.filter(h => 
    h.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    h.phone?.includes(searchTerm) ||
    h.slug?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-32">
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-lg shadow-accent/20">
              <LayoutDashboard size={24} />
            </div>
            <h1 className="text-4xl font-black-italic tracking-tighter uppercase italic text-accent">SaaS Admin</h1>
          </div>
          <p className="text-slate-500 font-bold text-sm tracking-tight uppercase tracking-[0.1em]">Trung tâm chỉ huy & Onboarding khách hàng</p>
        </div>

        <button 
          onClick={handleOpenCreate}
          className="h-14 px-8 bg-accent hover:bg-accent/90 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-accent/20 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
        >
          <Plus size={24} /> Tạo khách hàng mới
        </button>
      </header>

      {/* Stats Quick View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Tổng khách hàng</p>
          <p className="text-4xl font-black text-slate-800">{hotels.length}</p>
        </div>
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Đang hoạt động</p>
          <p className="text-4xl font-black text-emerald-500">{hotels.filter(h => h.status === 'active').length}</p>
        </div>
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Mới trong tháng</p>
          <p className="text-4xl font-black text-blue-500">
            {hotels.filter(h => new Date(h.created_at).getMonth() === new Date().getMonth()).length}
          </p>
        </div>
      </div>

      {/* Search & Table */}
      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder="Tìm kiếm khách sạn, số điện thoại, slug..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-12 pl-12 pr-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-accent rounded-xl font-bold text-slate-800 outline-none transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Khách sạn / Slug</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Liên hệ</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Trạng thái</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Ngày tạo</th>
                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <Loader2 className="w-10 h-10 text-accent animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Đang tải dữ liệu...</p>
                  </td>
                </tr>
              ) : filteredHotels.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <Building2 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Không tìm thấy khách hàng nào</p>
                  </td>
                </tr>
              ) : (
                filteredHotels.map((hotel) => (
                  <tr key={hotel.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 font-black">
                          {hotel.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-slate-800">{hotel.name}</p>
                          <p className="text-[10px] font-bold text-accent uppercase tracking-tight">/{hotel.slug}/login</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600 font-bold text-sm">
                        <Phone size={14} className="text-slate-400" />
                        {hotel.phone || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        hotel.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                      }`}>
                        {hotel.status === 'active' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                        {hotel.status === 'active' ? 'Hoạt động' : 'Tạm khóa'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-500">
                      {new Date(hotel.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a 
                          href={`/${hotel.slug}/login`} 
                          target="_blank"
                          className="p-2 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg transition-all"
                          title="Mở trang Login"
                        >
                          <ExternalLink size={18} />
                        </a>
                        <button 
                          onClick={() => handleOpenFeatures(hotel)}
                          className="p-2 hover:bg-emerald-50 text-emerald-400 hover:text-emerald-600 rounded-lg transition-all"
                          title="Gạt công tắc tính năng"
                        >
                          <ShieldCheck size={18} />
                        </button>
                        <button 
                          onClick={() => handleOpenEdit(hotel)}
                          className="p-2 hover:bg-amber-50 text-amber-400 hover:text-amber-600 rounded-lg transition-all"
                          title="Sửa thông tin"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDeleteHotel(hotel.id, hotel.name)}
                          className="p-2 hover:bg-rose-50 text-rose-400 hover:text-rose-600 rounded-lg transition-all"
                          title="Xóa khách hàng"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 md:p-12">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h2 className="text-3xl font-black-italic tracking-tighter italic text-accent uppercase">
                    {editingHotel ? 'Cập nhật' : 'Onboarding'}
                  </h2>
                  <p className="text-slate-500 font-bold text-sm uppercase tracking-widest mt-1">
                    {editingHotel ? 'Sửa thông tin khách hàng' : 'Khởi tạo khách hàng mới'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="w-12 h-12 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl flex items-center justify-center transition-all"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Tên Khách Sạn</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Building2 size={20} />
                      </div>
                      <input 
                        type="text" 
                        required
                        value={formData.hotelName}
                        onChange={e => setFormData({...formData, hotelName: e.target.value})}
                        className="w-full h-14 pl-12 pr-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-accent rounded-2xl font-bold text-slate-800 outline-none transition-all"
                        placeholder="VD: 1Hotel Sài Gòn"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Đường dẫn (Slug)</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <LayoutDashboard size={20} />
                      </div>
                      <input 
                        type="text" 
                        required={!editingHotel}
                        value={formData.hotelSlug}
                        onChange={e => setFormData({...formData, hotelSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')})}
                        className="w-full h-14 pl-12 pr-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-accent rounded-2xl font-bold text-slate-800 outline-none transition-all"
                        placeholder="VD: ks-muong-thanh"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Số điện thoại liên hệ</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Phone size={20} />
                      </div>
                      <input 
                        type="tel" 
                        required
                        value={formData.adminPhone}
                        onChange={e => setFormData({...formData, adminPhone: e.target.value})}
                        className="w-full h-14 pl-12 pr-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-accent rounded-2xl font-bold text-slate-800 outline-none transition-all"
                        placeholder="VD: 0901234567"
                      />
                    </div>
                  </div>

                  {!editingHotel && (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Họ tên Chủ / Admin</label>
                        <div className="relative">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                            <Users size={20} />
                          </div>
                          <input 
                            type="text" 
                            required
                            value={formData.adminName}
                            onChange={e => setFormData({...formData, adminName: e.target.value})}
                            className="w-full h-14 pl-12 pr-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-accent rounded-2xl font-bold text-slate-800 outline-none transition-all"
                            placeholder="VD: Nguyễn Văn A"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Mã PIN mặc định</label>
                        <div className="relative">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                            <ShieldCheck size={20} />
                          </div>
                          <input 
                            type="text" 
                            required
                            maxLength={4}
                            value={formData.adminPin}
                            onChange={e => setFormData({...formData, adminPin: e.target.value})}
                            className="w-full h-14 pl-12 pr-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-accent rounded-2xl font-bold text-slate-800 outline-none transition-all"
                            placeholder="VD: 1234"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {!editingHotel && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                    <AlertCircle className="text-amber-500 shrink-0" size={20} />
                    <p className="text-xs text-amber-700 font-bold leading-relaxed">
                      Hệ thống sẽ tự động tạo sẵn Ví tiền, danh mục Thu/Chi và cấu hình mặc định cho khách sạn này ngay sau khi khởi tạo.
                    </p>
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-16 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-accent/20 flex items-center justify-center gap-3 transition-all active:scale-[0.98] mt-4"
                >
                  {isSubmitting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <>
                      {editingHotel ? 'Lưu thay đổi' : 'Bắt đầu khởi tạo'} <ArrowRight size={20} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Công tắc tính năng */}
      {isFeatureModalOpen && selectedHotelForFeatures && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black-italic tracking-tighter italic text-emerald-600 uppercase">
                    Tính năng Pro
                  </h2>
                  <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">
                    Gạt công tắc cho: {selectedHotelForFeatures.name}
                  </p>
                </div>
                <button 
                  onClick={() => setIsFeatureModalOpen(false)}
                  className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl flex items-center justify-center transition-all"
                >
                  <Plus size={20} className="rotate-45" />
                </button>
              </div>

              <div className="space-y-4">
                {Object.keys(FEATURE_LABELS).map((featureKey) => (
                  <div 
                    key={featureKey}
                    className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-all"
                  >
                    <div>
                      <p className="font-black text-slate-800 text-sm uppercase tracking-tight">
                        {FEATURE_LABELS[featureKey]}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {selectedHotelForFeatures.features?.[featureKey] ? 'Đang mở' : 'Đang khóa'}
                      </p>
                    </div>
                    
                    <button
                      onClick={() => handleToggleFeature(featureKey)}
                      className={`w-12 h-7 rounded-full p-1 transition-all duration-300 ${
                        selectedHotelForFeatures.features?.[featureKey] ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${
                        selectedHotelForFeatures.features?.[featureKey] ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => setIsFeatureModalOpen(false)}
                className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest mt-8 active:scale-[0.98] transition-all"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
