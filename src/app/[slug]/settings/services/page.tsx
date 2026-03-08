'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  ChevronLeft
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

import { useGlobalDialog } from '@/providers/GlobalDialogProvider';

export default function ServicesPage() {
  const router = useRouter();
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
  // Import Mode: 'buy_unit' (Thùng) or 'sell_unit' (Chai)
  const [inventoryForm, setInventoryForm] = useState({ quantity: 0, cost: 0, notes: '' });

  // Bulk Import State
  const [bulkItems, setBulkItems] = useState<{id: string, qty: number, mode: 'buy_unit' | 'sell_unit'}[]>([]);
  const [securitySettings, setSecuritySettings] = useState<Record<string, boolean>>({});

  // Fetch Services
  const fetchServices = async () => {
    await Promise.resolve();
    setIsLoading(true);
    // Check auth status
    const { data: { session } } = await supabase.auth.getSession();
    console.log('Current Session:', session ? 'Active' : 'Missing', session?.user?.id);
    
    const data = await serviceService.getAllServices();
    setServices(data);
    setIsLoading(false);
  };

  const fetchSecuritySettings = async () => {
    const { data } = await supabase.rpc('fn_get_security_settings');
    if (data) setSecuritySettings(data);
  };

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void fetchServices();
      void fetchSecuritySettings();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Handlers
  const handleSave = async () => {
    if (!editingService?.name || !editingService?.price || !editingService?.unit_sell) {
      toast.error('Vui lòng điền tên, giá bán và đơn vị bán!');
      return;
    }

    // Rule: Không được để giá vốn <= 0 khi quản lý tồn kho
    if (editingService.track_inventory && (editingService.cost_price || 0) <= 0) {
        toast.error('Giá vốn phải lớn hơn 0 khi quản lý tồn kho!');
        return;
    }

    const payload = {
        ...editingService,
        unit: editingService.unit_sell // Sync unit for backward compatibility
    };

    if (editingService.id) {
      await serviceService.updateService(editingService.id, payload);
    } else {
      await serviceService.createService({ ...payload, is_active: true });
    }

    setIsEditModalOpen(false);
    setEditingService(null);
    fetchServices();
    toast.success('Đã lưu dịch vụ thành công');
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirmDialog({
      title: 'Xóa dịch vụ',
      message: 'Bạn có chắc chắn muốn xóa dịch vụ này?',
      type: 'confirm'
    });

    if (isConfirmed) {
      await serviceService.deleteService(id);
      fetchServices();
      toast.success('Đã xóa dịch vụ thành công');
    }
  };

  const handleToggleStatus = async (service: Service) => {
    await serviceService.updateService(service.id, { is_active: !service.is_active });
    fetchServices();
    toast.success(`Đã ${!service.is_active ? 'hiện' : 'ẩn'} dịch vụ thành công`);
  };

  const executeImport = async (data: { quantity: number; cost: number; notes: string; mode: 'buy_unit' | 'sell_unit' }) => {
    if (!selectedService || data.quantity <= 0) return;

    const qtyBuy = data.quantity;
    const totalAmount = Math.round(data.cost);
    let note = data.notes;
    const currentMode = data.mode;

    // Calculate actual quantity in sell units
    let finalQtyBuy = qtyBuy;
    if (currentMode === 'buy_unit') {
        finalQtyBuy = qtyBuy * (selectedService.conversion_factor || 1);
        note = `${data.notes} (Nhập theo ${selectedService.unit_buy})`;
    } else {
        note = `${data.notes} (Nhập theo ${selectedService.unit_sell})`;
    }

    // --- LOGIC CẢNH BÁO LỆCH GIÁ ---
    if (totalAmount > 0) {
        const newUnitCost = Math.round(totalAmount / finalQtyBuy);
        const currentCost = Number(selectedService.cost_price) || 0;
        
        // Nếu giá cũ = 0 hoặc lệch > 30%
        const isZeroCost = currentCost === 0;
        const isDeviation = currentCost > 0 && Math.abs(newUnitCost - currentCost) / currentCost > 0.3;

        if (isZeroCost || isDeviation) {
            const message = isZeroCost 
                ? `Cảnh báo: Giá vốn hiện tại đang là 0đ (không hợp lệ). Giá nhập mới là ${formatMoney(newUnitCost)}.\nBạn có muốn CẬP NHẬT lại giá vốn gốc theo giá mới này không?`
                : `Cảnh báo lệch giá: Giá nhập mới (${formatMoney(newUnitCost)}) lệch nhiều so với giá vốn hiện tại (${formatMoney(currentCost)}).\nBạn có muốn CẬP NHẬT lại giá vốn gốc theo giá mới này không?`;

            const shouldUpdateCost = await confirmDialog({
                title: 'Phát hiện lệch giá vốn',
                message: message,
                confirmLabel: 'Cập nhật giá vốn',
                cancelLabel: 'Giữ nguyên',
                destructive: false
            });

            if (shouldUpdateCost) {
                // Cập nhật giá vốn gốc trước khi nhập hàng
                // Việc này sẽ giúp WAC tính toán lại dựa trên giá mới (coi như tồn kho cũ cũng có giá này)
                await serviceService.updateService(selectedService.id, { 
                    cost_price: newUnitCost 
                });
                toast.success('Đã cập nhật giá vốn gốc!');
                
                // Cập nhật lại state local để UI hiển thị đúng nếu cần
                setSelectedService((prev) => (prev ? { ...prev, cost_price: newUnitCost } : prev));
            }
        }
    }
    // --------------------------------

    // Lưu ý: Logic importInventory của RPC sẽ dùng cost_price mới nhất trong DB (vừa update ở trên) làm v_old_cost
    // Nếu update cost thì: v_new_cost = ((old_stock * new_cost) + new_amount) / new_stock = new_cost (xấp xỉ)
    // Như vậy là đúng ý định "Reset Cost"

    // Logic cũ tính finalQtyBuy sai ở đoạn importMode === 'sell_unit' (dòng 175 logic cũ chia cho conversion_factor)
    // Thực tế RPC importInventory nhận vào p_qty_buy. 
    // Nếu logic RPC là: v_qty_sell := p_qty_buy * v_conversion_factor;
    // Thì khi import theo 'sell_unit', ta phải truyền vào: qty / conversion_factor.
    
    // Tuy nhiên, để an toàn và nhất quán với logic cũ (dù logic cũ có vẻ hơi rắc rối), ta sẽ giữ nguyên cách tính finalQtyBuy để pass vào RPC
    // Logic cũ:
    // if (importMode === 'sell_unit') { finalQtyBuy = qtyBuy / (selectedService.conversion_factor || 1); }
    // Nhưng ở trên ta đã tính finalQtyBuy = qtyBuy * conversion (cho buy_unit) hoặc qtyBuy (cho sell_unit) -> ĐÂY LÀ LOGIC CỦA FE ĐỂ TÍNH GIÁ.
    
    // ĐỂ KHỚP VỚI RPC (vốn nhân conversion_factor):
    // Ta cần truyền vào con số sao cho khi nhân conversion_factor nó ra đúng số lượng bán.
    // - Nếu Buy Unit (Thùng): Truyền 1 thùng -> RPC nhân 24 -> 24 chai. OK. (Pass qtyBuy gốc)
    // - Nếu Sell Unit (Chai): Truyền 1 chai -> RPC nhân 24 -> 24 chai ??? SAI.
    //   RPC mong đợi input là "Đơn vị mua" (thường là Thùng).
    //   Nên nếu nhập theo Chai, ta phải chia cho 24.
    
    let quantityToPassToRPC = qtyBuy;
    if (currentMode === 'sell_unit') {
        quantityToPassToRPC = qtyBuy / (selectedService.conversion_factor || 1);
    }

    await serviceService.importInventory(selectedService.id, quantityToPassToRPC, totalAmount, note, user?.id);
    setIsImportModalOpen(false);
    fetchServices();
    toast.success('Đã nhập kho thành công');
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
      type: 'confirm'
    });

    if (!isConfirmed) return;

    // Process sequentially to avoid race conditions or use Promise.all
    // We will do parallel for speed
    const note = "Nhập hàng loạt";
    const promises = itemsToImport.map(async (item) => {
        const service = services.find(s => s.id === item.id);
        if (!service) return;

        let finalQtyBuy = item.qty;
        if (item.mode === 'sell_unit') {
            finalQtyBuy = item.qty / (service.conversion_factor || 1);
        }

        await serviceService.importInventory(service.id, finalQtyBuy, 0, note, user?.id);
    });

    await Promise.all(promises);
    setIsBulkImportOpen(false);
    setBulkItems([]);
    fetchServices();
    toast.success('Đã nhập kho thành công!');
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
    await serviceService.adjustInventory(selectedService.id, inventoryForm.quantity, inventoryForm.notes);
    setIsAdjustModalOpen(false);
    setInventoryForm({ quantity: 0, cost: 0, notes: '' });
    fetchServices();
    toast.success('Đã kiểm kho thành công');
  };

  const handleViewHistory = async (service: Service) => {
    setSelectedService(service);
    setLogs([]); // Reset logs
    setIsHistoryModalOpen(true);
    const data = await serviceService.getInventoryLogs(service.id);
    setLogs(data);
  };

  const openBulkImport = () => {
    setBulkItems(
      services
        .filter(s => s.track_inventory && s.is_active)
        .map(s => ({ id: s.id, qty: 0, mode: 'buy_unit' as const }))
    );
    setIsBulkImportOpen(true);
  };

  // Filter
  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-8 pb-32 font-sans">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 md:mb-12">
        <div className="space-y-2">
            <button 
                onClick={() => router.back()}
                className="group flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-4 font-bold"
            >
                <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:border-slate-300 group-hover:bg-slate-50 transition-all">
                    <ChevronLeft size={16} />
                </div>
                <span className="text-xs font-black uppercase tracking-widest">Quay lại</span>
            </button>
            <div className="flex items-center gap-4 mb-2">
               <div className="w-14 h-14 rounded-2xl bg-slate-200 text-slate-700 flex items-center justify-center shadow-sm">
                 <Package size={28} />
               </div>
               <div>
                  <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                      Quản lý Dịch vụ & Kho
                  </h1>
                  <p className="text-slate-500 font-medium text-base md:text-lg mt-1">
                      Thiết lập menu, giá bán và quản lý tồn kho
                  </p>
               </div>
            </div>
        </div>
        <div className="grid grid-cols-2 md:flex gap-3">
            <button 
                onClick={openBulkImport}
                className="px-6 py-4 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm"
            >
                <Truck className="w-5 h-5" />
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
                className="px-6 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold shadow-lg shadow-slate-900/20 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
                <Plus className="w-5 h-5" />
                <span>Thêm món</span>
            </button>
        </div>
      </div>

      {/* Search & List */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
        
        {/* Search Bar */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4">
          <Search className="w-5 h-5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Tìm món..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-lg font-bold text-slate-800 placeholder:text-slate-400"
          />
        </div>

        {/* List Items */}
        <div className="divide-y divide-slate-50">
          {isLoading ? (
             <div className="p-10 text-center text-slate-400">Đang tải...</div>
          ) : filteredServices.length === 0 ? (
             <div className="p-10 text-center text-slate-400">Chưa có dịch vụ nào.</div>
          ) : (
             <div className="grid grid-cols-1 md:block">
               {filteredServices.map(service => (
                 <div 
                    key={service.id} 
                    onClick={() => {
                        setSelectedService(service);
                        setIsControlModalOpen(true);
                    }}
                    className={cn(
                        "p-4 md:p-5 hover:bg-slate-50 transition-all border-b border-slate-50 last:border-none relative cursor-pointer active:bg-slate-100",
                        !service.is_active && "opacity-60 grayscale"
                    )}
                 >
                   <div className="flex items-center justify-between gap-3 md:gap-4">
                     {/* Left: Icon & Info */}
                     <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                       <div className={cn(
                           "w-12 h-12 md:w-14 md:h-14 rounded-[18px] md:rounded-[20px] flex items-center justify-center transition-all shadow-sm shrink-0",
                           service.is_active ? "bg-white text-orange-500 border border-orange-100" : "bg-slate-100 text-slate-400"
                       )}>
                           <Coffee className="w-6 h-6 md:w-7 md:h-7" />
                       </div>
                       
                       <div className="flex-1 min-w-0">
                         <div className="font-bold text-slate-900 text-[16px] md:text-[17px] leading-tight truncate">
                           {service.name}
                         </div>
                         <div className="flex items-center gap-2 mt-1">
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded-md">
                              {service.unit_sell}
                           </span>
                         </div>
                       </div>
                     </div>

                    {/* Right: Price & Stock */}
                    <div className="flex flex-col items-end gap-1 min-w-fit">
                       <div className="font-black text-slate-900 text-[16px] md:text-lg">
                         {formatMoney(service.price)}
                       </div>
                       
                       {service.track_inventory && (
                         <span className={cn(
                           "text-[11px] font-bold px-2 py-0.5 rounded-full",
                           (service.stock_quantity || 0) <= (service.min_stock_level || 5) 
                            ? "bg-red-50 text-red-500" 
                            : "bg-emerald-50 text-emerald-600"
                         )}>
                           Tồn {service.stock_quantity}
                         </span>
                       )}
                    </div>
                   </div>
                 </div>
               ))}
              </div>
           )}
        </div>
      </div>

      {/* Control Modal */}
      {isControlModalOpen && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-in fade-in">
            <div className="bg-white rounded-[40px] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-2xl font-black text-slate-800 tracking-tight">{selectedService.name}</h3>
                        <p className="text-base font-bold text-slate-500 mt-1">{formatMoney(selectedService.price)} / {selectedService.unit_sell}</p>
                    </div>
                    <button 
                        onClick={() => setIsControlModalOpen(false)} 
                        className="w-12 h-12 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-slate-400" />
                    </button>
                </div>
                
                <div className="p-6 space-y-3">
                    {selectedService.track_inventory && (
                        <>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center justify-center gap-1">
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Tồn kho</span>
                                    <span className={cn(
                                        "text-2xl font-black",
                                        (selectedService.stock_quantity || 0) <= (selectedService.min_stock_level || 5) ? "text-red-500" : "text-emerald-600"
                                    )}>
                                        {selectedService.stock_quantity}
                                    </span>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center justify-center gap-1">
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Trạng thái</span>
                                    <span className={cn(
                                        "text-sm font-black uppercase",
                                        selectedService.is_active ? "text-blue-600" : "text-slate-400"
                                    )}>
                                        {selectedService.is_active ? 'Đang bán' : 'Đã ẩn'}
                                    </span>
                                </div>
                            </div>
                            
                            <button 
                                onClick={() => {
                                    setIsImportModalOpen(true);
                                    setIsControlModalOpen(false);
                                }}
                                className="w-full flex items-center gap-4 px-6 py-5 bg-emerald-50 text-emerald-700 rounded-3xl font-bold hover:bg-emerald-100 transition-all active:scale-95 group"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Plus className="w-6 h-6 text-emerald-600" />
                                </div>
                                <div className="text-left">
                                    <div className="text-base font-black">Nhập hàng</div>
                                    <div className="text-xs opacity-70 font-bold">Thêm tồn kho mới</div>
                                </div>
                            </button>

                            <button 
                                onClick={() => {
                                    setInventoryForm({ quantity: selectedService.stock_quantity || 0, cost: 0, notes: '' });
                                    setIsAdjustModalOpen(true);
                                    setIsControlModalOpen(false);
                                }}
                                className="w-full flex items-center gap-4 px-6 py-5 bg-amber-50 text-amber-700 rounded-3xl font-bold hover:bg-amber-100 transition-all active:scale-95 group"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <RefreshCw className="w-6 h-6 text-amber-600" />
                                </div>
                                <div className="text-left">
                                    <div className="text-base font-black">Kiểm kho</div>
                                    <div className="text-xs opacity-70 font-bold">Điều chỉnh số lượng thực tế</div>
                                </div>
                            </button>

                            <button 
                                onClick={() => {
                                    handleViewHistory(selectedService);
                                    setIsControlModalOpen(false);
                                }}
                                className="w-full flex items-center gap-4 px-6 py-5 bg-blue-50 text-blue-700 rounded-3xl font-bold hover:bg-blue-100 transition-all active:scale-95 group"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <History className="w-6 h-6 text-blue-600" />
                                </div>
                                <div className="text-left">
                                    <div className="text-base font-black">Lịch sử kho</div>
                                    <div className="text-xs opacity-70 font-bold">Xem biến động xuất nhập</div>
                                </div>
                            </button>
                            
                            <div className="h-px bg-slate-100 my-4" />
                        </>
                    )}

                    <button 
                        onClick={() => {
                            setEditingService(selectedService);
                            setIsEditModalOpen(true);
                            setIsControlModalOpen(false);
                        }}
                        className="w-full flex items-center gap-4 px-6 py-5 bg-slate-50 text-slate-700 rounded-3xl font-bold hover:bg-slate-100 transition-all active:scale-95 group"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Edit3 className="w-6 h-6 text-slate-600" />
                        </div>
                        <div className="text-left">
                            <div className="text-base font-black">Chỉnh sửa thông tin</div>
                            <div className="text-xs opacity-70 font-bold">Tên, giá, đơn vị tính...</div>
                        </div>
                    </button>
                    
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <button 
                            onClick={() => {
                                handleToggleStatus(selectedService);
                                setIsControlModalOpen(false);
                            }}
                            className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-95 text-xs"
                        >
                            {selectedService.is_active ? <Archive className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            {selectedService.is_active ? 'Ẩn món' : 'Hiện món'}
                        </button>
                        <button 
                            onClick={() => {
                                handleDelete(selectedService.id);
                                setIsControlModalOpen(false);
                            }}
                            className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-all active:scale-95 text-xs"
                        >
                            <Trash2 className="w-4 h-4" />
                            Xóa món
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-in fade-in">
            <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                        {editingService.id ? 'Cập nhật món' : 'Thêm món mới'}
                    </h3>
                    <button 
                        onClick={() => setIsEditModalOpen(false)} 
                        className="w-12 h-12 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-slate-400" />
                    </button>
                </div>
                
                <div className="p-8 space-y-8">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="col-span-2 space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Tên dịch vụ</label>
                            <input 
                                autoFocus
                                type="text" 
                                value={editingService.name}
                                onChange={(e) => setEditingService({...editingService, name: e.target.value})}
                                className="w-full px-4 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 outline-none font-bold text-lg text-slate-900 transition-all placeholder:text-slate-300"
                                placeholder="Ví dụ: Nước suối, Mì tôm..."
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Giá bán (VNĐ)</label>
                            <input 
                                type="number" 
                                value={editingService.price}
                                onChange={(e) => setEditingService({...editingService, price: Number(e.target.value)})}
                                className="w-full px-4 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 outline-none font-black text-lg text-slate-900 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Đơn vị bán</label>
                            <input 
                                type="text" 
                                value={editingService.unit_sell}
                                onChange={(e) => setEditingService({...editingService, unit_sell: e.target.value})}
                                className="w-full px-4 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 outline-none font-bold text-lg text-slate-900 transition-all"
                                placeholder="lon, chai, ly..."
                            />
                        </div>
                    </div>

                    {/* Inventory Settings */}
                    <div className="border-t border-slate-100 pt-8">
                        <div className="flex items-center gap-3 mb-6">
                            <input 
                                type="checkbox"
                                id="track_inventory"
                                checked={editingService.track_inventory}
                                onChange={(e) => setEditingService({...editingService, track_inventory: e.target.checked})}
                                className="w-6 h-6 text-blue-600 rounded-lg focus:ring-blue-500 border-slate-300 transition-all"
                            />
                            <label htmlFor="track_inventory" className="font-black text-lg text-slate-900 flex items-center gap-2 cursor-pointer select-none">
                                <Package className="w-5 h-5 text-slate-500" />
                                Quản lý tồn kho
                            </label>
                        </div>

                        {editingService.track_inventory && (
                            <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-wider">Báo hết hàng khi còn dưới</label>
                                        <input 
                                            type="number" 
                                            value={editingService.min_stock_level}
                                            onChange={(e) => setEditingService({...editingService, min_stock_level: Number(e.target.value)})}
                                            className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 outline-none font-bold transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-wider">Giá vốn mặc định (VNĐ)</label>
                                        <input 
                                            type="number" 
                                            value={editingService.cost_price}
                                            onChange={(e) => setEditingService({...editingService, cost_price: Number(e.target.value)})}
                                            className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 outline-none font-bold transition-all"
                                        />
                                    </div>
                                </div>
                                
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-wider block">Quy cách đóng gói (Tùy chọn)</label>
                                    <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                        <div className="flex-1 flex items-center gap-3">
                                            <span className="text-sm font-bold text-slate-400 whitespace-nowrap">1</span>
                                            <input 
                                                type="text" 
                                                value={editingService.unit_buy}
                                                onChange={(e) => setEditingService({...editingService, unit_buy: e.target.value})}
                                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-slate-100 font-bold text-center text-slate-900 placeholder:text-slate-300"
                                                placeholder="Thùng"
                                            />
                                        </div>
                                        <ArrowRight className="w-5 h-5 text-slate-300" />
                                        <div className="flex-1 flex items-center gap-3">
                                            <input 
                                                type="number" 
                                                value={editingService.conversion_factor}
                                                onChange={(e) => setEditingService({...editingService, conversion_factor: Number(e.target.value)})}
                                                className="w-20 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-slate-100 font-bold text-center text-slate-900"
                                            />
                                            <span className="font-bold text-slate-700">{editingService.unit_sell || 'đơn vị'}</span>
                                        </div>
                                    </div>
                                    <p className="text-xs font-medium text-slate-400 text-center">
                                        Ví dụ: 1 <span className="font-bold text-slate-600">Thùng</span> có <span className="font-bold text-slate-600">24</span> {editingService.unit_sell || 'Lon'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4">
                    <button 
                        onClick={() => setIsEditModalOpen(false)}
                        className="flex-1 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        Hủy
                    </button>
                    <button 
                        onClick={handleSave}
                        className="flex-1 py-4 rounded-2xl font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-900/20 transition-colors"
                    >
                        Lưu thay đổi
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Import Modal */}
      <InventoryImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        service={selectedService}
        onConfirm={handleImport}
      />

      {/* Adjust Modal */}
      {isAdjustModalOpen && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
                            <RefreshCw className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900">Kiểm kê kho</h3>
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">{selectedService.name}</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsAdjustModalOpen(false)} 
                        className="w-12 h-12 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-slate-400" />
                    </button>
                </div>

                <div className="p-8 space-y-8">
                    <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tồn kho hệ thống</div>
                        <div className="text-3xl font-black text-slate-900">
                            {selectedService.stock_quantity} <span className="text-sm opacity-60 uppercase">{selectedService.unit_sell}</span>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Số lượng thực tế tại kho</label>
                            <div className="relative">
                                <input 
                                    autoFocus
                                    type="number" 
                                    value={inventoryForm.quantity}
                                    onChange={(e) => setInventoryForm({...inventoryForm, quantity: Number(e.target.value)})}
                                    className="w-full px-6 py-5 rounded-[24px] bg-slate-50 border border-slate-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 outline-none font-black text-4xl text-slate-900 transition-all"
                                />
                                <div className="absolute right-6 top-1/2 -translate-y-1/2">
                                    <span className="text-sm font-black text-slate-400 uppercase">{selectedService.unit_sell}</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center px-2">
                                <span className="text-xs font-bold text-slate-400 italic">Chênh lệch:</span>
                                <span className={cn(
                                    "text-sm font-black",
                                    (inventoryForm.quantity - (selectedService.stock_quantity || 0)) >= 0 ? "text-emerald-600" : "text-red-600"
                                )}>
                                    {(inventoryForm.quantity - (selectedService.stock_quantity || 0)) > 0 ? '+' : ''}
                                    {inventoryForm.quantity - (selectedService.stock_quantity || 0)} {selectedService.unit_sell}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Lý do điều chỉnh</label>
                            <input 
                                type="text" 
                                value={inventoryForm.notes}
                                onChange={(e) => setInventoryForm({...inventoryForm, notes: e.target.value})}
                                className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 outline-none font-bold text-slate-600 transition-all"
                                placeholder="Hư hỏng, thất thoát, bù kho..."
                            />
                        </div>
                    </div>
                </div>

                <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button 
                        onClick={() => setIsAdjustModalOpen(false)}
                        className="flex-1 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all active:scale-95"
                    >
                        HỦY
                    </button>
                    <button 
                        onClick={handleAdjust}
                        className="flex-[2] py-4 rounded-2xl font-black text-white bg-slate-900 hover:bg-slate-800 shadow-xl shadow-slate-900/20 transition-all active:scale-95"
                    >
                        CẬP NHẬT KHO
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        <History className="w-5 h-5" />
                        Lịch sử kho: {selectedService.name}
                    </h3>
                    <button 
                        onClick={() => setIsHistoryModalOpen(false)} 
                        className="w-12 h-12 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-slate-400" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-0">
                    {logs.length === 0 ? (
                        <div className="p-10 text-center text-slate-400">Chưa có lịch sử giao dịch.</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {/* Desktop Table Header */}
                            <div className="hidden md:grid grid-cols-5 text-xs text-slate-400 uppercase bg-slate-50 sticky top-0 z-10 px-6 py-3 font-bold">
                                <div>Thời gian</div>
                                <div>Loại</div>
                                <div className="text-right">Số lượng</div>
                                <div className="text-right">Tồn sau</div>
                                <div className="pl-6">Ghi chú</div>
                            </div>

                            {logs.map(log => (
                                <div key={log.id} className="p-4 md:px-6 md:py-4 hover:bg-slate-50 transition-colors">
                                    <div className="md:grid md:grid-cols-5 flex flex-wrap items-center justify-between gap-2">
                                        {/* Time - Full width on mobile */}
                                        <div className="text-slate-500 text-xs md:text-sm w-full md:w-auto">
                                            {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}
                                        </div>

                                        {/* Type */}
                                        <div className="md:block">
                                            <span className={cn(
                                                "px-2 py-0.5 md:py-1 rounded text-[10px] md:text-xs font-bold",
                                                log.type === 'IMPORT' ? "bg-emerald-100 text-emerald-600" :
                                                log.type === 'SALE' ? "bg-blue-100 text-blue-600" :
                                                log.type === 'RETURN' ? "bg-purple-100 text-purple-600" :
                                                "bg-amber-100 text-amber-600"
                                            )}>
                                                {log.type === 'IMPORT' ? 'Nhập kho' :
                                                 log.type === 'SALE' ? 'Bán hàng' :
                                                 log.type === 'RETURN' ? 'Hoàn trả' :
                                                 'Điều chỉnh'}
                                            </span>
                                        </div>

                                        {/* Quantity */}
                                        <div className={cn(
                                            "text-right font-bold md:text-sm",
                                            log.quantity > 0 ? "text-emerald-600" : "text-red-600"
                                        )}>
                                            {log.quantity > 0 ? '+' : ''}{log.quantity}
                                        </div>

                                        {/* Balance After */}
                                        <div className="text-right font-medium text-slate-800 md:text-sm">
                                            Tồn: {log.balance_after}
                                        </div>

                                        {/* Notes - Full width on mobile */}
                                        <div className="text-slate-400 text-[11px] md:text-sm md:text-slate-500 w-full md:w-auto md:pl-6 truncate italic md:not-italic">
                                            {log.notes || '-'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                    <button 
                        onClick={() => setIsHistoryModalOpen(false)}
                        className="px-6 py-2 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {isBulkImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <Truck className="w-6 h-6 text-slate-600" />
                            Nhập kho nhanh (Hàng loạt)
                        </h3>
                        <p className="text-sm text-slate-500 mt-1 font-bold">Nhập số lượng cho nhiều món cùng lúc</p>
                    </div>
                    <button 
                        onClick={() => setIsBulkImportOpen(false)} 
                        className="w-12 h-12 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-slate-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-0 bg-slate-50">
                    <div className="divide-y divide-slate-200">
                        {/* Desktop Header */}
                        <div className="hidden md:grid grid-cols-12 text-xs text-slate-500 uppercase bg-slate-100 sticky top-0 z-10 px-6 py-4 font-bold shadow-sm">
                            <div className="col-span-4">Tên dịch vụ</div>
                            <div className="col-span-2 text-center">Tồn hiện tại</div>
                            <div className="col-span-2">Đơn vị nhập</div>
                            <div className="col-span-2">Số lượng nhập</div>
                            <div className="col-span-2">Quy đổi</div>
                        </div>

                        {bulkItems.length === 0 ? (
                            <div className="p-10 text-center text-slate-400 bg-white">Không có dịch vụ nào đang theo dõi tồn kho.</div>
                        ) : (
                            bulkItems.map((item, index) => {
                                const service = services.find(s => s.id === item.id);
                                if (!service) return null;
                                
                                return (
                                    <div key={item.id} className="p-4 md:px-6 md:py-4 bg-white hover:bg-slate-50 transition-colors">
                                        <div className="md:grid md:grid-cols-12 flex flex-col gap-4">
                                            {/* Service Name & Stock */}
                                            <div className="md:col-span-4 flex flex-col">
                                                <div className="font-bold text-slate-900 text-[15px]">{service.name}</div>
                                                <div className="md:hidden flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Tồn:</span>
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-[10px] font-bold",
                                                        (service.stock_quantity || 0) <= (service.min_stock_level || 5) ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                                                    )}>
                                                        {service.stock_quantity} {service.unit_sell}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Stock (Desktop only) */}
                                            <div className="hidden md:col-span-2 md:flex items-center justify-center">
                                                <span className={cn(
                                                    "px-2 py-1 rounded text-xs font-bold",
                                                    (service.stock_quantity || 0) <= (service.min_stock_level || 5) ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                                                )}>
                                                    {service.stock_quantity} {service.unit_sell}
                                                </span>
                                            </div>

                                            {/* Unit Selector & Quantity Input */}
                                            <div className="md:col-span-4 grid grid-cols-2 gap-3 items-center">
                                                <div className="flex flex-col gap-1">
                                                    <label className="md:hidden text-[9px] font-bold text-slate-400 uppercase">Đơn vị</label>
                                                    {service.unit_buy && service.unit_sell && service.unit_buy !== service.unit_sell ? (
                                                        <div className="flex bg-slate-100 rounded-2xl p-1 w-full">
                                                            <button 
                                                                onClick={() => {
                                                                    const newItems = [...bulkItems];
                                                                    newItems[index].mode = 'buy_unit';
                                                                    setBulkItems(newItems);
                                                                }}
                                                                className={cn(
                                                                    "flex-1 px-2 py-2 rounded-xl text-[10px] font-black uppercase transition-all",
                                                                    item.mode === 'buy_unit' ? "bg-white shadow text-slate-900" : "text-slate-400 hover:text-slate-600"
                                                                )}
                                                            >
                                                                {service.unit_buy}
                                                            </button>
                                                            <button 
                                                                onClick={() => {
                                                                    const newItems = [...bulkItems];
                                                                    newItems[index].mode = 'sell_unit';
                                                                    setBulkItems(newItems);
                                                                }}
                                                                className={cn(
                                                                    "flex-1 px-2 py-2 rounded-xl text-[10px] font-black uppercase transition-all",
                                                                    item.mode === 'sell_unit' ? "bg-white shadow text-slate-900" : "text-slate-400 hover:text-slate-600"
                                                                )}
                                                            >
                                                                {service.unit_sell}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="bg-slate-50 px-3 py-3 rounded-2xl text-xs font-black text-slate-500 text-center uppercase tracking-wider">
                                                            {service.unit_sell}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <label className="md:hidden text-[9px] font-bold text-slate-400 uppercase">Số lượng</label>
                                                    <input 
                                                        type="number" 
                                                        min="0"
                                                        value={item.qty || ''}
                                                        onChange={(e) => {
                                                            const newItems = [...bulkItems];
                                                            newItems[index].qty = Number(e.target.value);
                                                            setBulkItems(newItems);
                                                        }}
                                                        className="w-full px-3 py-3 rounded-2xl bg-white border border-slate-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 outline-none font-black text-slate-900 text-center"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>

                                            {/* Conversion Result */}
                                            <div className="md:col-span-2 flex items-center md:justify-end text-xs">
                                                {item.qty > 0 && item.mode === 'buy_unit' && service.conversion_factor && service.conversion_factor > 1 ? (
                                                    <div className="bg-emerald-50 px-2 py-1 rounded-md text-emerald-600 font-bold">
                                                        = {item.qty * service.conversion_factor} {service.unit_sell}
                                                    </div>
                                                ) : (
                                                    <div className="md:hidden h-px w-full" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                    <button 
                        onClick={() => setIsBulkImportOpen(false)}
                        className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        Hủy
                    </button>
                    <button 
                        onClick={handleBulkImport}
                        className="px-6 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-colors flex items-center gap-2"
                    >
                        <Save className="w-5 h-5" />
                        Lưu nhập kho ({bulkItems.filter(i => i.qty > 0).length} món)
                    </button>
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
            if (pendingAction) {
                await pendingAction();
            }
            setPendingAction(null);
        }}
        actionName={pinActionName}
      />
      </div>
    </div>
  );
}
