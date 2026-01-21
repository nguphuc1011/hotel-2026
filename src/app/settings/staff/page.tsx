'use client';

import { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Key, 
  CheckCircle2, 
  XCircle,
  Settings2,
  Lock,
  ChevronLeft
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface Staff {
  id: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  pin_hash?: string;
}

interface SecuritySetting {
  key: string;
  description: string;
  is_enabled: boolean;
  category: string;
}

export default function StaffSettingsPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [securitySettings, setSecuritySettings] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'staff' | 'security'>('staff');

  // Modals State
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isSelfChangePinModalOpen, setIsSelfChangePinModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [staffFormData, setStaffFormData] = useState({
    username: '',
    full_name: '',
    role: 'Staff',
    is_active: true
  });
  const [pinFormData, setPinFormData] = useState({
    pin: '',
    confirmPin: ''
  });
  const [selfChangePinFormData, setSelfChangePinFormData] = useState({
    staffId: '',
    oldPin: '',
    newPin: '',
    confirmPin: ''
  });

  // Load Data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Staff
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*')
        .order('full_name');
      if (staffError) throw staffError;
      setStaffList(staffData);

      // Fetch Security Settings
      const { data: secData, error: secError } = await supabase.rpc('fn_get_security_settings');
      if (secError) throw secError;
      setSecuritySettings(secData || {});

    } catch (error: any) {
      toast.error('Lỗi tải dữ liệu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSecurity = async (key: string, currentValue: boolean) => {
    try {
      const { error } = await supabase.rpc('fn_update_security_setting', {
        p_key: key,
        p_is_enabled: !currentValue
      });
      if (error) throw error;
      
      setSecuritySettings(prev => ({ ...prev, [key]: !currentValue }));
      toast.success('Đã cập nhật cấu hình');
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    }
  };

  const handleOpenStaffModal = (staff?: Staff) => {
    if (staff) {
      setEditingStaff(staff);
      setStaffFormData({
        username: staff.username,
        full_name: staff.full_name,
        role: staff.role,
        is_active: staff.is_active
      });
    } else {
      setEditingStaff(null);
      setStaffFormData({
        username: '',
        full_name: '',
        role: 'Staff',
        is_active: true
      });
    }
    setIsStaffModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffFormData.username || !staffFormData.full_name) {
      toast.error('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('fn_manage_staff', {
        p_action: editingStaff ? 'UPDATE' : 'CREATE',
        p_id: editingStaff?.id,
        p_username: staffFormData.username,
        p_full_name: staffFormData.full_name,
        p_role: staffFormData.role,
        p_is_active: staffFormData.is_active
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);

      toast.success(editingStaff ? 'Cập nhật thành công' : 'Thêm nhân viên thành công');
      setIsStaffModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    }
  };

  const handleOpenPinModal = (staff: Staff) => {
    setEditingStaff(staff);
    setPinFormData({ pin: '', confirmPin: '' });
    setIsPinModalOpen(true);
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinFormData.pin.length !== 4) {
      toast.error('Mã PIN phải có đúng 4 số');
      return;
    }
    if (pinFormData.pin !== pinFormData.confirmPin) {
      toast.error('Xác nhận mã PIN không khớp');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('fn_manage_staff', {
        p_action: 'SET_PIN',
        p_id: editingStaff?.id,
        p_pin_hash: pinFormData.pin // Trong thực tế nên hash, ở đây làm theo logic đơn giản đã thống nhất
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);

      toast.success('Cài đặt mã PIN thành công');
      setIsPinModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    }
  };

  const handleSelfChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selfChangePinFormData.staffId) {
      toast.error('Vui lòng chọn nhân viên');
      return;
    }
    if (selfChangePinFormData.newPin.length !== 4) {
      toast.error('Mã PIN mới phải có đúng 4 số');
      return;
    }
    if (selfChangePinFormData.newPin !== selfChangePinFormData.confirmPin) {
      toast.error('Mã PIN xác nhận không khớp');
      return;
    }

    try {
      // 1. Verify Old PIN
      const { data: isValid, error: verifyError } = await supabase.rpc('fn_verify_staff_pin', {
        p_staff_id: selfChangePinFormData.staffId,
        p_pin_hash: selfChangePinFormData.oldPin
      });

      if (verifyError) throw verifyError;
      if (!isValid) {
        toast.error('Mã PIN cũ không chính xác');
        return;
      }

      // 2. Set New PIN
      const { data, error } = await supabase.rpc('fn_manage_staff', {
        p_action: 'SET_PIN',
        p_id: selfChangePinFormData.staffId,
        p_pin_hash: selfChangePinFormData.newPin
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);

      toast.success('Đổi mã PIN thành công');
      setIsSelfChangePinModalOpen(false);
      setSelfChangePinFormData({ staffId: '', oldPin: '', newPin: '', confirmPin: '' });
      fetchData();
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    }
  };

  const securityCategories = [
    { id: 'checkin', name: 'Nhận phòng', color: 'text-blue-500' },
    { id: 'folio', name: 'Dịch vụ', color: 'text-purple-500' },
    { id: 'checkout', name: 'Thanh toán', color: 'text-emerald-500' },
    { id: 'finance', name: 'Tài chính', color: 'text-rose-500' },
    { id: 'inventory', name: 'Kho hàng', color: 'text-orange-500' },
  ];

  // Helper mapping for descriptions (Fallback if DB is empty or just for UI)
  const securityDescriptions: Record<string, string> = {
    'checkin_custom_price': 'Nhập giá phòng tùy chỉnh',
    'checkin_override_surcharge': 'Tắt/Sửa phụ thu tự động',
    'checkin_debt_allow': 'Cho phép nhận phòng khi đang nợ',
    'folio_add_service': 'Thêm dịch vụ/đồ uống',
    'folio_remove_service': 'Xóa món dịch vụ (CỰC NHẠY CẢM)',
    'folio_edit_service': 'Sửa số lượng/đơn giá dịch vụ',
    'folio_change_room': 'Đổi phòng',
    'checkout_discount': 'Áp dụng giảm giá (Discount)',
    'checkout_payment': 'Xác nhận thanh toán thường (Tiền mặt/CK)',
    'checkout_custom_surcharge': 'Thêm phụ thu thủ công',
    'checkout_mark_as_debt': 'Xác nhận khách nợ (Ghi sổ)',
    'checkout_refund': 'Hoàn tiền mặt cho khách',
    'checkout_void_bill': 'Hủy hóa đơn đã thanh toán',
    'finance_manual_cash_out': 'Chi tiền mặt từ két',
    'inventory_adjust': 'Điều chỉnh kho (Hư hỏng/mất)',
    'inventory_import': 'Nhập kho hàng hóa',
    'finance_delete_transaction': 'Xóa lịch sử thu chi'
  };

  return (
    <div className="p-8 md:p-12 max-w-6xl mx-auto pb-32">
      <div className="mb-12 flex items-center justify-between">
        <div>
          <Link href="/settings" className="flex items-center gap-2 text-muted hover:text-accent transition-colors mb-4 group">
            <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-xs font-black uppercase tracking-widest">Quay lại</span>
          </Link>
          <h1 className="text-4xl font-black-italic tracking-tighter uppercase italic text-accent flex items-center gap-4">
            <ShieldCheck size={40} />
            Nhân viên & Bảo mật
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSelfChangePinModalOpen(true)}
            className="hidden md:flex px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-accent/10 text-accent hover:bg-accent hover:text-white transition-all shadow-sm"
          >
            Đổi PIN Cá Nhân
          </button>

          <div className="flex bg-gray-100 p-1 rounded-2xl">
            <button 
              onClick={() => setActiveTab('staff')}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'staff' ? 'bg-white text-accent shadow-sm' : 'text-muted hover:text-main'}`}
            >
              Tài khoản
            </button>
            <button 
              onClick={() => setActiveTab('security')}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'security' ? 'bg-white text-accent shadow-sm' : 'text-muted hover:text-main'}`}
            >
              Nút gạt bảo mật
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        </div>
      ) : activeTab === 'staff' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Add Staff Card */}
          <div 
            onClick={() => handleOpenStaffModal()}
            className="bento-card p-8 bg-accent/5 border-dashed border-accent/20 flex flex-col items-center justify-center text-center group cursor-pointer hover:bg-accent/10 transition-all"
          >
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-accent mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <Plus size={32} />
            </div>
            <h3 className="font-black uppercase tracking-tight text-accent">Thêm nhân viên</h3>
            <p className="text-[10px] text-muted font-bold mt-2 uppercase">Cấp tài khoản mới</p>
          </div>

          {/* Staff List */}
          {staffList.map((staff) => (
            <div key={staff.id} className="bento-card p-8 bg-white relative group">
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-main">
                  <Users size={24} />
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${staff.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {staff.is_active ? 'Đang hoạt động' : 'Đã khóa'}
                </div>
              </div>

              <h3 className="text-xl font-black tracking-tight text-main mb-1">{staff.full_name}</h3>
              <p className="text-xs font-bold text-muted uppercase tracking-wider mb-4">@{staff.username} • {staff.role}</p>

              <div className="flex gap-2 pt-4 border-t border-gray-50">
                <button 
                  onClick={() => handleOpenPinModal(staff)}
                  className="flex-1 py-2 bg-gray-50 hover:bg-accent hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <Key size={14} /> PIN
                </button>
                <button 
                  onClick={() => handleOpenStaffModal(staff)}
                  className="w-10 h-10 bg-gray-50 hover:bg-rose-50 hover:text-rose-500 rounded-xl flex items-center justify-center transition-all"
                >
                  <Settings2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-12">
          {securityCategories.map((cat) => (
            <section key={cat.id} className="bento-card p-8 bg-white">
              <div className="flex items-center gap-3 mb-8">
                <div className={`w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center ${cat.color}`}>
                  <Lock size={20} />
                </div>
                <h2 className="text-2xl font-black tracking-tight uppercase italic">{cat.name}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                {Object.entries(securityDescriptions)
                  .filter(([key]) => key.startsWith(cat.id))
                  .map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between p-4 rounded-2xl hover:bg-gray-50 transition-colors group">
                      <div className="flex flex-col">
                        <span className="text-sm font-black tracking-tight text-main">{desc}</span>
                        <span className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1 opacity-50 group-hover:opacity-100 transition-opacity">{key}</span>
                      </div>
                      
                      <button 
                        onClick={() => handleToggleSecurity(key, securitySettings[key] || false)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${securitySettings[key] ? 'bg-accent' : 'bg-gray-200'}`}
                      >
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${securitySettings[key] ? 'translate-x-6' : ''}`} />
                      </button>
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Warning Footer */}
      <div className="mt-16 p-8 bg-rose-50 rounded-3xl border border-rose-100 flex items-start gap-6">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-rose-500 shadow-sm shrink-0">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h4 className="font-black uppercase tracking-tight text-rose-600 mb-2">Lưu ý về Bằng chứng thép</h4>
          <p className="text-xs font-medium text-rose-800/70 leading-relaxed">
            Việc bật mã PIN cho các hành động nhạy cảm sẽ bắt buộc nhân viên phải nhập mã định danh cá nhân trước khi thực hiện. 
            Mọi hành động này sẽ được ghi nhật ký (Audit Log) chính xác theo tài khoản đã đăng nhập. Không nên tắt các nút gạt có nhãn [NHẠY CẢM] trừ khi thực sự cần thiết.
          </p>
        </div>
      </div>

      {/* Modal: Add/Edit Staff */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <h3 className="text-2xl font-black tracking-tight text-main mb-8 uppercase italic">
                {editingStaff ? 'Cập nhật nhân viên' : 'Thêm nhân viên mới'}
              </h3>
              <form onSubmit={handleSaveStaff} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Tên đăng nhập</label>
                  <input
                    type="text"
                    value={staffFormData.username}
                    onChange={(e) => setStaffFormData({ ...staffFormData, username: e.target.value })}
                    className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 font-bold outline-none transition-all"
                    placeholder="VD: nguyenvanan"
                    disabled={!!editingStaff}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Họ và tên</label>
                  <input
                    type="text"
                    value={staffFormData.full_name}
                    onChange={(e) => setStaffFormData({ ...staffFormData, full_name: e.target.value })}
                    className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 font-bold outline-none transition-all"
                    placeholder="VD: Nguyễn Văn An"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Vai trò</label>
                    <select
                      value={staffFormData.role}
                      onChange={(e) => setStaffFormData({ ...staffFormData, role: e.target.value })}
                      className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 font-bold outline-none transition-all"
                    >
                      <option value="Staff">Nhân viên</option>
                      <option value="Manager">Quản lý</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Trạng thái</label>
                    <div 
                      onClick={() => setStaffFormData({ ...staffFormData, is_active: !staffFormData.is_active })}
                      className={`h-14 rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition-all font-black uppercase tracking-widest text-[10px] ${staffFormData.is_active ? 'bg-emerald-50 text-emerald-600 border-2 border-emerald-100' : 'bg-rose-50 text-rose-600 border-2 border-rose-100'}`}
                    >
                      {staffFormData.is_active ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                      {staffFormData.is_active ? 'Hoạt động' : 'Đã khóa'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsStaffModalOpen(false)} className="flex-1 h-14 bg-gray-100 text-muted rounded-2xl font-black uppercase tracking-widest">Hủy</button>
                  <button type="submit" className="flex-1 h-14 bg-accent text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-accent/20">Lưu</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Set PIN */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <h3 className="text-2xl font-black tracking-tight text-main mb-2 uppercase italic">Cài đặt mã PIN</h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-8">Nhân viên: {editingStaff?.full_name}</p>
              
              <form onSubmit={handleSavePin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Mã PIN mới (4 số)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    autoComplete="off"
                    value={pinFormData.pin}
                    onChange={(e) => setPinFormData({ ...pinFormData, pin: e.target.value.replace(/\D/g, '') })}
                    className="w-full h-16 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 text-center text-2xl font-black tracking-[0.5em] outline-none transition-all mask-disc"
                    placeholder="••••"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Xác nhận mã PIN</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    autoComplete="off"
                    value={pinFormData.confirmPin}
                    onChange={(e) => setPinFormData({ ...pinFormData, confirmPin: e.target.value.replace(/\D/g, '') })}
                    className="w-full h-16 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 text-center text-2xl font-black tracking-[0.5em] outline-none transition-all mask-disc"
                    placeholder="••••"
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsPinModalOpen(false)} className="flex-1 h-14 bg-gray-100 text-muted rounded-2xl font-black uppercase tracking-widest">Hủy</button>
                  <button type="submit" className="flex-1 h-14 bg-accent text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-accent/20">Lưu</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Self Change PIN */}
      {isSelfChangePinModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <h3 className="text-2xl font-black tracking-tight text-main mb-2 uppercase italic">Đổi PIN Cá Nhân</h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-8">Dành cho nhân viên tự thay đổi</p>
              
              <form onSubmit={handleSelfChangePin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Nhân viên</label>
                  <select
                    value={selfChangePinFormData.staffId}
                    onChange={(e) => setSelfChangePinFormData({ ...selfChangePinFormData, staffId: e.target.value })}
                    className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 font-bold outline-none transition-all"
                  >
                    <option value="">-- Chọn nhân viên --</option>
                    {staffList.filter(s => s.is_active).map(s => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Mã PIN cũ</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    autoComplete="off"
                    value={selfChangePinFormData.oldPin}
                    onChange={(e) => setSelfChangePinFormData({ ...selfChangePinFormData, oldPin: e.target.value.replace(/\D/g, '') })}
                    className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 text-center text-xl font-black tracking-[0.5em] outline-none transition-all mask-disc"
                    placeholder="••••"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Mã PIN mới (4 số)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    autoComplete="off"
                    value={selfChangePinFormData.newPin}
                    onChange={(e) => setSelfChangePinFormData({ ...selfChangePinFormData, newPin: e.target.value.replace(/\D/g, '') })}
                    className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 text-center text-xl font-black tracking-[0.5em] outline-none transition-all mask-disc"
                    placeholder="••••"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Xác nhận PIN mới</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    autoComplete="off"
                    value={selfChangePinFormData.confirmPin}
                    onChange={(e) => setSelfChangePinFormData({ ...selfChangePinFormData, confirmPin: e.target.value.replace(/\D/g, '') })}
                    className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 text-center text-xl font-black tracking-[0.5em] outline-none transition-all mask-disc"
                    placeholder="••••"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsSelfChangePinModalOpen(false)} className="flex-1 h-14 bg-gray-100 text-muted rounded-2xl font-black uppercase tracking-widest">Hủy</button>
                  <button type="submit" className="flex-1 h-14 bg-accent text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-accent/20">Lưu</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
