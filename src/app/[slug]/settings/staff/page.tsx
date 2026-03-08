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
import { useRouter, useParams } from 'next/navigation';
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
  { id: 'DENY', label: 'Cấm', color: 'bg-rose-100 text-rose-700 border-rose-200' }
];

const OVERRIDE_OPTIONS = [
  { id: null, label: 'Kế thừa', color: 'bg-slate-100 text-slate-500 border-slate-200' },
  ...POLICY_OPTIONS
];

export default function StaffSettingsPage() {
  const router = useRouter();
  const { slug } = useParams();
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
      setEditingActionKey(null); // Close modal
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
        className={`h-9 text-[10px] font-black uppercase tracking-wider rounded-2xl border-2 outline-none cursor-pointer transition-all ${selected.color} ${className}`}
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
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!can(PERMISSION_KEYS.MANAGE_PERMISSIONS)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]">
        <div className="text-center">
          <ShieldCheck size={48} className="mx-auto text-slate-300 mb-4" />
          <h1 className="text-xl font-bold text-slate-700">Không có quyền truy cập</h1>
          <p className="text-slate-500">Bạn không có quyền quản lý nhân viên & phân quyền.</p>
          <Link href={`/${slug}/settings`} className="text-blue-500 hover:underline mt-4 block">
            Quay lại Cài đặt
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-8 pb-32 font-sans">
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <button 
              onClick={() => router.back()} 
              className="group flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-4 font-bold"
            >
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:border-slate-300 group-hover:bg-slate-50 transition-all">
                <ChevronLeft size={16} />
              </div>
              <span className="text-xs font-black uppercase tracking-widest">Quay lại</span>
            </button>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <ShieldCheck size={24} />
              </div>
              Nhân viên & Bảo mật
            </h1>
          </div>

          <div className="flex p-1.5 bg-slate-100 rounded-[20px] w-full md:w-auto">
            <button 
              onClick={() => setActiveTab('staff')}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'staff' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Tài khoản
            </button>
            <button 
              onClick={() => setActiveTab('security')}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'security' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Ma trận Bảo mật
            </button>
            <button 
              onClick={() => setActiveTab('functional')}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'functional' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Phân quyền
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
          </div>
        ) : (
          <>
            {/* TAB 1: STAFF MANAGEMENT */}
            {activeTab === 'staff' && (
              <div className="space-y-6">
                {/* Staff Filter/Toggle */}
                <div className="flex justify-end">
                  <button 
                    onClick={() => setShowInactive(!showInactive)}
                    className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-2xl border-2 transition-all ${showInactive ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                  >
                    {showInactive ? 'Đang hiện nhân viên đã khóa' : 'Xem nhân viên đã nghỉ việc'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Add Staff Card */}
                  <div 
                    onClick={() => handleOpenStaffModal()}
                    className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[32px] p-8 flex flex-col items-center justify-center text-center group cursor-pointer hover:bg-slate-100 transition-all min-h-[200px]"
                  >
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-400 mb-4 shadow-sm group-hover:scale-110 transition-transform">
                      <Plus size={32} />
                    </div>
                    <h3 className="font-black uppercase tracking-tight text-slate-600">Thêm nhân viên</h3>
                    <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase">Cấp tài khoản mới</p>
                  </div>

                  {/* Staff List */}
                  {staffList
                    .filter(s => showInactive || s.is_active)
                    .map((staff) => (
                      <div key={staff.id} className={`bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm relative group transition-all ${staff.is_active ? '' : 'opacity-70 grayscale hover:opacity-100 hover:grayscale-0'}`}>
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600">
                              <Users size={20} />
                            </div>
                            <div>
                              <h3 className="text-lg font-black tracking-tight text-slate-900">{staff.full_name}</h3>
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">@{staff.username}</p>
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${staff.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {staff.is_active ? 'Active' : 'Locked'}
                          </div>
                        </div>

                        <div className="flex gap-2">
                           <div className="flex-1 px-4 py-3 bg-slate-50 rounded-2xl text-xs font-bold text-slate-600 flex items-center gap-2">
                             <Shield size={14} className="text-slate-400" />
                             {ROLE_NAMES[staff.role] || staff.role}
                           </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-4">
                          <button 
                            onClick={() => handleOpenPinModal(staff)}
                            className="py-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 text-slate-600"
                          >
                            <Key size={14} /> PIN
                          </button>
                          <button 
                            onClick={() => handleOpenFloorModal(staff)}
                            className="py-3 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-2xl flex items-center justify-center transition-all text-slate-600"
                            title="Phân tầng"
                          >
                            <MapPin size={16} />
                          </button>
                          <button 
                            onClick={() => handleOpenStaffModal(staff)}
                            className="py-3 bg-slate-50 hover:bg-orange-50 hover:text-orange-600 rounded-2xl flex items-center justify-center transition-all text-slate-600"
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
              <div className="space-y-8">
                {securityCategories.map((cat) => {
                  // Find items for this category (handling both 'checkin' and 'checkin_...' keys)
                  const items = groupedMatrix[cat.id] || [];
                  if (items.length === 0) return null;

                  return (
                    <div key={cat.id}>
                      <div className="flex items-center gap-3 mb-6">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${cat.bg} ${cat.color}`}>
                          <ShieldCheck size={20} />
                        </div>
                        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">{cat.name}</h2>
                      </div>
                      
                      <div className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="text-left py-6 px-8 text-[10px] font-black uppercase tracking-widest text-slate-400 w-1/3">Hành động bảo mật</th>
                              <th className="text-center py-6 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-32">Mặc định</th>
                              {ROLES.map(role => (
                                <th key={role} className="text-center py-6 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-32">
                                  {ROLE_NAMES[role] || role}
                                </th>
                              ))}
                              <th className="text-left py-6 px-8 text-[10px] font-black uppercase tracking-widest text-slate-400">Ngoại lệ (Nhân viên)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {items.map((item) => (
                              <tr key={item.key} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-6 px-8">
                                  <p className="font-bold text-sm text-slate-700">{item.description}</p>
                                  <p className="text-[10px] font-bold text-slate-400 font-mono mt-1">{item.key}</p>
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
                                <td className="py-4 px-8">
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(item.user_policies).map(([userId, policy]) => {
                                      const staff = staffList.find(s => s.id === userId);
                                      if (!staff) return null;
                                      
                                      const policyConfig = POLICY_OPTIONS.find(p => p.id === policy);
                                      
                                      return (
                                        <div key={userId} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-bold ${policyConfig?.color || 'bg-slate-100 border-slate-200'}`}>
                                          <span>{staff.full_name}</span>
                                          <button 
                                            onClick={() => handleUpdateUserPolicy(userId, item.key, null)}
                                            className="hover:text-red-500 transition-colors"
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
                                      className="w-8 h-8 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-200 transition-colors bg-white"
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

            {/* TAB 3: FUNCTIONAL PERMISSIONS */}
            {activeTab === 'functional' && (
               <div className="space-y-6">
                  <div className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm p-8">
                    <div className="mb-8">
                      <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 mb-2">Phân quyền Chức năng</h2>
                      <p className="text-slate-500 text-sm font-medium">Cấp quyền truy cập các trang và tính năng cho từng vai trò.</p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left py-6 px-8 text-[10px] font-black uppercase tracking-widest text-slate-400 w-1/3">Chức năng / Trang</th>
                            {/* Only show non-admin roles */}
                            {rolePermissions.filter(r => r.role_code !== 'admin').map(role => (
                              <th key={role.role_code} className="text-center py-6 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-32">
                                {role.role_name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {PERMISSION_METADATA.map((group) => (
                            <Fragment key={group.group}>
                              {/* Group Header */}
                              <tr className="bg-slate-50/50">
                                <td colSpan={rolePermissions.length} className="py-4 px-8 font-black text-xs uppercase text-slate-500 tracking-wider">
                                  {group.group}
                                </td>
                              </tr>
                              
                              {/* Permission Items */}
                              {group.items.map(item => (
                                <tr key={item.code} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="py-4 px-8">
                                    <p className="font-bold text-sm text-slate-700">{item.label}</p>
                                  </td>
                                  
                                  {rolePermissions.filter(r => r.role_code !== 'admin').map(role => {
                                    const isChecked = role.permissions.includes(item.code);
                                    return (
                                      <td key={role.role_code} className="py-4 px-4 text-center">
                                        <button
                                          onClick={() => handleToggleFunctionalPermission(role.role_code, item.code)}
                                          className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                                            isChecked 
                                              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' 
                                              : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                                          }`}
                                        >
                                          {isChecked ? <Check size={20} strokeWidth={3} /> : <X size={20} />}
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

        {/* Modals - Standardized Style */}
        {isStaffModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 mb-6">
                {editingStaff ? 'Cập nhật nhân viên' : 'Thêm nhân viên mới'}
              </h2>
              <form onSubmit={handleSaveStaff} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Tên đăng nhập</label>
                  <input 
                    type="text"
                    value={staffFormData.username}
                    onChange={e => setStaffFormData({...staffFormData, username: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700 transition-all"
                    placeholder="VD: user1"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Họ và tên</label>
                  <input 
                    type="text"
                    value={staffFormData.full_name}
                    onChange={e => setStaffFormData({...staffFormData, full_name: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700 transition-all"
                    placeholder="VD: Nguyễn Văn A"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Vai trò</label>
                  <div className="relative">
                    <select 
                      value={staffFormData.role}
                      onChange={e => setStaffFormData({...staffFormData, role: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700 transition-all cursor-pointer appearance-none"
                    >
                      <option value="Staff">Nhân viên</option>
                      <option value="Manager">Quản lý</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronLeft size={16} className="-rotate-90" />
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <input 
                    type="checkbox"
                    checked={staffFormData.is_active}
                    onChange={e => setStaffFormData({...staffFormData, is_active: e.target.checked})}
                    className="w-5 h-5 accent-blue-600 rounded-lg cursor-pointer"
                  />
                  <span className="font-bold text-sm text-slate-700">Đang hoạt động</span>
                </div>

                <div className="flex gap-3 mt-8">
                  <button 
                    type="button"
                    onClick={() => setIsStaffModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 rounded-2xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                  >
                    Lưu thay đổi
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isPinModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 mb-6">
                Đặt mã PIN cho {editingStaff?.full_name}
              </h2>
              <form onSubmit={handleSavePin} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Mã PIN mới (4 số)</label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={pinFormData.pin}
                    onChange={e => setPinFormData({...pinFormData, pin: e.target.value.replace(/\D/g, '')})}
                    className="w-full px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-black text-center text-3xl tracking-[0.5em] text-slate-900"
                    placeholder="••••"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Xác nhận mã PIN</label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={pinFormData.confirmPin}
                    onChange={e => setPinFormData({...pinFormData, confirmPin: e.target.value.replace(/\D/g, '')})}
                    className="w-full px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-black text-center text-3xl tracking-[0.5em] text-slate-900"
                    placeholder="••••"
                  />
                </div>

                <div className="flex gap-3 mt-8">
                  <button 
                    type="button"
                    onClick={() => setIsPinModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 rounded-2xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                  >
                    Lưu PIN
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isFloorModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 mb-2">
                Phân tầng hoạt động
              </h2>
              <p className="text-slate-500 text-sm mb-6 font-medium">Chọn các tầng mà {editingStaff?.full_name} được phép quản lý</p>
              
              <form onSubmit={handleSaveFloors} className="space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  {availableFloors.map(floor => (
                    <button
                      key={floor}
                      type="button"
                      onClick={() => toggleFloor(floor)}
                      className={`h-14 rounded-2xl font-black text-xl flex items-center justify-center transition-all border-2 ${
                        floorFormData.floors.includes(floor)
                          ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200'
                          : 'bg-slate-50 text-slate-400 border-transparent hover:border-slate-200'
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
                    className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 rounded-2xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                  >
                    Lưu
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* User Override Modal */}
        {editingActionKey && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 mb-2">
                Thêm ngoại lệ
              </h2>
              <p className="text-slate-500 text-sm mb-6 font-medium">Cấp quyền riêng cho nhân viên cụ thể</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Nhân viên</label>
                  <select 
                    value={overrideUserId}
                    onChange={(e) => setOverrideUserId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700 transition-all cursor-pointer"
                  >
                    <option value="">-- Chọn nhân viên --</option>
                    {staffList.map(staff => (
                      <option key={staff.id} value={staff.id}>
                        {staff.full_name} (@{staff.username})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Quyền hạn</label>
                  <div className="grid grid-cols-3 gap-2">
                    {POLICY_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setOverridePolicy(opt.id)}
                        className={`py-3 rounded-2xl text-xs font-black uppercase tracking-wider border-2 transition-all ${
                          overridePolicy === opt.id
                            ? `${opt.color} shadow-sm scale-105`
                            : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
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
                    className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    disabled={!overrideUserId}
                    onClick={() => handleUpdateUserPolicy(overrideUserId, editingActionKey!, overridePolicy)}
                    className="flex-1 py-4 rounded-2xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Lưu
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
