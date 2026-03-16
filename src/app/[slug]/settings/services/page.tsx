'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Save, 
  X, 
  Coffee,
  Archive,
  CheckCircle2,
  Package,
  RefreshCw,
  History,
  ArrowRight,
  Truck,
  ChevronLeft,
  ArrowLeft,
  Settings2,
  AlertCircle
} from 'lucide-react';
import { serviceService, Service, InventoryLog } from '@/services/serviceService';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import PinValidationModal from '@/components/shared/PinValidationModal';
import { formatMoney } from '@/utils/format';
import InventoryImportModal from './InventoryImportModal';
import { Switch } from '@/components/ui/controls';

import { useGlobalDialog } from '@/providers/GlobalDialogProvider';

export default function ServicesPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params?.slug as string;
  const { user } = useAuth();
  const { confirm: confirmDialog } = useGlobalDialog();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [isControlModalOpen, setIsControlModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Partial<Service> | null>(null);
  
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  
  // PIN Validation State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [pinActionName, setPinActionName] = useState('');
  
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [logs, setLogs] = useState<InventoryLog[]>([]);

  // Form states for inventory
  const [inventoryForm, setInventoryForm] = useState({ quantity: 0, cost: 0, notes: '' });

  // Bulk Import State
  const [bulkItems, setBulkItems] = useState<{id: string, qty: number, mode: 'buy_unit' | 'sell_unit'}[]>([]);
  const [securitySettings, setSecuritySettings] = useState<Record<string, boolean>>({});

  // Fetch Services
  const fetchServices = async () => {
    setIsLoading(true);
    try {
      const data = await serviceService.getAllServices();
      setServices(data);
    } catch (error) {
      console.error('Error fetching services:', error);
      toast.error('Không thể tải danh sách dịch vụ');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSecuritySettings = async () => {
    const { data } = await supabase.rpc('fn_get_security_settings');
    if (data) setSecuritySettings(data);
  };

  useEffect(() => {
    fetchServices();
    fetchSecuritySettings();
  }, []);

  // Handlers
  const handleSave = async () => {
    if (!editingService?.name || !editingService?.price || !editingService?.unit_sell) {
      toast.error('Vui lòng điền tên, giá bán và đơn vị bán!');
      return;
    }

    if (editingService.track_inventory && (editingService.cost_price || 0) <= 0) {
        toast.error('Giá vốn phải lớn hơn 0 khi quản lý tồn kho!');
        return;
    }

    const payload = {
        ...editingService,
        unit: editingService.unit_sell // Sync unit for backward compatibility
    };

    try {
      if (editingService.id) {
        await serviceService.updateService(editingService.id, payload);
      } else {
        await serviceService.createService({ ...payload, is_active: true });
      }

      setIsEditModalOpen(false);
      setEditingService(null);
      fetchServices();
      toast.success('Đã lưu dịch vụ thành công');
    } catch (error) {
      console.error('Error saving service:', error);
      toast.error('Lỗi khi lưu dịch vụ');
    }
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirmDialog({
      title: 'Xóa dịch vụ',
      message: 'Bạn có chắc chắn muốn xóa dịch vụ này?',
      confirmLabel: 'Xóa ngay',
      cancelLabel: 'Hủy',
      destructive: true
    });

    if (isConfirmed) {
      try {
        await serviceService.deleteService(id);
        fetchServices();
        toast.success('Đã xóa dịch vụ thành công');
      } catch (error) {
        console.error('Error deleting service:', error);
        toast.error('Lỗi khi xóa dịch vụ');
      }
    }
  };

  const handleToggleStatus = async (service: Service) => {
    try {
      await serviceService.updateService(service.id, { is_active: !service.is_active });
      fetchServices();
      toast.success(`Đã ${!service.is_active ? 'hiện' : 'ẩn'} dịch vụ thành công`);
    } catch (error) {
      console.error('Error toggling status:', error);
      toast.error('Lỗi khi đổi trạng thái');
    }
  };

  const executeImport = async (data: { quantity: number; cost: number; notes: string; mode: 'buy_unit' | 'sell_unit' }) => {
    if (!selectedService || data.quantity <= 0) return;

    const qtyBuy = Number(data.quantity);
    const totalAmount = Math.round(Number(data.cost));
    let note = data.notes;
    const currentMode = data.mode;

    let finalQtyToImport = qtyBuy;
    // Nếu nhập theo đơn vị bán (Lon), ta cần quy đổi ngược lại về đơn vị mua (Thùng) để truyền vào RPC
    // Vì RPC p_qty_buy sẽ nhân với conversion_factor
    if (currentMode === 'sell_unit') {
        finalQtyToImport = qtyBuy / (selectedService.conversion_factor || 1);
    }

    try {
      console.log('Executing Import:', { 
        service_id: selectedService.id, 
        qty_buy: finalQtyToImport, 
        total_amount: totalAmount,
        conversion_factor: selectedService.conversion_factor 
      });
      
      const result = await serviceService.importInventory(
        selectedService.id, 
        finalQtyToImport, 
        totalAmount, 
        note, 
        user?.id
      );

      if (result) {
        setIsImportModalOpen(false);
        fetchServices();
        toast.success('Đã nhập kho thành công');
      } else {
        throw new Error('RPC returned null');
      }
    } catch (error) {
      console.error('Error importing inventory:', error);
      toast.error('Lỗi khi nhập kho. Vui lòng kiểm tra lại số lượng hoặc quyền hạn.');
    }
  };

  const handleImport = async (data: { quantity: number; cost: number; notes: string; mode: 'buy_unit' | 'sell_unit' }) => {
    if (!selectedService || data.quantity <= 0) return;

    if (securitySettings['inventory_import']) {
        setPendingAction(() => () => executeImport(data));
        setPinActionName('Xác nhận nhập kho');
        setIsPinModalOpen(true);
    } else {
        await executeImport(data);
    }
  };

  const executeBulkImport = async () => {
    const itemsToImport = bulkItems.filter(i => i.qty > 0);
    if (itemsToImport.length === 0) {
        toast.error('Chưa nhập số lượng cho món nào cả!');
        return;
    }

    const isConfirmed = await confirmDialog({
      title: 'Nhập kho hàng loạt',
      message: `Xác nhận nhập kho cho ${itemsToImport.length} món?`,
      confirmLabel: 'Nhập ngay',
      cancelLabel: 'Hủy',
    });

    if (!isConfirmed) return;

    const note = "Nhập hàng loạt";
    const promises = itemsToImport.map(async (item) => {
        const service = services.find(s => s.id === item.id);
        if (!service) return;

        let finalQtyToImport = Number(item.qty);
        if (item.mode === 'sell_unit') {
            finalQtyToImport = Number(item.qty) / (service.conversion_factor || 1);
        }

        return serviceService.importInventory(service.id, finalQtyToImport, 0, note, user?.id);
    });

    try {
      await Promise.all(promises);
      setIsBulkImportOpen(false);
      setBulkItems([]);
      fetchServices();
      toast.success('Đã nhập kho thành công!');
    } catch (error) {
      console.error('Error bulk importing:', error);
      toast.error('Lỗi khi nhập kho hàng loạt. Vui lòng kiểm tra lại quyền hạn.');
    }
  };

  const handleBulkImport = async () => {
      const itemsToImport = bulkItems.filter(i => i.qty > 0);
      if (itemsToImport.length === 0) {
          toast.error('Chưa nhập số lượng cho món nào cả!');
          return;
      }

      if (securitySettings['inventory_import']) {
          setPendingAction(() => executeBulkImport);
          setPinActionName('Xác nhận nhập kho hàng loạt');
          setIsPinModalOpen(true);
      } else {
          await executeBulkImport();
      }
  };

  const handleAdjust = async () => {
    if (!selectedService) return;
    try {
      await serviceService.adjustInventory(selectedService.id, inventoryForm.quantity, inventoryForm.notes);
      setIsAdjustModalOpen(false);
      setInventoryForm({ quantity: 0, cost: 0, notes: '' });
      fetchServices();
      toast.success('Đã kiểm kho thành công');
    } catch (error) {
      console.error('Error adjusting inventory:', error);
      toast.error('Lỗi khi điều chỉnh kho');
    }
  };

  const handleViewHistory = async (service: Service) => {
    setSelectedService(service);
    setLogs([]);
    setIsHistoryModalOpen(true);
    try {
      const data = await serviceService.getInventoryLogs(service.id);
      setLogs(data);
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast.error('Không thể tải lịch sử kho');
    }
  };

  const openBulkImport = () => {
    setBulkItems(
      services
        .filter(s => s.track_inventory && s.is_active)
        .map(s => ({ id: s.id, qty: 0, mode: 'buy_unit' as const }))
    );
    setIsBulkImportOpen(true);
  };

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
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
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 leading-none">Dịch vụ & Kho</h1>
              <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Quản lý Menu & Tồn kho</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={openBulkImport}
              className="hidden md:flex h-10 md:h-12 px-5 md:px-8 bg-white border border-slate-200 text-slate-600 rounded-full text-[13px] font-bold hover:bg-slate-50 transition-all items-center gap-2 shadow-sm"
            >
              <Truck size={18} />
              <span>Nhập nhanh</span>
            </button>
            <button 
              onClick={() => {
                setEditingService({ 
                  name: '', 
                  price: 0, 
                  unit_sell: 'lon', 
                  track_inventory: false,
                  min_stock_level: 5,
                  unit_buy: 'thùng',
                  conversion_factor: 24,
                  cost_price: 0
                });
                setIsEditModalOpen(true);
              }}
              className="h-10 md:h-12 px-5 md:px-8 bg-slate-900 text-white rounded-full text-[13px] font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
            >
              <Plus size={18} />
              <span>Thêm món</span>
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-[1200px] mx-auto px-4 md:px-10 py-8 md:py-12 space-y-10 md:space-y-16">
        
        {/* 2. HEADER & SEARCH */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-1.5 px-2">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Danh mục dịch vụ</h2>
            <p className="text-slate-400 font-bold text-sm md:text-base">Thiết lập menu bán hàng và quy tắc quản lý tồn kho</p>
          </div>

          <div className="relative group w-full md:w-96">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Tìm món nhanh..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-14 md:h-16 pl-14 pr-6 bg-white/80 backdrop-blur-md rounded-full border border-slate-200/60 shadow-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all font-bold text-slate-800 placeholder:text-slate-300"
            />
          </div>
        </div>

        {/* 3. SERVICE LIST */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* PC Table View */}
          <div className="hidden md:block bg-white/80 backdrop-blur-xl rounded-[40px] border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Món / Dịch vụ</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Đơn giá</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">Đơn vị</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Tồn kho</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredServices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-32 text-center">
                        <Package size={48} className="mx-auto text-slate-100 mb-4" />
                        <p className="text-slate-300 font-black uppercase tracking-widest">Không tìm thấy món nào</p>
                      </td>
                    </tr>
                  ) : (
                    filteredServices.map((service) => (
                      <tr 
                        key={service.id} 
                        className={cn(
                          "group hover:bg-slate-50/50 transition-all duration-300 cursor-pointer",
                          !service.is_active && "opacity-40 grayscale"
                        )}
                        onClick={() => {
                          setSelectedService(service);
                          setIsControlModalOpen(true);
                        }}
                      >
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-5">
                            <div className={cn(
                              "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500",
                              service.is_active ? "bg-blue-50 text-blue-500" : "bg-slate-100 text-slate-400"
                            )}>
                              <Coffee size={28} />
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-lg font-black text-slate-900 tracking-tight leading-none">{service.name}</h4>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dịch vụ lẻ</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <div className="text-xl font-black text-slate-900 tracking-tighter">{formatMoney(service.price)}</div>
                          {service.track_inventory && (
                             <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">Vốn: {formatMoney(service.cost_price || 0)}</div>
                          )}
                        </td>
                        <td className="px-10 py-6 text-center">
                          <span className="px-4 py-1.5 bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-full">
                            {service.unit_sell}
                          </span>
                        </td>
                        <td className="px-10 py-6 text-right">
                          {service.track_inventory ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className={cn(
                                "text-xl font-black tracking-tighter",
                                (service.stock_quantity || 0) <= (service.min_stock_level || 5) ? "text-rose-500" : "text-emerald-500"
                              )}>
                                {service.stock_quantity}
                              </div>
                              {(service.stock_quantity || 0) <= (service.min_stock_level || 5) && (
                                <div className="flex items-center gap-1 text-[9px] font-black text-rose-400 uppercase tracking-widest">
                                  <AlertCircle size={10} /> Sắp hết
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-200 text-xs font-bold uppercase tracking-widest">Không theo dõi</span>
                          )}
                        </td>
                        <td className="px-10 py-6 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                            <button className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 hover:bg-slate-900 hover:text-white transition-all flex items-center justify-center">
                              <Settings2 size={16} />
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

          {/* Mobile Card View */}
          <div className="md:hidden grid grid-cols-1 gap-4 px-2">
            {filteredServices.length === 0 ? (
              <div className="py-32 text-center bg-white rounded-[40px] border border-dashed border-slate-200">
                <Package size={48} className="mx-auto text-slate-100 mb-4" />
                <p className="text-slate-300 font-black uppercase tracking-widest">Không tìm thấy món nào</p>
              </div>
            ) : (
              filteredServices.map((service) => (
                <div 
                  key={service.id}
                  onClick={() => {
                    setSelectedService(service);
                    setIsControlModalOpen(true);
                  }}
                  className={cn(
                    "bg-white/80 backdrop-blur-xl rounded-[32px] p-6 border border-white shadow-sm flex items-center justify-between active:scale-[0.98] transition-all",
                    !service.is_active && "opacity-40 grayscale"
                  )}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm",
                      service.is_active ? "bg-blue-50 text-blue-500" : "bg-slate-100 text-slate-400"
                    )}>
                      <Coffee size={24} />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-base font-black text-slate-900 tracking-tight leading-none">{service.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{formatMoney(service.price)} / {service.unit_sell}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    {service.track_inventory ? (
                      <div className="flex flex-col items-end">
                        <span className={cn(
                          "text-lg font-black tracking-tighter",
                          (service.stock_quantity || 0) <= (service.min_stock_level || 5) ? "text-rose-500" : "text-emerald-500"
                        )}>
                          {service.stock_quantity}
                        </span>
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Tồn kho</span>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-200">
                        <ArrowRight size={14} />
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* 4. MODALS (CONTROL, EDIT, IMPORT, ADJUST, HISTORY, BULK) */}
      
      {/* Control Modal */}
      {isControlModalOpen && selectedService && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] md:rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-white animate-in slide-in-from-bottom duration-500">
            <div className="p-8 md:p-10 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-[24px] flex items-center justify-center shadow-sm">
                  <Coffee size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{selectedService.name}</h3>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{formatMoney(selectedService.price)} / {selectedService.unit_sell}</p>
                </div>
              </div>
              <button onClick={() => setIsControlModalOpen(false)} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full text-slate-400 border border-slate-100 shadow-sm transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 md:p-10 space-y-4">
              {selectedService.track_inventory && (
                <div className="grid grid-cols-1 gap-3 mb-6">
                  <button 
                    onClick={() => { setIsImportModalOpen(true); setIsControlModalOpen(false); }}
                    className="flex items-center gap-5 p-6 rounded-[32px] bg-emerald-50/50 border border-emerald-100/50 hover:bg-emerald-50 hover:shadow-sm transition-all group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                      <Plus size={24} />
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-black text-emerald-900 tracking-tight leading-none">Nhập kho</p>
                      <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest mt-1">Cập nhật tồn kho mới</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setInventoryForm({ quantity: selectedService.stock_quantity || 0, cost: 0, notes: '' }); setIsAdjustModalOpen(true); setIsControlModalOpen(false); }}
                    className="flex items-center gap-5 p-6 rounded-[32px] bg-amber-50/50 border border-amber-100/50 hover:bg-amber-50 hover:shadow-sm transition-all group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                      <RefreshCw size={24} />
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-black text-amber-900 tracking-tight leading-none">Kiểm kho</p>
                      <p className="text-[11px] font-bold text-amber-400 uppercase tracking-widest mt-1">Điều chỉnh số lượng thực tế</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => { handleViewHistory(selectedService); setIsControlModalOpen(false); }}
                    className="flex items-center gap-5 p-6 rounded-[32px] bg-blue-50/50 border border-blue-100/50 hover:bg-blue-50 hover:shadow-sm transition-all group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                      <History size={24} />
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-black text-blue-900 tracking-tight leading-none">Lịch sử</p>
                      <p className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mt-1">Biến động xuất nhập kho</p>
                    </div>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => { setEditingService(selectedService); setIsEditModalOpen(true); setIsControlModalOpen(false); }}
                  className="flex flex-col items-center justify-center gap-3 p-8 rounded-[32px] bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-sm transition-all group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all">
                    <Edit3 size={20} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Chỉnh sửa</span>
                </button>
                
                <button 
                  onClick={() => { handleToggleStatus(selectedService); setIsControlModalOpen(false); }}
                  className="flex flex-col items-center justify-center gap-3 p-8 rounded-[32px] bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-sm transition-all group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all">
                    {selectedService.is_active ? <Archive size={20} /> : <CheckCircle2 size={20} />}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {selectedService.is_active ? 'Ẩn món' : 'Hiện món'}
                  </span>
                </button>
              </div>

              <button 
                onClick={() => { handleDelete(selectedService.id); setIsControlModalOpen(false); }}
                className="w-full py-5 text-[11px] font-black uppercase tracking-[0.2em] text-rose-400 hover:text-rose-600 transition-colors"
              >
                Xóa dịch vụ vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && editingService && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] md:rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border border-white animate-in slide-in-from-bottom duration-500 max-h-[90vh] overflow-y-auto">
            <div className="p-8 md:p-10 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div className="space-y-1">
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                  {editingService.id ? 'Cập nhật món' : 'Thêm món mới'}
                </h3>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Thông tin dịch vụ & Quy cách kho</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full text-slate-400 border border-slate-100 shadow-sm transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 md:p-10 space-y-10">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="md:col-span-2 space-y-3">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Tên món / Dịch vụ *</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={editingService.name}
                    onChange={(e) => setEditingService({...editingService, name: e.target.value})}
                    className="w-full h-18 md:h-20 px-8 rounded-[28px] bg-slate-50 border border-transparent font-black text-xl md:text-2xl text-slate-900 outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all"
                    placeholder="VD: Nước suối, Mì tôm..."
                  />
                </div>
                
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Giá bán (VNĐ) *</label>
                  <input 
                    type="number" 
                    value={editingService.price}
                    onChange={(e) => setEditingService({...editingService, price: Number(e.target.value)})}
                    className="w-full h-16 md:h-18 px-8 rounded-[24px] bg-slate-50 border border-transparent font-black text-2xl text-slate-900 outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all"
                  />
                </div>
                
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Đơn vị bán *</label>
                  <input 
                    type="text" 
                    value={editingService.unit_sell}
                    onChange={(e) => setEditingService({...editingService, unit_sell: e.target.value})}
                    className="w-full h-16 md:h-18 px-8 rounded-[24px] bg-slate-50 border border-transparent font-black text-xl text-slate-900 outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all"
                    placeholder="lon, chai, cái..."
                  />
                </div>
              </div>

              {/* Inventory Config */}
              <div className="space-y-6 pt-6 border-t border-slate-50">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center">
                      <Package size={24} />
                    </div>
                    <div>
                      <p className="text-lg font-black text-slate-900 tracking-tight leading-none">Quản lý tồn kho</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Theo dõi số lượng xuất nhập</p>
                    </div>
                  </div>
                  <Switch 
                    checked={editingService.track_inventory}
                    onChange={(checked: boolean) => setEditingService({...editingService, track_inventory: checked})}
                  />
                </div>

                {editingService.track_inventory && (
                  <div className="bg-slate-50/50 rounded-[40px] p-8 border border-slate-100 space-y-8 animate-in slide-in-from-top-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Cảnh báo tồn dưới</label>
                        <input 
                          type="number" 
                          value={editingService.min_stock_level}
                          onChange={(e) => setEditingService({...editingService, min_stock_level: Number(e.target.value)})}
                          className="w-full h-14 px-6 rounded-2xl bg-white border border-slate-200 font-black text-lg outline-none focus:border-blue-500 transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Giá vốn mặc định (VNĐ)</label>
                        <input 
                          type="number" 
                          value={editingService.cost_price}
                          onChange={(e) => setEditingService({...editingService, cost_price: Number(e.target.value)})}
                          className="w-full h-14 px-6 rounded-2xl bg-white border border-slate-200 font-black text-lg outline-none focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Quy cách nhập hàng</label>
                      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-6 rounded-[32px] border border-slate-100">
                        <div className="flex-1 flex items-center gap-3">
                          <span className="text-xs font-black text-slate-300">1</span>
                          <input 
                            type="text" 
                            value={editingService.unit_buy}
                            onChange={(e) => setEditingService({...editingService, unit_buy: e.target.value})}
                            className="w-full h-12 px-4 rounded-xl bg-slate-50 border-none font-black text-center text-slate-900"
                            placeholder="Thùng"
                          />
                        </div>
                        <ArrowRight className="text-slate-200" size={20} />
                        <div className="flex-1 flex items-center gap-3">
                          <input 
                            type="number" 
                            value={editingService.conversion_factor}
                            onChange={(e) => setEditingService({...editingService, conversion_factor: Number(e.target.value)})}
                            className="w-20 h-12 px-2 rounded-xl bg-slate-50 border-none font-black text-center text-slate-900"
                          />
                          <span className="text-xs font-black text-slate-600 uppercase tracking-widest">{editingService.unit_sell || 'đơn vị'}</span>
                        </div>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 text-center italic">
                        Mẹo: 1 <span className="text-slate-900">{editingService.unit_buy || 'Thùng'}</span> = <span className="text-slate-900">{editingService.conversion_factor}</span> {editingService.unit_sell || 'Lon'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-6">
                <button 
                  onClick={handleSave}
                  className="w-full h-18 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[13px] shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <Save size={18} /> Lưu dịch vụ ngay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIN Validation Modal */}
      <PinValidationModal
        isOpen={isPinModalOpen}
        onClose={() => {
          setIsPinModalOpen(false);
          setPendingAction(null);
        }}
        onSuccess={async () => {
          if (pendingAction) await pendingAction();
          setIsPinModalOpen(false);
          setPendingAction(null);
        }}
        actionName={pinActionName}
      />

      {/* 1. Inventory Import Modal */}
      <InventoryImportModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        service={selectedService}
        onConfirm={handleImport}
      />

      {/* 2. Adjust Inventory Modal */}
      {isAdjustModalOpen && selectedService && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <RefreshCw className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-amber-950">Kiểm kho</h3>
                  <p className="text-sm font-bold text-amber-600/80 uppercase tracking-wider">{selectedService.name}</p>
                </div>
              </div>
              <button onClick={() => setIsAdjustModalOpen(false)} className="w-12 h-12 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">Số lượng thực tế ({selectedService.unit_sell})</label>
                <input 
                  type="number" 
                  value={inventoryForm.quantity}
                  onChange={(e) => setInventoryForm({...inventoryForm, quantity: Number(e.target.value)})}
                  className="w-full px-6 py-5 rounded-[24px] bg-slate-50 border-2 border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-100 outline-none font-black text-3xl text-amber-600 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">Lý do điều chỉnh</label>
                <input 
                  type="text" 
                  value={inventoryForm.notes}
                  onChange={(e) => setInventoryForm({...inventoryForm, notes: e.target.value})}
                  className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-100 outline-none font-bold text-slate-600"
                  placeholder="VD: Hao hụt, Kiểm kê định kỳ..."
                />
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex gap-4">
              <button onClick={() => setIsAdjustModalOpen(false)} className="flex-1 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-200">HỦY</button>
              <button onClick={handleAdjust} className="flex-[2] py-4 rounded-2xl font-black text-white bg-amber-500 hover:bg-amber-600 shadow-xl shadow-amber-200 transition-all">XÁC NHẬN</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Inventory History Modal */}
      {isHistoryModalOpen && selectedService && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <History className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-blue-950">Lịch sử kho</h3>
                  <p className="text-sm font-bold text-blue-600/80 uppercase tracking-wider">{selectedService.name}</p>
                </div>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="w-12 h-12 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
              {logs.length === 0 ? (
                <div className="py-20 text-center text-slate-300 font-black uppercase tracking-widest">Chưa có lịch sử biến động</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="bg-slate-50 rounded-3xl p-6 flex items-center justify-between border border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs",
                        log.type === 'IMPORT' ? "bg-emerald-100 text-emerald-600" : 
                        log.type === 'ADJUST' ? "bg-amber-100 text-amber-600" : "bg-rose-100 text-rose-600"
                      )}>
                        {log.type === 'IMPORT' ? 'NHẬP' : log.type === 'ADJUST' ? 'KIỂM' : 'XUẤT'}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{log.notes || 'Biến động kho'}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(log.created_at), 'HH:mm - dd/MM/yyyy')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-lg font-black", log.quantity > 0 ? "text-emerald-600" : "text-rose-600")}>
                        {log.quantity > 0 ? '+' : ''}{log.quantity} {selectedService.unit_sell}
                      </p>
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Tồn: {log.balance_after}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Bulk Import Modal */}
      {isBulkImportOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[40px] w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-slate-200">
                  <Truck className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900">Nhập kho nhanh</h3>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Cập nhật tồn kho hàng loạt cho Menu</p>
                </div>
              </div>
              <button onClick={() => setIsBulkImportOpen(false)} className="w-12 h-12 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/30">
              {bulkItems.map((item, idx) => {
                const service = services.find(s => s.id === item.id);
                if (!service) return null;
                return (
                  <div key={item.id} className="bg-white p-5 rounded-3xl border border-slate-100 flex items-center justify-between gap-6 shadow-sm">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center shadow-sm">
                        <Coffee size={24} />
                      </div>
                      <div>
                        <p className="font-black text-slate-900">{service.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tồn: {service.stock_quantity} {service.unit_sell}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button 
                          onClick={() => {
                            const newItems = [...bulkItems];
                            newItems[idx].mode = 'buy_unit';
                            setBulkItems(newItems);
                          }}
                          className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all", item.mode === 'buy_unit' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400")}
                        >
                          {service.unit_buy}
                        </button>
                        <button 
                          onClick={() => {
                            const newItems = [...bulkItems];
                            newItems[idx].mode = 'sell_unit';
                            setBulkItems(newItems);
                          }}
                          className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all", item.mode === 'sell_unit' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400")}
                        >
                          {service.unit_sell}
                        </button>
                      </div>
                      <input 
                        type="number"
                        value={item.qty || ''}
                        onChange={(e) => {
                          const newItems = [...bulkItems];
                          newItems[idx].qty = Number(e.target.value);
                          setBulkItems(newItems);
                        }}
                        placeholder="0"
                        className="w-24 h-12 bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 rounded-xl font-black text-center text-lg outline-none transition-all"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-8 bg-white border-t border-slate-100 flex gap-4">
              <button onClick={() => setIsBulkImportOpen(false)} className="flex-1 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-50 transition-all">HỦY BỎ</button>
              <button onClick={handleBulkImport} className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95">XÁC NHẬN NHẬP KHO</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MOBILE FLOATING ACTION */}
      <div className="fixed bottom-10 left-0 right-0 px-6 md:hidden z-50">
        <button 
          onClick={() => {
            setEditingService({ 
              name: '', 
              price: 0, 
              unit_sell: 'lon', 
              track_inventory: false,
              min_stock_level: 5,
              unit_buy: 'thùng',
              conversion_factor: 24,
              cost_price: 0
            });
            setIsEditModalOpen(true);
          }}
          className="w-full h-18 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-widest text-[13px] shadow-2xl shadow-slate-900/40 flex items-center justify-center gap-3 active:scale-95 transition-all"
        >
          <Plus size={20} /> Thêm món mới
        </button>
      </div>
    </div>
  );
}
