'use client';

import { useState, useEffect, useMemo } from 'react';
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
  ChevronLeft,
  AlertTriangle,
  MoreHorizontal,
  Search,
  MapPin
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

interface SecurityMatrixItem {
  key: string;
  category: string;
  description: string;
  global_policy: string;
  role_policies: Record<string, string>; // e.g. { "Manager": "ALLOW" }
  user_policies: Record<string, string>; // e.g. { "uuid": "DENY" }
}

const ROLES = ['Staff', 'Manager'];
const POLICY_OPTIONS = [
  { id: 'ALLOW', label: 'Tự quyết', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { id: 'PIN', label: 'Cần PIN', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'APPROVAL', label: 'Xin lệnh', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'DENY', label: 'Cấm', color: 'bg-rose-100 text-rose-700 border-rose-200' }
];

const OVERRIDE_OPTIONS = [
  { id: null, label: 'Kế thừa', color: 'bg-gray-100 text-gray-500 border-gray-200' },
  ...POLICY_OPTIONS
];

export default function StaffSettingsPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [securityMatrix, setSecurityMatrix] = useState<SecurityMatrixItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'staff' | 'security'>('staff');
  const [showInactive, setShowInactive] = useState(false);

  // Modals State
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isSelfChangePinModalOpen, setIsSelfChangePinModalOpen] = useState(false);
  const [isFloorModalOpen, setIsFloorModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  
  // Floor Management
  const [availableFloors, setAvailableFloors] = useState<number[]>([]);
  const [userFloorsMap, setUserFloorsMap] = useState<Record<string, number[]>>({});
  const [floorFormData, setFloorFormData] = useState<{ staffId: string, floors: number[] }>({
    staffId: '',
    floors: []
  });

  // User Override Modal
  const [editingActionKey, setEditingActionKey] = useState<string | null>(null);

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

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Load Data
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Current User
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      // Fetch Staff
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*')
        .order('full_name');
      if (staffError) throw staffError;
      setStaffList(staffData);

      // Fetch Security Matrix
      const { data: matrixData, error: matrixError } = await supabase.rpc('fn_get_security_matrix');
      if (matrixError) throw matrixError;
      setSecurityMatrix(matrixData || []);

      // Fetch Floors
      const { data: floorsData } = await supabase.rpc('fn_get_available_floors');
      setAvailableFloors(floorsData?.map((f: any) => f.floor) || []);

      // Fetch User Floors
      const { data: userFloorsData } = await supabase.rpc('fn_get_all_user_floors_map');
      const map: Record<string, number[]> = {};
      userFloorsData?.forEach((item: any) => {
          map[item.user_id] = item.floors;
      });
      setUserFloorsMap(map);

    } catch (error: any) {
      toast.error('Lỗi tải dữ liệu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGlobalPolicy = async (key: string, policy: string) => {
    try {
      const { error } = await supabase
        .from('settings_security')
        .update({ policy_type: policy })
        .eq('key', key);
        
      if (error) throw error;
      
      // Update local state directly for speed
      setSecurityMatrix(prev => prev.map(item => 
        item.key === key ? { ...item, global_policy: policy } : item
      ));
      toast.success('Đã cập nhật cấu hình mặc định');
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
      fetchData(); // Revert on error
    }
  };

  const handleUpdateRolePolicy = async (role: string, key: string, policy: string | null) => {
    try {
      const { error } = await supabase.rpc('fn_set_policy_override', {
        p_scope: 'ROLE',
        p_target_id: role,
        p_action_key: key,
        p_policy_type: policy || 'RESET'
      });
      if (error) throw error;
      
      // Update local state
      setSecurityMatrix(prev => prev.map(item => {
        if (item.key !== key) return item;
        const newRoles = { ...item.role_policies };
        if (policy) newRoles[role] = policy;
        else delete newRoles[role];
        return { ...item, role_policies: newRoles };
      }));
      
      toast.success(`Đã cập nhật quyền cho ${role}`);
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    }
  };

  const handleUpdateUserPolicy = async (staffId: string, key: string, policy: string | null) => {
    try {
      const { error } = await supabase.rpc('fn_set_policy_override', {
        p_scope: 'USER',
        p_target_id: staffId,
        p_action_key: key,
        p_policy_type: policy || 'RESET'
      });
      if (error) throw error;
      
      // Update local state
      setSecurityMatrix(prev => prev.map(item => {
        if (item.key !== key) return item;
        const newUsers = { ...item.user_policies };
        if (policy) newUsers[staffId] = policy;
        else delete newUsers[staffId];
        return { ...item, user_policies: newUsers };
      }));
      
      toast.success('Đã cập nhật ngoại lệ cho nhân viên');
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    }
  };

  // Staff Management Functions
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
        p_pin_hash: pinFormData.pin 
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
      // 1. Verify Old PIN (Only if changing own PIN)
      if (selfChangePinFormData.staffId === currentUserId) {
        const { data: isValid, error: verifyError } = await supabase.rpc('fn_verify_staff_pin', {
          p_staff_id: selfChangePinFormData.staffId,
          p_pin_hash: selfChangePinFormData.oldPin
        });

        if (verifyError) throw verifyError;
        if (!isValid) {
          toast.error('Mã PIN cũ không chính xác');
          return;
        }
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
    { id: 'checkin', name: 'Nhận phòng', color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'folio', name: 'Dịch vụ', color: 'text-purple-500', bg: 'bg-purple-50' },
    { id: 'checkout', name: 'Thanh toán', color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 'finance', name: 'Tài chính', color: 'text-rose-500', bg: 'bg-rose-50' },
    { id: 'inventory', name: 'Kho hàng', color: 'text-orange-500', bg: 'bg-orange-50' },
  ];

  const handleOpenFloorModal = (staff: Staff) => {
    setEditingStaff(staff);
    setFloorFormData({
      staffId: staff.id,
      floors: userFloorsMap[staff.id] || []
    });
    setIsFloorModalOpen(true);
  };

  const toggleFloor = (floor: number) => {
    setFloorFormData(prev => ({
      ...prev,
      floors: prev.floors.includes(floor)
        ? prev.floors.filter(f => f !== floor)
        : [...prev.floors, floor]
    }));
  };

  const handleSaveFloors = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.rpc('fn_set_user_floors', {
        p_user_id: floorFormData.staffId,
        p_floors: floorFormData.floors
      });

      if (error) throw error;

      toast.success('Cài đặt phân tầng thành công');
      setIsFloorModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    }
  };

  const ROLE_NAMES: Record<string, string> = {
    'Staff': 'Nhân viên',
    'Manager': 'Quản lý',
    'Admin': 'Quản trị viên'
  };

  const groupedMatrix = useMemo(() => {
    const groups: Record<string, SecurityMatrixItem[]> = {};
    securityMatrix.forEach(item => {
      // Infer category from key prefix if not explicit
      const cat = item.category || item.key.split('_')[0]; 
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [securityMatrix]);

  const PolicySelect = ({ 
    value, 
    onChange, 
    options = POLICY_OPTIONS,
    className = "" 
  }: { 
    value: string | null, 
    onChange: (val: string | null) => void,
    options?: typeof POLICY_OPTIONS | typeof OVERRIDE_OPTIONS,
    className?: string
  }) => {
    const selected = options.find(o => o.id === value) || options[0];
    
    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        className={`h-8 text-[10px] font-black uppercase tracking-wider rounded-lg border-2 outline-none cursor-pointer transition-all ${selected.color} ${className}`}
      >
        {options.map(opt => (
          <option key={opt.id || 'inherit'} value={opt.id || ''}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-32">
      <div className="mb-8 md:mb-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <Link href="/settings" className="flex items-center gap-2 text-muted hover:text-accent transition-colors mb-4 group">
            <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-xs font-black uppercase tracking-widest">Quay lại</span>
          </Link>
          <h1 className="text-3xl md:text-4xl font-black-italic tracking-tighter uppercase italic text-accent flex items-center gap-4">
            <ShieldCheck size={32} className="md:w-10 md:h-10" />
            Nhân viên & Bảo mật
          </h1>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full md:w-auto">
          <button
            onClick={() => setIsSelfChangePinModalOpen(true)}
            className="hidden md:flex px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-accent/10 text-accent hover:bg-accent hover:text-white transition-all shadow-sm"
          >
            Đổi PIN Cá Nhân
          </button>

          <div className="flex bg-gray-100 p-1 rounded-2xl w-full md:w-auto">
            <button 
              onClick={() => setActiveTab('staff')}
              className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'staff' ? 'bg-white text-accent shadow-sm' : 'text-muted hover:text-main'}`}
            >
              Tài khoản
            </button>
            <button 
              onClick={() => setActiveTab('security')}
              className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'security' ? 'bg-white text-accent shadow-sm' : 'text-muted hover:text-main'}`}
            >
              Phân quyền 3 tầng
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        </div>
      ) : activeTab === 'staff' ? (
        <div className="space-y-8">
          {/* Staff Filter/Toggle */}
          <div className="flex justify-end">
            <button 
              onClick={() => setShowInactive(!showInactive)}
              className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border-2 transition-all ${showInactive ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-gray-50 border-transparent text-muted hover:border-gray-200'}`}
            >
              {showInactive ? 'Đang hiện nhân viên đã khóa' : 'Xem nhân viên đã nghỉ việc'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Add Staff Card */}
            <div 
              onClick={() => handleOpenStaffModal()}
              className="bento-card p-8 bg-accent/5 border-dashed border-accent/20 flex flex-col items-center justify-center text-center group cursor-pointer hover:bg-accent/10 transition-all min-h-[200px]"
            >
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-accent mb-4 shadow-sm group-hover:scale-110 transition-transform">
                <Plus size={32} />
              </div>
              <h3 className="font-black uppercase tracking-tight text-accent">Thêm nhân viên</h3>
              <p className="text-[10px] text-muted font-bold mt-2 uppercase">Cấp tài khoản mới</p>
            </div>

            {/* Staff List */}
            {staffList
              .filter(s => showInactive || s.is_active)
              .map((staff) => (
                <div key={staff.id} className={`bento-card p-8 relative group transition-all ${staff.is_active ? 'bg-white' : 'bg-gray-50/50 grayscale opacity-70 hover:grayscale-0 hover:opacity-100'}`}>
                  <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-main">
                  <Users size={24} />
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${staff.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {staff.is_active ? 'Đang hoạt động' : 'Đã khóa'}
                </div>
              </div>

              <h3 className="text-xl font-black tracking-tight text-main mb-1">{staff.full_name}</h3>
              <p className="text-xs font-bold text-muted uppercase tracking-wider mb-4">@{staff.username} • {ROLE_NAMES[staff.role] || staff.role}</p>

              <div className="flex gap-2 pt-4 border-t border-gray-50">
                <button 
                  onClick={() => handleOpenPinModal(staff)}
                  className="flex-1 py-2 bg-gray-50 hover:bg-accent hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <Key size={14} /> PIN
                </button>
                <button 
                  onClick={() => handleOpenFloorModal(staff)}
                  className="w-10 h-10 bg-gray-50 hover:bg-blue-50 hover:text-blue-500 rounded-xl flex items-center justify-center transition-all"
                  title="Phân tầng"
                >
                  <MapPin size={16} />
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
      </div>
    ) : (
      <div className="space-y-12">
          {securityCategories.map((cat) => {
            // Find items for this category (handling both 'checkin' and 'checkin_...' keys)
            const items = groupedMatrix[cat.id] || [];
            if (items.length === 0) return null;

            return (
              <section key={cat.id} className="bento-card bg-white overflow-hidden">
                <div className={`p-6 border-b border-gray-100 flex items-center gap-3 ${cat.bg}`}>
                  <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center ${cat.color} shadow-sm`}>
                    <Lock size={20} />
                  </div>
                  <h2 className="text-xl font-black tracking-tight uppercase italic text-main">{cat.name}</h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="text-left py-4 px-6 text-[10px] font-black uppercase tracking-widest text-muted w-[30%]">Hành động</th>
                        <th className="text-center py-4 px-4 text-[10px] font-black uppercase tracking-widest text-muted w-[15%]">Mặc định</th>
                        {ROLES.map(role => (
                          <th key={role} className="text-center py-4 px-4 text-[10px] font-black uppercase tracking-widest text-muted w-[15%]">{ROLE_NAMES[role] || role}</th>
                        ))}
                        <th className="text-center py-4 px-4 text-[10px] font-black uppercase tracking-widest text-muted w-[10%]">Ngoại lệ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item) => (
                        <tr key={item.key} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-4 px-6">
                            <div className="font-bold text-sm text-main">{item.description}</div>
                          </td>
                          
                          {/* Global Setting */}
                          <td className="py-4 px-4 text-center">
                            <PolicySelect 
                              value={item.global_policy}
                              onChange={(val) => handleUpdateGlobalPolicy(item.key, val!)}
                              options={POLICY_OPTIONS}
                              className="w-full"
                            />
                          </td>

                          {/* Role Overrides */}
                          {ROLES.map(role => (
                            <td key={role} className="py-4 px-4 text-center">
                              <PolicySelect 
                                value={item.role_policies?.[role] || null}
                                onChange={(val) => handleUpdateRolePolicy(role, item.key, val)}
                                options={OVERRIDE_OPTIONS}
                                className="w-full"
                              />
                            </td>
                          ))}

                          {/* User Exceptions Trigger */}
                          <td className="py-4 px-4 text-center">
                            <button
                              onClick={() => setEditingActionKey(item.key)}
                              className={`h-8 w-full rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                                item.user_policies && Object.keys(item.user_policies).length > 0 
                                  ? 'bg-accent text-white shadow-md hover:bg-accent/90' 
                                  : 'bg-gray-100 text-muted hover:bg-gray-200'
                              }`}
                            >
                              <Users size={14} />
                              <span>{item.user_policies ? Object.keys(item.user_policies).length : 0}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Warning Footer */}
      <div className="mt-16 p-8 bg-rose-50 rounded-3xl border border-rose-100 flex items-start gap-6">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-rose-500 shadow-sm shrink-0">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h4 className="font-black uppercase tracking-tight text-rose-600 mb-2">Tam Tầng Phòng Thủ</h4>
          <p className="text-xs font-medium text-rose-800/70 leading-relaxed">
            Hệ thống ưu tiên quyền theo thứ tự: <b>Cá nhân (User) &gt; Chức vụ (Role) &gt; Mặc định (Global)</b>.<br/>
            Nếu một nhân viên được cấu hình riêng (Ngoại lệ), hệ thống sẽ bỏ qua quyền của Role và Global.<br/>
            Nếu không có cấu hình riêng, hệ thống sẽ kiểm tra quyền Role. Nếu Role để "Kế thừa", sẽ dùng quyền Global.
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
                      <option value="Admin">Quản trị viên</option>
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

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsStaffModalOpen(false)}
                    className="flex-1 h-12 rounded-xl bg-gray-100 text-muted font-bold hover:bg-gray-200 transition-all uppercase tracking-wider text-xs"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-12 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all uppercase tracking-wider text-xs shadow-lg shadow-accent/25"
                  >
                    Lưu
                  </button>
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
              <h3 className="text-xl font-black tracking-tight text-main mb-6 uppercase italic">
                Đặt PIN cho {editingStaff?.full_name}
              </h3>
              <form onSubmit={handleSavePin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Mã PIN mới (4 số)</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={pinFormData.pin}
                    onChange={(e) => setPinFormData({ ...pinFormData, pin: e.target.value.replace(/[^0-9]/g, '') })}
                    className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 font-bold outline-none text-center text-2xl tracking-[0.5em] transition-all"
                    placeholder="••••"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Xác nhận mã PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={pinFormData.confirmPin}
                    onChange={(e) => setPinFormData({ ...pinFormData, confirmPin: e.target.value.replace(/[^0-9]/g, '') })}
                    className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 font-bold outline-none text-center text-2xl tracking-[0.5em] transition-all"
                    placeholder="••••"
                  />
                </div>
                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsPinModalOpen(false)}
                    className="flex-1 h-12 rounded-xl bg-gray-100 text-muted font-bold hover:bg-gray-200 transition-all uppercase tracking-wider text-xs"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-12 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all uppercase tracking-wider text-xs shadow-lg shadow-accent/25"
                  >
                    Lưu PIN
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Self Change PIN */}
      {isSelfChangePinModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <h3 className="text-xl font-black tracking-tight text-main mb-6 uppercase italic">
                Đổi PIN Cá Nhân
              </h3>
              <form onSubmit={handleSelfChangePin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Chọn nhân viên</label>
                  <select
                    value={selfChangePinFormData.staffId}
                    onChange={(e) => setSelfChangePinFormData({ ...selfChangePinFormData, staffId: e.target.value })}
                    className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 font-bold outline-none transition-all"
                  >
                    <option value="">-- Chọn tài khoản --</option>
                    {staffList.filter(s => s.is_active).map(s => (
                      <option key={s.id} value={s.id}>{s.full_name} (@{s.username})</option>
                    ))}
                  </select>
                </div>
                
                {selfChangePinFormData.staffId === currentUserId && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">PIN cũ</label>
                    <input
                      type="password"
                      maxLength={4}
                      value={selfChangePinFormData.oldPin}
                      onChange={(e) => setSelfChangePinFormData({ ...selfChangePinFormData, oldPin: e.target.value.replace(/[^0-9]/g, '') })}
                      className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 font-bold outline-none text-center text-xl tracking-[0.5em] transition-all"
                      placeholder="••••"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">PIN mới</label>
                    <input
                      type="password"
                      maxLength={4}
                      value={selfChangePinFormData.newPin}
                      onChange={(e) => setSelfChangePinFormData({ ...selfChangePinFormData, newPin: e.target.value.replace(/[^0-9]/g, '') })}
                      className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 font-bold outline-none text-center text-xl tracking-[0.5em] transition-all"
                      placeholder="••••"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-4">Xác nhận</label>
                    <input
                      type="password"
                      maxLength={4}
                      value={selfChangePinFormData.confirmPin}
                      onChange={(e) => setSelfChangePinFormData({ ...selfChangePinFormData, confirmPin: e.target.value.replace(/[^0-9]/g, '') })}
                      className="w-full h-14 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl px-6 font-bold outline-none text-center text-xl tracking-[0.5em] transition-all"
                      placeholder="••••"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsSelfChangePinModalOpen(false)}
                    className="flex-1 h-12 rounded-xl bg-gray-100 text-muted font-bold hover:bg-gray-200 transition-all uppercase tracking-wider text-xs"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-12 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all uppercase tracking-wider text-xs shadow-lg shadow-accent/25"
                  >
                    Đổi PIN
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Set Floors */}
      {isFloorModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <h3 className="text-xl font-black tracking-tight text-main mb-2 uppercase italic">
                Phân tầng quản lý
              </h3>
              <p className="text-xs text-muted font-medium mb-6">
                Chọn các tầng mà <span className="text-accent font-bold">{editingStaff?.full_name}</span> được phép quản lý.
              </p>
              
              <form onSubmit={handleSaveFloors} className="space-y-6">
                <div className="flex flex-wrap gap-3">
                  {availableFloors.length > 0 ? availableFloors.map(floor => {
                    const isSelected = floorFormData.floors.includes(floor);
                    return (
                      <div 
                        key={floor}
                        onClick={() => toggleFloor(floor)}
                        className={`
                          w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black cursor-pointer transition-all select-none
                          ${isSelected 
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-110' 
                            : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}
                        `}
                      >
                        {floor}
                      </div>
                    );
                  }) : (
                    <div className="text-sm text-muted italic w-full text-center py-4 bg-gray-50 rounded-xl">
                      Chưa có dữ liệu tầng (cần tạo phòng trước)
                    </div>
                  )}
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsFloorModalOpen(false)}
                    className="flex-1 h-12 rounded-xl bg-gray-100 text-muted font-bold hover:bg-gray-200 transition-all uppercase tracking-wider text-xs"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-12 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 transition-all uppercase tracking-wider text-xs shadow-lg shadow-blue-500/25"
                  >
                    Lưu cấu hình
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: User Exceptions */}
      {editingActionKey && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-xl font-black tracking-tight text-main uppercase italic">
                  Ngoại lệ cấp cá nhân
                </h3>
                <p className="text-xs text-muted font-medium mt-1">
                  Cấu hình riêng cho: <span className="text-accent font-bold">{securityMatrix.find(i => i.key === editingActionKey)?.description}</span>
                </p>
              </div>
              <button 
                onClick={() => setEditingActionKey(null)}
                className="w-10 h-10 rounded-xl bg-white text-muted hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-all shadow-sm"
              >
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto flex-1">
              <table className="w-full">
                <thead className="bg-white sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="text-left py-4 px-8 text-[10px] font-black uppercase tracking-widest text-muted">Nhân viên</th>
                    <th className="text-left py-4 px-4 text-[10px] font-black uppercase tracking-widest text-muted">Vai trò</th>
                    <th className="text-left py-4 px-8 text-[10px] font-black uppercase tracking-widest text-muted w-[200px]">Quyền riêng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {staffList.map(staff => {
                    const currentItem = securityMatrix.find(i => i.key === editingActionKey);
                    const userPolicy = currentItem?.user_policies?.[staff.id] || null;
                    const rolePolicy = currentItem?.role_policies?.[staff.role] || null;
                    const globalPolicy = currentItem?.global_policy || 'PIN';
                    
                    // Determine effective policy for display
                    const effective = userPolicy || rolePolicy || globalPolicy;
                    
                    return (
                      <tr key={staff.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-8">
                          <div className="font-bold text-sm text-main">{staff.full_name}</div>
                          <div className="text-[10px] font-medium text-muted">@{staff.username}</div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="px-2 py-1 rounded-md bg-gray-100 text-[10px] font-bold text-muted uppercase tracking-wider">
                            {ROLE_NAMES[staff.role] || staff.role}
                          </span>
                        </td>
                        <td className="py-4 px-8">
                          <PolicySelect 
                            value={userPolicy}
                            onChange={(val) => handleUpdateUserPolicy(staff.id, editingActionKey, val)}
                            options={OVERRIDE_OPTIONS}
                            className="w-full"
                          />
                          {/* Show effective resolved policy hint if inherited */}
                          {!userPolicy && (
                            <div className="text-[9px] text-muted mt-1 pl-1">
                              Đang dùng: <span className="font-bold">{POLICY_OPTIONS.find(o => o.id === effective)?.label}</span>
                              <span className="opacity-50"> ({rolePolicy ? 'Chức vụ' : 'Mặc định'})</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setEditingActionKey(null)}
                className="px-8 py-3 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all uppercase tracking-wider text-xs shadow-lg shadow-accent/25"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
