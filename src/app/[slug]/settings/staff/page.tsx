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
  X,
  ArrowLeft,
  Fingerprint,
  UserCheck
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { PERMISSION_METADATA } from '@/constants/permissions';
import { permissionService, RolePermission, PERMISSION_KEYS } from '@/services/permissionService';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

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
  { id: 'ALLOW', label: 'Tự quyết', color: 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-emerald-50' },
  { id: 'PIN', label: 'Cần PIN', color: 'bg-amber-50 text-amber-600 border-amber-100 shadow-amber-50' },
  { id: 'DENY', label: 'Cấm', color: 'bg-rose-50 text-rose-600 border-rose-100 shadow-rose-50' }
];

const OVERRIDE_OPTIONS = [
  { id: null, label: 'Kế thừa', color: 'bg-slate-50 text-slate-400 border-slate-100' },
  ...POLICY_OPTIONS
];

export default function StaffSettingsPage() {
  const router = useRouter();
  const { slug } = useParams();
  const { can, isLoading: isAuthLoading } = usePermission();
  const { user } = useAuthStore();
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
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*')
        .order('full_name');
      if (staffError) throw staffError;
      setStaffList(staffData);

      const { data: matrixData, error: matrixError } = await supabase.rpc('fn_get_security_matrix');
      if (matrixError) throw matrixError;
      setSecurityMatrix(matrixData || []);

      const rolesData = await permissionService.getAllRoles();
      setRolePermissions(rolesData);

      const { data: floorsData } = await supabase.rpc('fn_get_available_floors');
      setAvailableFloors(floorsData?.map((f: any) => f.floor) || []);

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
      
      setSecurityMatrix(prev => prev.map(item => 
        item.key === key ? { ...item, global_policy: policy } : item
      ));
      toast.success('Đã cập nhật cấu hình mặc định');
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
      fetchData();
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
      
      setSecurityMatrix(prev => prev.map(item => {
        if (item.key !== key) return item;
        const newUsers = { ...item.user_policies };
        if (policy) newUsers[staffId] = policy;
        else delete newUsers[staffId];
        return { ...item, user_policies: newUsers };
      }));
      
      toast.success('Đã cập nhật ngoại lệ cho nhân viên');
      setEditingActionKey(null);
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
        className={cn(
          "h-10 text-[10px] font-black uppercase tracking-wider rounded-2xl border border-transparent outline-none cursor-pointer transition-all shadow-sm px-3",
          selected.color,
          className
        )}
      >
        {options.map(opt => (
          <option key={opt.id || 'inherit'} value={opt.id || ''}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  };

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
      if (!user?.hotel_id) throw new Error('Không tìm thấy thông tin khách sạn');
      await permissionService.updateRolePermissions(roleCode, newPermissions, user.hotel_id);
      setRolePermissions(prev => prev.map(r => 
        r.role_code === roleCode ? { ...r, permissions: newPermissions } : r
      ));
      toast.success('Đã cập nhật quyền thành công');
    } catch (error: any) {
      toast.error('Lỗi cập nhật: ' + error.message);
    }
  };

  if (isAuthLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
    </div>
  );

  if (!can(PERMISSION_KEYS.MANAGE_PERMISSIONS)) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="text-center p-10 bg-white rounded-[40px] shadow-sm">
        <ShieldCheck size={64} className="mx-auto text-slate-200 mb-6" />
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Quyền truy cập bị từ chối</h1>
        <p className="text-slate-400 font-bold mt-2">Bạn không có quyền quản lý nhân sự & phân quyền.</p>
        <Link href={`/${slug}/settings`} className="inline-block px-8 py-3 bg-slate-900 text-white rounded-full font-bold mt-8 transition-all active:scale-95">
          Quay lại Cài đặt
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans selection:bg-slate-900 selection:text-white pb-40">
      
      {/* 1. TOP NAV */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-[1200px] mx-auto px-4 md:px-10 h-20 md:h-24 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white rounded-full border border-slate-200 shadow-sm hover:bg-slate-50 transition-all active:scale-90"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 leading-none">Nhân viên & Quyền</h1>
              <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Quản trị nhân sự & Bảo mật</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-100/50 rounded-full border border-slate-200/60 shadow-inner md:flex hidden">
            {[
              { id: 'staff', label: 'Tài khoản', icon: Users },
              { id: 'security', label: 'Bảo mật', icon: ShieldCheck },
              { id: 'functional', label: 'Tính năng', icon: Lock },
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "px-6 py-2 rounded-full text-[11px] font-black transition-all uppercase tracking-widest flex items-center gap-2",
                  activeTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>

          <button 
            onClick={() => handleOpenStaffModal()}
            className="h-10 md:h-12 px-5 md:px-8 bg-slate-900 text-white rounded-full text-[13px] font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
          >
            <Plus size={18} />
            <span className="hidden md:inline">Thêm nhân viên</span>
          </button>
        </div>
      </div>

      <main className="max-w-[1200px] mx-auto px-4 md:px-10 py-8 md:py-12 space-y-10 md:space-y-16">
        
        {/* Mobile Tab Nav */}
        <div className="flex md:hidden p-1.5 bg-white/80 backdrop-blur-md rounded-full border border-slate-200/60 shadow-sm overflow-x-auto no-scrollbar">
          {[
            { id: 'staff', label: 'Tài khoản' },
            { id: 'security', label: 'Bảo mật' },
            { id: 'functional', label: 'Quyền' },
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 px-6 py-2.5 rounded-full text-[10px] font-black transition-all uppercase tracking-widest whitespace-nowrap",
                activeTab === tab.id ? "bg-slate-900 text-white shadow-md" : "text-slate-400"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* TAB 1: STAFF LIST */}
          {activeTab === 'staff' && (
            <div className="space-y-10">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-2xl md:text-3xl font-black tracking-tight">Danh sách nhân sự</h2>
                <button 
                  onClick={() => setShowInactive(!showInactive)}
                  className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full border transition-all",
                    showInactive ? "bg-rose-50 border-rose-100 text-rose-500" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                  )}
                >
                  {showInactive ? 'Ẩn nhân viên khóa' : 'Xem nhân viên đã nghỉ'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {staffList
                  .filter(s => showInactive || s.is_active)
                  .map((staff) => (
                    <div 
                      key={staff.id} 
                      className={cn(
                        "bg-white/80 backdrop-blur-xl rounded-[40px] p-8 border border-white shadow-[0_10px_40px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.05)] hover:scale-[1.02] transition-all duration-500 group relative overflow-hidden",
                        !staff.is_active && "opacity-60 grayscale"
                      )}
                    >
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="flex items-start justify-between mb-8">
                          <div className="flex items-center gap-5">
                            <div className="w-16 h-16 rounded-[24px] bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all duration-500">
                              <Users size={32} />
                            </div>
                            <div>
                              <h3 className="text-xl font-black tracking-tight text-slate-900">{staff.full_name}</h3>
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">@{staff.username}</p>
                            </div>
                          </div>
                          <div className={cn(
                            "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                            staff.is_active ? "bg-emerald-50 text-emerald-500 border-emerald-100" : "bg-rose-50 text-rose-500 border-rose-100"
                          )}>
                            {staff.is_active ? 'Active' : 'Locked'}
                          </div>
                        </div>

                        <div className="space-y-4 flex-1">
                          <div className="flex items-center gap-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                            <Shield size={16} className="text-slate-300" />
                            <span className="text-xs font-black uppercase tracking-widest text-slate-600">{ROLE_NAMES[staff.role] || staff.role}</span>
                          </div>
                          
                          {userFloorsMap[staff.id] && userFloorsMap[staff.id].length > 0 && (
                            <div className="flex items-center gap-3 bg-blue-50/30 p-4 rounded-2xl border border-blue-100/30">
                              <MapPin size={16} className="text-blue-300" />
                              <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">
                                Tầng: {userFloorsMap[staff.id].join(', ')}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-10 pt-6 border-t border-slate-50">
                          <button onClick={() => handleOpenPinModal(staff)} className="h-12 bg-slate-50 hover:bg-slate-900 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 text-slate-400">
                            <Fingerprint size={16} /> PIN
                          </button>
                          <button onClick={() => handleOpenFloorModal(staff)} className="h-12 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-2xl flex items-center justify-center transition-all text-slate-400">
                            <MapPin size={18} />
                          </button>
                          <button onClick={() => handleOpenStaffModal(staff)} className="h-12 bg-slate-50 hover:bg-orange-50 hover:text-orange-600 rounded-2xl flex items-center justify-center transition-all text-slate-400">
                            <Settings2 size={18} />
                          </button>
                        </div>
                      </div>
                      
                      {/* Decoration */}
                      <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none -rotate-12">
                        <Users size={150} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 2: SECURITY MATRIX */}
          {activeTab === 'security' && (
            <div className="space-y-12">
              <div className="px-2">
                <h2 className="text-2xl md:text-3xl font-black tracking-tight">Ma trận Bảo mật</h2>
                <p className="text-slate-400 font-bold text-sm md:text-base mt-1">Cấu hình các hành động yêu cầu xác thực hoặc giới hạn quyền hạn</p>
              </div>

              {securityCategories.map((cat) => {
                const items = groupedMatrix[cat.id] || [];
                if (items.length === 0) return null;

                return (
                  <div key={cat.id} className="space-y-6">
                    <div className="flex items-center gap-4 px-2">
                      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm", cat.bg, cat.color)}>
                        <ShieldCheck size={24} />
                      </div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">{cat.name}</h3>
                    </div>
                    
                    <div className="bg-white/80 backdrop-blur-xl rounded-[40px] border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                              <th className="text-left py-8 px-10 text-[11px] font-black uppercase tracking-widest text-slate-400">Hành động</th>
                              <th className="text-center py-8 px-4 text-[11px] font-black uppercase tracking-widest text-slate-400 w-40">Mặc định</th>
                              {ROLES.map(role => (
                                <th key={role} className="text-center py-8 px-4 text-[11px] font-black uppercase tracking-widest text-slate-400 w-40">
                                  {ROLE_NAMES[role] || role}
                                </th>
                              ))}
                              <th className="text-left py-8 px-10 text-[11px] font-black uppercase tracking-widest text-slate-400">Ngoại lệ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {items.map((item) => (
                              <tr key={item.key} className="hover:bg-slate-50/30 transition-colors group">
                                <td className="py-6 px-10">
                                  <p className="font-black text-slate-800 tracking-tight leading-none">{item.description}</p>
                                </td>
                                
                                <td className="py-4 px-4 text-center">
                                  <PolicySelect 
                                    value={item.global_policy}
                                    onChange={(val) => handleUpdateGlobalPolicy(item.key, val!)}
                                  />
                                </td>

                                {ROLES.map(role => (
                                  <td key={role} className="py-4 px-4 text-center">
                                    <PolicySelect 
                                      value={item.role_policies[role] || null}
                                      onChange={(val) => handleUpdateRolePolicy(role, item.key, val)}
                                      options={OVERRIDE_OPTIONS}
                                      className={!item.role_policies[role] ? 'opacity-30 hover:opacity-100' : ''}
                                    />
                                  </td>
                                ))}

                                <td className="py-4 px-10">
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(item.user_policies).map(([userId, policy]) => {
                                      const staff = staffList.find(s => s.id === userId);
                                      if (!staff) return null;
                                      const policyConfig = POLICY_OPTIONS.find(p => p.id === policy);
                                      return (
                                        <div key={userId} className={cn(
                                          "flex items-center gap-2 px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest shadow-sm",
                                          policyConfig?.color || 'bg-slate-50 border-slate-100'
                                        )}>
                                          <span>{staff.full_name}</span>
                                          <button onClick={() => handleUpdateUserPolicy(userId, item.key, null)} className="hover:text-rose-500 transition-colors">
                                            <X size={12} />
                                          </button>
                                        </div>
                                      );
                                    })}
                                    
                                    <button 
                                      onClick={() => { setEditingActionKey(item.key); setOverrideUserId(''); setOverridePolicy('ALLOW'); }}
                                      className="w-10 h-10 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 hover:text-blue-500 hover:border-blue-200 transition-all bg-white"
                                    >
                                      <Plus size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: FUNCTIONAL PERMISSIONS */}
          {activeTab === 'functional' && (
            <div className="space-y-12">
              <div className="px-2">
                <h2 className="text-2xl md:text-3xl font-black tracking-tight">Phân quyền Tính năng</h2>
                <p className="text-slate-400 font-bold text-sm md:text-base mt-1">Cấp quyền truy cập các module và trang nghiệp vụ cho từng vai trò</p>
              </div>

              <div className="bg-white/80 backdrop-blur-xl rounded-[40px] border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="text-left py-8 px-10 text-[11px] font-black uppercase tracking-widest text-slate-400">Chức năng / Module</th>
                        {rolePermissions.filter(r => r.role_code !== 'admin').map(role => (
                          <th key={role.role_code} className="text-center py-8 px-4 text-[11px] font-black uppercase tracking-widest text-slate-400 w-40">
                            {role.role_name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {PERMISSION_METADATA.map((group) => (
                        <Fragment key={group.group}>
                          <tr className="bg-slate-50/30">
                            <td colSpan={rolePermissions.length} className="py-5 px-10 font-black text-[10px] uppercase text-slate-400 tracking-[0.2em]">
                              {group.group}
                            </td>
                          </tr>
                          
                          {group.items.map(item => (
                            <tr key={item.code} className="hover:bg-slate-50/30 transition-colors">
                              <td className="py-5 px-10">
                                <p className="font-black text-slate-700 text-sm tracking-tight">{item.label}</p>
                              </td>
                              
                              {rolePermissions.filter(r => r.role_code !== 'admin').map(role => {
                                const isChecked = role.permissions.includes(item.code);
                                return (
                                  <td key={role.role_code} className="py-4 px-4 text-center">
                                    <button
                                      onClick={() => handleToggleFunctionalPermission(role.role_code, item.code)}
                                      className={cn(
                                        "w-12 h-12 rounded-[18px] flex items-center justify-center transition-all duration-500",
                                        isChecked 
                                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100" 
                                          : "bg-slate-50 text-slate-200 hover:bg-slate-100 hover:text-slate-400"
                                      )}
                                    >
                                      {isChecked ? <UserCheck size={20} /> : <Lock size={18} strokeWidth={3} />}
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
        </div>
      </main>

      {/* 5. MODALS (STAFF, PIN, FLOOR, OVERRIDE) */}
      
      {/* Staff Modal */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] md:rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-white animate-in slide-in-from-bottom duration-500">
            <div className="p-8 md:p-10 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div className="space-y-1">
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                  {editingStaff ? 'Hồ sơ nhân viên' : 'Nhân viên mới'}
                </h3>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Thiết lập tài khoản & vai trò</p>
              </div>
              <button onClick={() => setIsStaffModalOpen(false)} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full text-slate-400 border border-slate-100 shadow-sm transition-all">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveStaff} className="p-8 md:p-10 space-y-8">
              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Tên đăng nhập *</label>
                <input 
                  type="text"
                  value={staffFormData.username}
                  onChange={e => setStaffFormData({...staffFormData, username: e.target.value})}
                  className="w-full h-16 px-8 rounded-[24px] bg-slate-50 border border-transparent font-black text-xl text-slate-900 outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all"
                  placeholder="VD: nv_linh"
                />
              </div>
              
              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Họ và tên *</label>
                <input 
                  type="text"
                  value={staffFormData.full_name}
                  onChange={e => setStaffFormData({...staffFormData, full_name: e.target.value})}
                  className="w-full h-16 px-8 rounded-[24px] bg-slate-50 border border-transparent font-black text-xl text-slate-900 outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all"
                  placeholder="VD: Nguyễn Văn A"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Vai trò hệ thống</label>
                <div className="grid grid-cols-2 gap-3">
                  {['Staff', 'Manager'].map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setStaffFormData({...staffFormData, role})}
                      className={cn(
                        "h-16 rounded-[24px] font-black uppercase tracking-widest text-[11px] transition-all border-2",
                        staffFormData.role === role 
                          ? "bg-slate-900 text-white border-slate-900 shadow-lg" 
                          : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                      )}
                    >
                      {ROLE_NAMES[role]}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="p-6 rounded-[32px] bg-slate-50/50 border border-slate-100 flex items-center justify-between gap-6">
                <div className="space-y-1">
                  <p className="text-base font-black text-slate-900 tracking-tight">Trạng thái hoạt động</p>
                  <p className="text-[11px] font-bold text-slate-400 leading-relaxed">Nhân viên có thể đăng nhập vào hệ thống</p>
                </div>
                <div 
                  onClick={() => setStaffFormData({...staffFormData, is_active: !staffFormData.is_active})}
                  className={cn(
                    "w-14 h-8 rounded-full relative transition-all cursor-pointer",
                    staffFormData.is_active ? "bg-emerald-500" : "bg-slate-200"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 bg-white rounded-full absolute top-1 transition-all shadow-sm",
                    staffFormData.is_active ? "left-7" : "left-1"
                  )} />
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full py-5 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[13px] shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {editingStaff ? 'Cập nhật hồ sơ' : 'Tạo tài khoản ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pin Modal */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] md:rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden border border-white animate-in slide-in-from-bottom duration-500">
            <div className="p-8 md:p-10 text-center space-y-2 bg-slate-50/50 border-b border-slate-100">
              <div className="w-16 h-16 bg-white rounded-[24px] shadow-sm flex items-center justify-center mx-auto mb-4 text-slate-900">
                <Key size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Thiết lập mã PIN</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{editingStaff?.full_name}</p>
            </div>
            
            <form onSubmit={handleSavePin} className="p-8 md:p-10 space-y-8">
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center block">Mã PIN mới (4 số)</label>
                  <input 
                    type="password"
                    maxLength={4}
                    autoFocus
                    value={pinFormData.pin}
                    onChange={e => setPinFormData({...pinFormData, pin: e.target.value.replace(/\D/g, '')})}
                    className="w-full h-20 bg-slate-50 rounded-[32px] font-black text-center text-4xl tracking-[0.8em] text-slate-900 outline-none focus:bg-white focus:ring-4 focus:ring-slate-900/5 border-none transition-all"
                    placeholder="••••"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center block">Xác nhận lại</label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={pinFormData.confirmPin}
                    onChange={e => setPinFormData({...pinFormData, confirmPin: e.target.value.replace(/\D/g, '')})}
                    className="w-full h-20 bg-slate-50 rounded-[32px] font-black text-center text-4xl tracking-[0.8em] text-slate-900 outline-none focus:bg-white focus:ring-4 focus:ring-slate-900/5 border-none transition-all"
                    placeholder="••••"
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-5 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[13px] shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all"
              >
                Lưu mã PIN
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floor Modal */}
      {isFloorModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] md:rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden border border-white animate-in slide-in-from-bottom duration-500">
            <div className="p-8 md:p-10 text-center space-y-2 bg-slate-50/50 border-b border-slate-100">
              <div className="w-16 h-16 bg-white rounded-[24px] shadow-sm flex items-center justify-center mx-auto mb-4 text-blue-500">
                <MapPin size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Phân tầng quản lý</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{editingStaff?.full_name}</p>
            </div>
            
            <form onSubmit={handleSaveFloors} className="p-8 md:p-10 space-y-8">
              <div className="grid grid-cols-3 gap-3">
                {availableFloors.map(floor => (
                  <button
                    key={floor}
                    type="button"
                    onClick={() => toggleFloor(floor)}
                    className={cn(
                      "h-16 rounded-[24px] font-black text-xl flex items-center justify-center transition-all border-2",
                      floorFormData.floors.includes(floor)
                        ? "bg-slate-900 text-white border-slate-900 shadow-lg"
                        : "bg-slate-50 text-slate-300 border-transparent hover:border-slate-200"
                    )}
                  >
                    {floor}
                  </button>
                ))}
              </div>

              <button 
                type="submit"
                className="w-full py-5 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[13px] shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all"
              >
                Lưu phân tầng
              </button>
            </form>
          </div>
        </div>
      )}

      {/* User Override Modal */}
      {editingActionKey && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] md:rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-white animate-in slide-in-from-bottom duration-500">
            <div className="p-8 md:p-10 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div className="space-y-1">
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Ngoại lệ nhân sự</h3>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Thiết lập quyền riêng biệt</p>
              </div>
              <button onClick={() => setEditingActionKey(null)} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full text-slate-400 border border-slate-100 shadow-sm transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 md:p-10 space-y-8">
              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Chọn nhân viên</label>
                <select 
                  value={overrideUserId}
                  onChange={(e) => setOverrideUserId(e.target.value)}
                  className="w-full h-16 px-8 rounded-[24px] bg-slate-50 border-none font-black text-lg text-slate-900 outline-none focus:ring-4 focus:ring-slate-900/5 transition-all cursor-pointer appearance-none"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {staffList.map(staff => (
                    <option key={staff.id} value={staff.id}>{staff.full_name} (@{staff.username})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Quyền hạn áp dụng</label>
                <div className="grid grid-cols-3 gap-2">
                  {POLICY_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setOverridePolicy(opt.id)}
                      className={cn(
                        "h-16 rounded-[24px] text-[10px] font-black uppercase tracking-widest border-2 transition-all",
                        overridePolicy === opt.id
                          ? opt.color + " border-transparent shadow-lg"
                          : "bg-white border-slate-100 text-slate-300 hover:border-slate-200"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <button 
                  disabled={!overrideUserId}
                  onClick={() => handleUpdateUserPolicy(overrideUserId, editingActionKey!, overridePolicy)}
                  className="w-full py-5 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[13px] shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-30"
                >
                  Xác nhận ngoại lệ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
