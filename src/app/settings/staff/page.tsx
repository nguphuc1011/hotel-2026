'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Shield,
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
  MapPin,
  Check,
  X
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { PERMISSION_METADATA } from '@/constants/permissions';
import { permissionService, RolePermission, PERMISSION_KEYS } from '@/services/permissionService';
import { usePermission } from '@/hooks/usePermission';

interface Staff {
  id: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  pin_hash?: string;
  permissions?: string[];
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
  const { can, isLoading: isAuthLoading } = usePermission();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [securityMatrix, setSecurityMatrix] = useState<SecurityMatrixItem[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'staff' | 'security' | 'functional'>('staff');
  const [showInactive, setShowInactive] = useState(false);

  // Modals State
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
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
  const [overrideUserId, setOverrideUserId] = useState<string>('');
  const [overridePolicy, setOverridePolicy] = useState<string>('ALLOW');

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

  if (isAuthLoading) return null;

  if (!can(PERMISSION_KEYS.MANAGE_PERMISSIONS)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <ShieldCheck size={48} className="mx-auto text-slate-300 mb-4" />
          <h1 className="text-xl font-bold text-slate-700">Không có quyền truy cập</h1>
          <p className="text-slate-500">Vui lòng liên hệ quản lý.</p>
        </div>
      </div>
    );
  }

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

      // Fetch Functional Permissions (Roles)
      const rolesData = await permissionService.getAllRoles();
      setRolePermissions(rolesData);

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

