'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Save, 
  X, 
  Coffee,
  MoreVertical,
  Archive,
  CheckCircle2,
  AlertCircle,
  Package,
  ArrowDownToLine,
  RefreshCw,
  History,
  ArrowRight,
  Calculator,
  Truck
} from 'lucide-react';
import { serviceService, Service, InventoryLog } from '@/services/serviceService';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import PinValidationModal from '@/components/shared/PinValidationModal';

import { useGlobalDialog } from '@/providers/GlobalDialogProvider';

export default function ServicesPage() {
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
  
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [logs, setLogs] = useState<InventoryLog[]>([]);

  // Form states for inventory
  // Import Mode: 'buy_unit' (Thùng) or 'sell_unit' (Chai)
  const [importMode, setImportMode] = useState<'buy_unit' | 'sell_unit'>('buy_unit'); 
  const [inventoryForm, setInventoryForm] = useState({ quantity: 0, cost: 0, notes: '' });

  // Bulk Import State
  const [bulkItems, setBulkItems] = useState<{id: string, qty: number, mode: 'buy_unit' | 'sell_unit'}[]>([]);

  // Fetch Services
  const fetchServices = async () => {
    setIsLoading(true);
    // Check auth status
    const { data: { session } } = await supabase.auth.getSession();
    console.log('Current Session:', session ? 'Active' : 'Missing', session?.user?.id);
    
    const data = await serviceService.getAllServices();
    setServices(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchServices();
  }, []);

  // Handlers
  const handleSave = async () => {
    if (!editingService?.name || !editingService?.price || !editingService?.unit_sell) {
      toast.error('Vui lòng điền tên, giá bán và đơn vị bán!');
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

  const handleImport = async () => {
    if (!selectedService || inventoryForm.quantity <= 0) return;

    // We now use p_qty_buy and p_total_amount directly
    // The RPC will handle conversion if needed
    const qtyBuy = inventoryForm.quantity;
    const totalAmount = inventoryForm.cost;
    let note = inventoryForm.notes;

    if (importMode === 'buy_unit') {
        note = `${inventoryForm.notes} (Nhập theo ${selectedService.unit_buy})`;
    } else {
        note = `${inventoryForm.notes} (Nhập theo ${selectedService.unit_sell})`;
        // If importing by sell unit, but RPC expects qty_buy (which usually means the larger unit),
        // we might need to handle this. But wait, if importMode is 'sell_unit', 
        // we can either pass it as qty_buy = quantity and conversion_factor = 1,
        // OR we just pass it and let the RPC know.
        
        // Actually, let's keep it simple: if importMode is sell_unit, we pass it as is.
        // If importMode is buy_unit, the RPC will multiply by conversion_factor.
        // WAIT: My RPC logic says: v_qty_sell := p_qty_buy * v_conversion_factor;
        // This means p_qty_buy ALWAYS gets multiplied.
        // So if user selects 'sell_unit', we should pass qtyBuy = quantity / conversion_factor? 
        // No, that's confusing.
        
        // Let's modify the RPC to be smarter, OR handle it here.
        // Let's handle it here: always pass the quantity as "sell units" to the RPC, 
        // and tell the RPC that conversion_factor is 1 for this call? 
        // No, the RPC fetches conversion_factor from the DB.
    }

    // RE-DESIGNED LOGIC: 
    // If user imports by 'sell_unit', we pass qtyBuy = quantity / conversion_factor so that 
    // (quantity / conversion_factor) * conversion_factor = quantity.
    // BUT that's prone to rounding.
    
    // BETTER: I will update the RPC to take an optional p_is_sell_unit boolean.
    // Or just calculate here.
    
    let finalQtyBuy = qtyBuy;
    if (importMode === 'sell_unit') {
        finalQtyBuy = qtyBuy / (selectedService.conversion_factor || 1);
    }

    await serviceService.importInventory(selectedService.id, finalQtyBuy, totalAmount, note, user?.id);
    setIsImportModalOpen(false);
    setInventoryForm({ quantity: 0, cost: 0, notes: '' });
    fetchServices();
    toast.success('Đã nhập kho thành công');
  };

  const handleBulkImport = async () => {
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

  // Prepare bulk items when opening modal
  useEffect(() => {
    if (isBulkImportOpen) {
        setBulkItems(services.filter(s => s.track_inventory && s.is_active).map(s => ({
            id: s.id,
            qty: 0,
            mode: 'buy_unit' // Default to buying by Box/Unit Buy
        })));
    }
  }, [isBulkImportOpen, services]);

  // Filter
  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 md:p-16 max-w-6xl mx-auto pb-32 md:pb-16 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 md:mb-12">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-2 text-center md:text-left">Dịch vụ & Kho</h1>
          <p className="text-slate-500 font-medium text-center md:text-left text-sm md:text-base">Quản lý menu và tồn kho thông minh</p>
        </div>
        <div className="grid grid-cols-2 md:flex gap-3">
            <button 
            onClick={() => setIsBulkImportOpen(true)}
            className="px-4 md:px-6 py-3 bg-white border-2 border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-600 rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 text-sm md:text-base"
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
            className="px-4 md:px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm md:text-base"
            >
            <Plus className="w-5 h-5" />
            <span>Thêm món</span>
            </button>
        </div>
      </div>

      {/* Search & List */}
      <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
        
        {/* Search Bar */}
        <div className="p-5 md:p-6 border-b border-slate-100 flex items-center gap-4">
          <Search className="w-5 h-5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Tìm món..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-base md:text-lg outline-none placeholder:text-slate-300 text-slate-700 font-medium"
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
                         {service.price.toLocaleString()}đ
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-black text-slate-800">{selectedService.name}</h3>
                        <p className="text-sm font-bold text-slate-500">{selectedService.price.toLocaleString()}đ / {selectedService.unit_sell}</p>
                    </div>
                    <button onClick={() => setIsControlModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-6 h-6 text-slate-400" />
                    </button>
                </div>
                
                <div className="p-4 space-y-2">
                    {selectedService.track_inventory && (
                        <>
                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col items-center justify-center">
                                    <span className="text-xs font-bold text-slate-400 uppercase">Tồn kho</span>
                                    <span className={cn(
                                        "text-xl font-black",
                                        (selectedService.stock_quantity || 0) <= (selectedService.min_stock_level || 5) ? "text-red-500" : "text-emerald-600"
                                    )}>
                                        {selectedService.stock_quantity}
                                    </span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col items-center justify-center">
                                    <span className="text-xs font-bold text-slate-400 uppercase">Trạng thái</span>
                                    <span className={cn(
                                        "text-sm font-black",
                                        selectedService.is_active ? "text-blue-600" : "text-slate-400"
                                    )}>
                                        {selectedService.is_active ? 'Đang bán' : 'Đã ẩn'}
                                    </span>
                                </div>
                            </div>
                            
                            <button 
                                onClick={() => {
                                    setImportMode('buy_unit');
                                    setInventoryForm({ quantity: 1, cost: 0, notes: '' });
                                    setIsImportModalOpen(true);
                                    setIsControlModalOpen(false);
                                }}
                                className="w-full flex items-center gap-4 px-5 py-4 bg-emerald-50 text-emerald-700 rounded-2xl font-bold hover:bg-emerald-100 transition-all active:scale-95"
                            >
                                <div className="w-10 h-10 rounded-xl bg-emerald-200 flex items-center justify-center">
                                    <Plus className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <div className="text-sm">Nhập hàng</div>
                                    <div className="text-[10px] opacity-70 font-normal">Thêm tồn kho mới</div>
                                </div>
                            </button>

                            <button 
                                onClick={() => {
                                    setInventoryForm({ quantity: selectedService.stock_quantity || 0, cost: 0, notes: '' });
                                    setIsAdjustModalOpen(true);
                                    setIsControlModalOpen(false);
                                }}
                                className="w-full flex items-center gap-4 px-5 py-4 bg-amber-50 text-amber-700 rounded-2xl font-bold hover:bg-amber-100 transition-all active:scale-95"
                            >
                                <div className="w-10 h-10 rounded-xl bg-amber-200 flex items-center justify-center">
                                    <RefreshCw className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <div className="text-sm">Kiểm kho</div>
                                    <div className="text-[10px] opacity-70 font-normal">Điều chỉnh số lượng thực tế</div>
                                </div>
                            </button>

                            <button 
                                onClick={() => {
                                    handleViewHistory(selectedService);
                                    setIsControlModalOpen(false);
                                }}
                                className="w-full flex items-center gap-4 px-5 py-4 bg-blue-50 text-blue-700 rounded-2xl font-bold hover:bg-blue-100 transition-all active:scale-95"
                            >
                                <div className="w-10 h-10 rounded-xl bg-blue-200 flex items-center justify-center">
                                    <History className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <div className="text-sm">Lịch sử kho</div>
                                    <div className="text-[10px] opacity-70 font-normal">Xem biến động xuất nhập</div>
                                </div>
                            </button>
                            
                            <div className="h-px bg-slate-100 my-2" />
                        </>
                    )}

                    <button 
                        onClick={() => {
                            setEditingService(selectedService);
                            setIsEditModalOpen(true);
                            setIsControlModalOpen(false);
                        }}
                        className="w-full flex items-center gap-4 px-5 py-4 bg-slate-50 text-slate-700 rounded-2xl font-bold hover:bg-slate-100 transition-all active:scale-95"
                    >
                        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                            <Edit3 className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <div className="text-sm">Chỉnh sửa thông tin</div>
                            <div className="text-[10px] opacity-70 font-normal">Tên, giá, đơn vị tính...</div>
                        </div>
                    </button>
                    
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button 
                            onClick={() => {
                                handleToggleStatus(selectedService);
                                setIsControlModalOpen(false);
                            }}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all active:scale-95 text-xs"
                        >
                            {selectedService.is_active ? <Archive className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            {selectedService.is_active ? 'Ẩn món' : 'Hiện món'}
                        </button>
                        <button 
                            onClick={() => {
                                handleDelete(selectedService.id);
                                setIsControlModalOpen(false);
                            }}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all active:scale-95 text-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-xl font-black text-slate-800">
                        {editingService.id ? 'Cập nhật món' : 'Thêm món mới'}
                    </h3>
                    <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                
                <div className="p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase">Tên dịch vụ</label>
                            <input 
                                autoFocus
                                type="text" 
                                value={editingService.name}
                                onChange={(e) => setEditingService({...editingService, name: e.target.value})}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-medium transition-all"
                                placeholder="Ví dụ: Nước suối, Mì tôm..."
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase">Giá bán (VNĐ)</label>
                            <input 
                                type="number" 
                                value={editingService.price}
                                onChange={(e) => setEditingService({...editingService, price: Number(e.target.value)})}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-bold text-slate-800 transition-all"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase">Đơn vị bán</label>
                            <input 
                                type="text" 
                                value={editingService.unit_sell}
                                onChange={(e) => setEditingService({...editingService, unit_sell: e.target.value})}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-medium transition-all"
                                placeholder="lon, chai, ly..."
                            />
                        </div>
                    </div>

                    {/* Inventory Settings */}
                    <div className="border-t border-slate-100 pt-6">
                        <div className="flex items-center gap-3 mb-4">
                            <input 
                                type="checkbox"
                                id="track_inventory"
                                checked={editingService.track_inventory}
                                onChange={(e) => setEditingService({...editingService, track_inventory: e.target.checked})}
                                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                            />
                            <label htmlFor="track_inventory" className="font-bold text-slate-800 flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                Quản lý tồn kho
                            </label>
                        </div>

                        {editingService.track_inventory && (
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <div className="grid grid-cols-2 gap-6 mb-6">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 uppercase">Báo hết hàng khi còn dưới</label>
                                        <input 
                                            type="number" 
                                            value={editingService.min_stock_level}
                                            onChange={(e) => setEditingService({...editingService, min_stock_level: Number(e.target.value)})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none font-medium"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 uppercase">Giá vốn mặc định (VNĐ)</label>
                                        <input 
                                            type="number" 
                                            value={editingService.cost_price}
                                            onChange={(e) => setEditingService({...editingService, cost_price: Number(e.target.value)})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none font-medium"
                                        />
                                    </div>
                                </div>
                                
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-400 uppercase block">Quy cách đóng gói</label>
                                    <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
                                        <div className="flex-1 flex items-center gap-2">
                                            <span className="text-sm text-slate-400 whitespace-nowrap">1</span>
                                            <input 
                                                type="text" 
                                                value={editingService.unit_buy}
                                                onChange={(e) => setEditingService({...editingService, unit_buy: e.target.value})}
                                                className="w-full px-3 py-2 rounded-lg bg-slate-50 border-none focus:ring-2 focus:ring-blue-100 font-bold text-center text-blue-600"
                                                placeholder="Thùng"
                                            />
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-slate-300" />
                                        <div className="flex-1 flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                value={editingService.conversion_factor}
                                                onChange={(e) => setEditingService({...editingService, conversion_factor: Number(e.target.value)})}
                                                className="w-20 px-3 py-2 rounded-lg bg-slate-50 border-none focus:ring-2 focus:ring-blue-100 font-bold text-center"
                                            />
                                            <span className="font-bold text-slate-700">{editingService.unit_sell || 'đơn vị'}</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 text-center">
                                        Ví dụ: 1 <span className="font-bold text-slate-600">Thùng</span> có <span className="font-bold text-slate-600">24</span> {editingService.unit_sell || 'Lon'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                    <button 
                        onClick={() => setIsEditModalOpen(false)}
                        className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        Hủy
                    </button>
                    <button 
                        onClick={handleSave}
                        className="flex-1 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-colors"
                    >
                        Lưu dịch vụ
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-emerald-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                            <ArrowDownToLine className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-emerald-900">Nhập kho</h3>
                            <p className="text-sm font-bold text-emerald-600/70 uppercase tracking-wider">{selectedService.name}</p>
                        </div>
                    </div>
                    <button onClick={() => setIsImportModalOpen(false)} className="p-2 hover:bg-emerald-100 rounded-full transition-colors">
                        <X className="w-6 h-6 text-emerald-600" />
                    </button>
                </div>

                <div className="p-8 space-y-8">
                    {/* Unit Selector */}
                    {selectedService.unit_buy && selectedService.unit_sell && selectedService.unit_buy !== selectedService.unit_sell && (
                        <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                            <button
                                onClick={() => setImportMode('buy_unit')}
                                className={cn(
                                    "flex-1 py-3 rounded-xl text-sm font-black transition-all",
                                    importMode === 'buy_unit' ? "bg-white shadow-lg text-emerald-600" : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                Theo {selectedService.unit_buy}
                            </button>
                            <button
                                onClick={() => setImportMode('sell_unit')}
                                className={cn(
                                    "flex-1 py-3 rounded-xl text-sm font-black transition-all",
                                    importMode === 'sell_unit' ? "bg-white shadow-lg text-emerald-600" : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                Theo {selectedService.unit_sell}
                            </button>
                        </div>
                    )}

                    <div className="space-y-6">
                        {/* Quantity */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Số lượng nhập</label>
                            <div className="relative">
                                <input 
                                    autoFocus
                                    type="number" 
                                    value={inventoryForm.quantity || ''}
                                    onChange={(e) => setInventoryForm({...inventoryForm, quantity: Number(e.target.value)})}
                                    className="w-full px-6 py-5 rounded-[24px] border-2 border-slate-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none font-black text-3xl text-emerald-600 transition-all placeholder:text-slate-200"
                                    placeholder="0"
                                />
                                <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-end">
                                    <span className="text-sm font-black text-slate-400 uppercase">{importMode === 'buy_unit' ? selectedService.unit_buy : selectedService.unit_sell}</span>
                                    {importMode === 'buy_unit' && selectedService.conversion_factor && selectedService.conversion_factor > 1 && (
                                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full mt-1">
                                            = {((inventoryForm.quantity || 0) * selectedService.conversion_factor).toLocaleString()} {selectedService.unit_sell}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Total Cost */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tổng tiền thanh toán (VNĐ)</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    value={inventoryForm.cost || ''}
                                    onChange={(e) => setInventoryForm({...inventoryForm, cost: Number(e.target.value)})}
                                    className="w-full px-6 py-5 rounded-[24px] border-2 border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-black text-2xl text-blue-600 transition-all placeholder:text-slate-200"
                                    placeholder="0"
                                />
                                <div className="absolute right-6 top-1/2 -translate-y-1/2">
                                    <span className="text-sm font-black text-slate-400">VNĐ</span>
                                </div>
                            </div>
                            {inventoryForm.quantity > 0 && inventoryForm.cost > 0 && (
                                <div className="flex justify-between items-center px-2">
                                    <span className="text-xs font-bold text-slate-400 italic">Giá vốn dự kiến:</span>
                                    <span className="text-sm font-black text-slate-600">
                                        {(inventoryForm.cost / (importMode === 'buy_unit' ? (inventoryForm.quantity * (selectedService.conversion_factor || 1)) : inventoryForm.quantity)).toLocaleString()}đ / {selectedService.unit_sell}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ghi chú nhập hàng</label>
                            <input 
                                type="text" 
                                value={inventoryForm.notes}
                                onChange={(e) => setInventoryForm({...inventoryForm, notes: e.target.value})}
                                className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-emerald-500 outline-none font-bold text-slate-600 transition-all placeholder:text-slate-300"
                                placeholder="Tên nhà cung cấp, lý do..."
                            />
                        </div>
                    </div>
                </div>

                <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button 
                        onClick={() => setIsImportModalOpen(false)}
                        className="flex-1 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all active:scale-95"
                    >
                        HỦY BỎ
                    </button>
                    <button 
                        onClick={handleImport}
                        disabled={inventoryForm.quantity <= 0}
                        className="flex-[2] py-4 rounded-2xl font-black text-white bg-emerald-500 hover:bg-emerald-600 shadow-xl shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                    >
                        XÁC NHẬN NHẬP
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Adjust Modal */}
      {isAdjustModalOpen && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-amber-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
                            <RefreshCw className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-amber-900">Kiểm kê kho</h3>
                            <p className="text-sm font-bold text-amber-600/70 uppercase tracking-wider">{selectedService.name}</p>
                        </div>
                    </div>
                    <button onClick={() => setIsAdjustModalOpen(false)} className="p-2 hover:bg-amber-100 rounded-full transition-colors">
                        <X className="w-6 h-6 text-amber-600" />
                    </button>
                </div>

                <div className="p-8 space-y-8">
                    <div className="bg-amber-100/50 p-6 rounded-[24px] border border-amber-200/50">
                        <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Tồn kho hệ thống</div>
                        <div className="text-3xl font-black text-amber-900">
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
                                    className="w-full px-6 py-5 rounded-[24px] border-2 border-slate-100 focus:border-amber-500 focus:ring-4 focus:ring-amber-100 outline-none font-black text-4xl text-amber-600 transition-all"
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
                                className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-amber-500 outline-none font-bold text-slate-600 transition-all"
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
                        className="flex-[2] py-4 rounded-2xl font-black text-white bg-amber-500 hover:bg-amber-600 shadow-xl shadow-amber-200 transition-all active:scale-95"
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
            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        <History className="w-5 h-5" />
                        Lịch sử kho: {selectedService.name}
                    </h3>
                    <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
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
            <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-blue-50/50">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <Truck className="w-6 h-6 text-blue-600" />
                            Nhập kho nhanh (Hàng loạt)
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">Nhập số lượng cho nhiều món cùng lúc</p>
                    </div>
                    <button onClick={() => setIsBulkImportOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
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
                                                        <div className="flex bg-slate-100 rounded-lg p-1 w-full">
                                                            <button 
                                                                onClick={() => {
                                                                    const newItems = [...bulkItems];
                                                                    newItems[index].mode = 'buy_unit';
                                                                    setBulkItems(newItems);
                                                                }}
                                                                className={cn(
                                                                    "flex-1 px-2 py-1.5 rounded text-[10px] font-bold transition-all",
                                                                    item.mode === 'buy_unit' ? "bg-white shadow text-blue-600" : "text-slate-400"
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
                                                                    "flex-1 px-2 py-1.5 rounded text-[10px] font-bold transition-all",
                                                                    item.mode === 'sell_unit' ? "bg-white shadow text-blue-600" : "text-slate-400"
                                                                )}
                                                            >
                                                                {service.unit_sell}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="bg-slate-50 px-3 py-2 rounded-lg text-xs font-bold text-slate-500 text-center">
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
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-bold text-slate-800 text-center"
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
  );
}