  // Functional Permissions Handlers
  const handleToggleFunctionalPermission = async (roleCode: string, permissionCode: string) => {
    const role = rolePermissions.find(r => r.role_code === roleCode);
    if (!role) return;

    let newPermissions: string[];
    const hasPermission = role.permissions.includes(permissionCode);
    
    if (hasPermission) {
      newPermissions = role.permissions.filter(p => p !== permissionCode);
    } else {
      newPermissions = [...role.permissions, permissionCode];
    }

    try {
      await permissionService.updateRolePermissions(roleCode, newPermissions);
      
      // Update local state
      setRolePermissions(prev => prev.map(r => 
        r.role_code === roleCode ? { ...r, permissions: newPermissions } : r
      ));
      toast.success('Đã cập nhật quyền thành công');
    } catch (error: any) {
      toast.error('Lỗi cập nhật: ' + error.message);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!can(PERMISSION_KEYS.MANAGE_PERMISSIONS)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <ShieldCheck size={48} className="mx-auto text-slate-300 mb-4" />
          <h1 className="text-xl font-bold text-slate-700">Không có quyền truy cập</h1>
          <p className="text-slate-500">Bạn không có quyền quản lý nhân viên & phân quyền.</p>
          <Link href="/settings" className="text-blue-500 hover:underline mt-4 block">
            Quay lại Cài đặt
          </Link>
        </div>
      </div>
    );
  }

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
              onClick={() => setActiveTab('staff')}
              className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'staff' ? 'bg-white text-accent shadow-sm' : 'text-muted hover:text-main'}`}
            >
              Tài khoản
            </button>
            <button 
              onClick={() => setActiveTab('security')}
              className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'security' ? 'bg-white text-accent shadow-sm' : 'text-muted hover:text-main'}`}
            >
              Phân quyền theo hành động
            </button>
             <button 
              onClick={() => setActiveTab('functional')}
              className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'functional' ? 'bg-white text-accent shadow-sm' : 'text-muted hover:text-main'}`}
            >
              Phân quyền Chức năng
            </button>
          </div>
        </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        </div>
      ) : (
        <>
          {/* TAB 1: STAFF MANAGEMENT */}
          {activeTab === 'staff' && (
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
          )}

          {/* TAB 2: SECURITY MATRIX */}
          {activeTab === 'security' && (
            <div className="space-y-12">
              {securityCategories.map((cat) => {
                // Find items for this category (handling both 'checkin' and 'checkin_...' keys)
                const items = groupedMatrix[cat.id] || [];
                if (items.length === 0) return null;

                return (
                  <div key={cat.id}>
                    <div className="flex items-center gap-3 mb-6">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cat.bg} ${cat.color}`}>
                        <ShieldCheck size={18} />
                      </div>
                      <h2 className="text-xl font-black uppercase tracking-tight text-main">{cat.name}</h2>
                    </div>
                    
                    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left py-4 px-6 text-[10px] font-black uppercase tracking-widest text-muted w-1/3">Hành động bảo mật</th>
                            <th className="text-center py-4 px-4 text-[10px] font-black uppercase tracking-widest text-muted w-32">Mặc định</th>
                            {ROLES.map(role => (
                              <th key={role} className="text-center py-4 px-4 text-[10px] font-black uppercase tracking-widest text-muted w-32">
                                {ROLE_NAMES[role] || role}
                              </th>
                            ))}
                            <th className="text-left py-4 px-6 text-[10px] font-black uppercase tracking-widest text-muted">Ngoại lệ (Nhân viên)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {items.map((item) => (
                            <tr key={item.key} className="hover:bg-gray-50/50 transition-colors">
                              <td className="py-4 px-6">
                                <p className="font-bold text-sm text-main">{item.description}</p>
                              </td>
                              
                              {/* Global Policy */}
                              <td className="py-4 px-4 text-center">
                                <PolicySelect 
                                  value={item.global_policy}
                                  onChange={(val) => handleUpdateGlobalPolicy(item.key, val!)}
                                  options={POLICY_OPTIONS}
                                />
                              </td>

                              {/* Role Overrides */}
                              {ROLES.map(role => (
                                <td key={role} className="py-4 px-4 text-center">
                                  <PolicySelect 
                                    value={item.role_policies[role] || null}
                                    onChange={(val) => handleUpdateRolePolicy(role, item.key, val)}
                                    options={OVERRIDE_OPTIONS}
                                    className={!item.role_policies[role] ? 'opacity-50 hover:opacity-100' : ''}
                                  />
                                </td>
                              ))}

                              {/* User Overrides Display */}
                              <td className="py-4 px-6">
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(item.user_policies).map(([userId, policy]) => {
                                    const staff = staffList.find(s => s.id === userId);
                                    if (!staff) return null;
                                    
                                    const policyConfig = POLICY_OPTIONS.find(p => p.id === policy);
                                    
                                    return (
                                      <div key={userId} className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-[10px] font-bold ${policyConfig?.color || 'bg-gray-100 border-gray-200'}`}>
                                        <span>{staff.full_name}</span>
                                        <button 
                                          onClick={() => handleUpdateUserPolicy(userId, item.key, null)}
                                          className="hover:text-red-500"
                                        >
                                          <XCircle size={12} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                  
                                  <button 
                                    onClick={() => {
                                      setEditingActionKey(item.key);
                                      setOverrideUserId('');
                                      setOverridePolicy('ALLOW');
                                    }}
                                    className="w-6 h-6 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-accent hover:border-accent transition-colors"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: FUNCTIONAL PERMISSIONS (NEW SIMPLE MATRIX) */}
          {activeTab === 'functional' && (
             <div className="space-y-6">
                <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm p-8">
                  <div className="mb-6">
                    <h2 className="text-xl font-black uppercase tracking-tight text-main mb-2">Phân quyền Chức năng</h2>
                    <p className="text-muted text-sm">Cấp quyền truy cập các trang và tính năng cho từng vai trò.</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left py-4 px-6 text-[10px] font-black uppercase tracking-widest text-muted w-1/3">Chức năng / Trang</th>
                          {/* Only show non-admin roles */}
                          {rolePermissions.filter(r => r.role_code !== 'admin').map(role => (
                            <th key={role.role_code} className="text-center py-4 px-4 text-[10px] font-black uppercase tracking-widest text-muted w-32">
                              {role.role_name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {PERMISSION_METADATA.map((group) => (
                          <Fragment key={group.group}>
                            {/* Group Header */}
                            <tr className="bg-slate-50/50">
                              <td colSpan={rolePermissions.length} className="py-3 px-6 font-black text-xs uppercase text-slate-500 tracking-wider">
                                {group.group}
                              </td>
                            </tr>
                            
                            {/* Permission Items */}
                            {group.items.map(item => (
                              <tr key={item.code} className="hover:bg-gray-50/50 transition-colors">
                                <td className="py-4 px-6">
                                  <p className="font-bold text-sm text-main">{item.label}</p>
                                </td>
                                
                                {rolePermissions.filter(r => r.role_code !== 'admin').map(role => {
                                  const isChecked = role.permissions.includes(item.code);
                                  return (
                                    <td key={role.role_code} className="py-4 px-4 text-center">
                                      <button
                                        onClick={() => handleToggleFunctionalPermission(role.role_code, item.code)}
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                          isChecked 
                                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' 
                                            : 'bg-gray-100 text-gray-300 hover:bg-gray-200'
                                        }`}
                                      >
                                        {isChecked ? <Check size={18} strokeWidth={3} /> : <X size={18} />}
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
             </div>
          )}
        </>
      )}

      {/* Modals */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-2xl font-black uppercase tracking-tight text-main mb-6">
              {editingStaff ? 'Cập nhật nhân viên' : 'Thêm nhân viên mới'}
            </h2>
            <form onSubmit={handleSaveStaff} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Tên đăng nhập</label>
                <input 
                  type="text"
                  value={staffFormData.username}
                  onChange={e => setStaffFormData({...staffFormData, username: e.target.value})}
                  className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-accent outline-none font-bold"
                  placeholder="VD: user1"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Họ và tên</label>
                <input 
                  type="text"
                  value={staffFormData.full_name}
                  onChange={e => setStaffFormData({...staffFormData, full_name: e.target.value})}
                  className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-accent outline-none font-bold"
                  placeholder="VD: Nguyễn Văn A"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Vai trò</label>
                <select 
                  value={staffFormData.role}
                  onChange={e => setStaffFormData({...staffFormData, role: e.target.value})}
                  className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-accent outline-none font-bold"
                >
                  <option value="Staff">Nhân viên</option>
                  <option value="Manager">Quản lý</option>
                </select>
              </div>
              
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                <input 
                  type="checkbox"
                  checked={staffFormData.is_active}
                  onChange={e => setStaffFormData({...staffFormData, is_active: e.target.checked})}
                  className="w-5 h-5 accent-accent"
                />
                <span className="font-bold text-sm text-main">Đang hoạt động</span>
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-muted hover:bg-gray-50 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 rounded-xl font-bold bg-accent text-white hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPinModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-black uppercase tracking-tight text-main mb-6">
              Đặt mã PIN cho {editingStaff?.full_name}
            </h2>
            <form onSubmit={handleSavePin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Mã PIN mới (4 số)</label>
                <input 
                  type="password"
                  maxLength={4}
                  value={pinFormData.pin}
                  onChange={e => setPinFormData({...pinFormData, pin: e.target.value.replace(/\D/g, '')})}
                  className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-accent outline-none font-black text-center text-2xl tracking-[1em]"
                  placeholder="••••"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Xác nhận mã PIN</label>
                <input 
                  type="password"
                  maxLength={4}
                  value={pinFormData.confirmPin}
                  onChange={e => setPinFormData({...pinFormData, confirmPin: e.target.value.replace(/\D/g, '')})}
                  className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-accent outline-none font-black text-center text-2xl tracking-[1em]"
                  placeholder="••••"
                />
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-muted hover:bg-gray-50 transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 rounded-xl font-bold bg-accent text-white hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
                >
                  Lưu PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isFloorModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-black uppercase tracking-tight text-main mb-2">
              Phân tầng hoạt động
            </h2>
            <p className="text-muted text-sm mb-6 font-medium">Chọn các tầng mà {editingStaff?.full_name} được phép quản lý</p>
            
            <form onSubmit={handleSaveFloors} className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                {availableFloors.map(floor => (
                  <button
                    key={floor}
                    type="button"
                    onClick={() => toggleFloor(floor)}
                    className={`h-12 rounded-xl font-black text-lg flex items-center justify-center transition-all border-2 ${
                      floorFormData.floors.includes(floor)
                        ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20'
                        : 'bg-gray-50 text-muted border-transparent hover:border-gray-200'
                    }`}
                  >
                    {floor}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsFloorModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-muted hover:bg-gray-50 transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 rounded-xl font-bold bg-accent text-white hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Override Modal (Restored) */}
      {editingActionKey && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-black uppercase tracking-tight text-main mb-2">
              Thêm ngoại lệ
            </h2>
            <p className="text-muted text-sm mb-6 font-medium">Cấp quyền riêng cho nhân viên cụ thể</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Nhân viên</label>
                <select 
                  value={overrideUserId}
                  onChange={e => setOverrideUserId(e.target.value)}
                  className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-accent outline-none font-bold"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {staffList
                    .filter(s => s.is_active)
                    .map(s => (
                    <option key={s.id} value={s.id}>{s.full_name} (@{s.username})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Quyền hạn</label>
                <div className="grid grid-cols-2 gap-2">
                    {POLICY_OPTIONS.map(opt => (
                        <button
                            key={opt.id}
                            onClick={() => setOverridePolicy(opt.id)}
                            className={`p-2 rounded-lg text-xs font-black uppercase tracking-wider border-2 transition-all ${
                                overridePolicy === opt.id 
                                    ? opt.color + ' border-current shadow-sm' 
                                    : 'bg-gray-50 text-muted border-transparent hover:bg-gray-100'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setEditingActionKey(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-muted hover:bg-gray-50 transition-colors"
                >
                  Hủy
                </button>
                <button 
                  onClick={async () => {
                    if (!overrideUserId) {
                        toast.error('Vui lòng chọn nhân viên');
                        return;
                    }
                    await handleUpdateUserPolicy(overrideUserId, editingActionKey, overridePolicy);
                    setEditingActionKey(null);
                  }}
                  className="flex-1 py-3 rounded-xl font-bold bg-accent text-white hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
                >
                  Lưu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
