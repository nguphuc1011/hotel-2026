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
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';

export default function ServicesPage() {
  const { confirm: confirmDialog } = useGlobalDialog();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
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

    // Calculate final quantity based on mode
    let finalQty = inventoryForm.quantity;
    let finalCost = inventoryForm.cost;
    let note = inventoryForm.notes;

    if (importMode === 'buy_unit' && selectedService.conversion_factor && selectedService.conversion_factor > 1) {
        finalQty = inventoryForm.quantity * selectedService.conversion_factor;
        // Cost per unit (backend stores cost per sell_unit if needed, but usually we just track total value or avg cost)
        // Here we just pass the input cost. The RPC logic might need adjustment if we want strict accounting, 
        // but for now let's assume cost is passed as-is or handled by user.
        // Actually, user enters "Cost for 1 Box". RPC expects cost? RPC logic is simple. 
        // Let's just update quantity. Cost tracking is advanced.
        
        note = `${inventoryForm.notes} (Nhập ${inventoryForm.quantity} ${selectedService.unit_buy})`;
    } else {
        note = `${inventoryForm.notes} (Nhập ${inventoryForm.quantity} ${selectedService.unit_sell})`;
    }

    await serviceService.importInventory(selectedService.id, finalQty, finalCost, note);
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
    const promises = itemsToImport.map(async (item) => {
        const service = services.find(s => s.id === item.id);
        if (!service) return;

        let finalQty = item.qty;
        let note = 'Nhập hàng loạt';

        if (item.mode === 'buy_unit' && service.conversion_factor && service.conversion_factor > 1) {
            finalQty = item.qty * service.conversion_factor;
            note += ` (${item.qty} ${service.unit_buy})`;
        } else {
            note += ` (${item.qty} ${service.unit_sell})`;
        }

        await serviceService.importInventory(service.id, finalQty, 0, note);
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
    <div className="p-8 md:p-16 max-w-6xl mx-auto pb-32 md:pb-16 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Quản lý Dịch vụ</h1>
          <p className="text-slate-500 font-medium">Menu đồ ăn, thức uống và quản lý kho hàng</p>
        </div>
        <div className="flex gap-3">
            <button 
            onClick={() => setIsBulkImportOpen(true)}
            className="px-6 py-3 bg-white border-2 border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-600 rounded-2xl font-bold transition-all active:scale-95 flex items-center gap-2"
            >
            <Truck className="w-5 h-5" />
            <span>Nhập hàng loạt</span>
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
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-2"
            >
            <Plus className="w-5 h-5" />
            <span>Thêm món mới</span>
            </button>
        </div>
      </div>

      {/* Search & List */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
        
        {/* Search Bar */}
        <div className="p-6 border-b border-slate-100 flex items-center gap-4">
          <Search className="w-5 h-5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Tìm kiếm dịch vụ..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-lg outline-none placeholder:text-slate-300 text-slate-700 font-medium"
          />
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 p-4 bg-slate-50/50 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
            <div className="col-span-4 pl-4">Tên dịch vụ</div>
            <div className="col-span-2 text-center">Đơn vị</div>
            <div className="col-span-2 text-right">Giá bán</div>
            <div className="col-span-2 text-center">Kho hàng</div>
            <div className="col-span-2 text-right pr-4">Thao tác</div>
        </div>

        {/* List Items */}
        <div className="divide-y divide-slate-50">
          {isLoading ? (
             <div className="p-10 text-center text-slate-400">Đang tải...</div>
          ) : filteredServices.length === 0 ? (
             <div className="p-10 text-center text-slate-400">Chưa có dịch vụ nào.</div>
          ) : (
             filteredServices.map(service => (
               <div key={service.id} className={cn(
                 "grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-50 transition-colors group",
                 !service.is_active && "opacity-60 bg-slate-50"
               )}>
                 {/* Name */}
                 <div className="col-span-4 pl-4 flex items-center gap-4">
                    <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                        service.is_active ? "bg-orange-50 text-orange-500" : "bg-slate-100 text-slate-400"
                    )}>
                        <Coffee className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="font-bold text-slate-800">{service.name}</div>
                        {!service.is_active && <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase">Đang ẩn</span>}
                    </div>
                 </div>

                 {/* Unit */}
                 <div className="col-span-2 text-center">
                    <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">
                        {service.unit_sell}
                    </span>
                 </div>

                 {/* Price */}
                 <div className="col-span-2 text-right">
                    <span className="font-bold text-slate-800">
                        {service.price.toLocaleString()}
                    </span>
                 </div>

                 {/* Inventory */}
                 <div className="col-span-2 text-center">
                    {service.track_inventory ? (
                        <div className="flex flex-col items-center">
                            <span className={cn(
                                "font-bold px-2 py-0.5 rounded-md text-sm",
                                (service.stock_quantity || 0) <= (service.min_stock_level || 5) 
                                    ? "bg-red-100 text-red-600" 
                                    : "bg-emerald-100 text-emerald-600"
                            )}>
                                {service.stock_quantity}
                            </span>
                            <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => {
                                        setSelectedService(service);
                                        setImportMode('buy_unit'); // Default to buy unit
                                        setInventoryForm({ quantity: 1, cost: service.cost_price || 0, notes: '' });
                                        setIsImportModalOpen(true);
                                    }}
                                    className="p-1 hover:bg-blue-100 text-blue-600 rounded" 
                                    title="Nhập kho"
                                >
                                    <ArrowDownToLine className="w-3 h-3" />
                                </button>
                                <button 
                                    onClick={() => {
                                        setSelectedService(service);
                                        setInventoryForm({ quantity: service.stock_quantity || 0, cost: 0, notes: '' });
                                        setIsAdjustModalOpen(true);
                                    }}
                                    className="p-1 hover:bg-amber-100 text-amber-600 rounded" 
                                    title="Kiểm kho"
                                >
                                    <RefreshCw className="w-3 h-3" />
                                </button>
                                <button 
                                    onClick={() => handleViewHistory(service)}
                                    className="p-1 hover:bg-slate-100 text-slate-600 rounded" 
                                    title="Lịch sử"
                                >
                                    <History className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <span className="text-xs text-slate-400 italic">Không theo dõi</span>
                    )}
                 </div>

                 {/* Actions */}
                 <div className="col-span-2 flex justify-end gap-2 pr-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={() => handleToggleStatus(service)}
                        className={cn(
                            "p-2 rounded-lg transition-colors",
                            service.is_active ? "hover:bg-amber-50 text-amber-500" : "hover:bg-emerald-50 text-emerald-500"
                        )}
                        title={service.is_active ? "Ẩn món" : "Hiện món"}
                    >
                        {service.is_active ? <Archive className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    </button>
                    <button 
                        onClick={() => {
                            setEditingService(service);
                            setIsEditModalOpen(true);
                        }}
                        className="p-2 hover:bg-blue-50 text-blue-500 rounded-lg transition-colors"
                    >
                        <Edit3 className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => handleDelete(service.id)}
                        className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                 </div>
               </div>
             ))
          )}
        </div>
      </div>

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
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50/50">
                    <h3 className="text-xl font-black text-emerald-800 flex items-center gap-2">
                        <ArrowDownToLine className="w-6 h-6" />
                        Nhập kho: {selectedService.name}
                    </h3>
                    <button onClick={() => setIsImportModalOpen(false)} className="p-2 hover:bg-emerald-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-emerald-600" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Unit Selector */}
                    {selectedService.unit_buy && selectedService.unit_sell && selectedService.unit_buy !== selectedService.unit_sell && (
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button
                                onClick={() => setImportMode('buy_unit')}
                                className={cn(
                                    "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                                    importMode === 'buy_unit' ? "bg-white shadow text-slate-800" : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                Nhập theo {selectedService.unit_buy}
                            </button>
                            <button
                                onClick={() => setImportMode('sell_unit')}
                                className={cn(
                                    "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                                    importMode === 'sell_unit' ? "bg-white shadow text-slate-800" : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                Nhập theo {selectedService.unit_sell}
                            </button>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase">
                                Số lượng ({importMode === 'buy_unit' ? selectedService.unit_buy : selectedService.unit_sell})
                            </label>
                            <div className="relative">
                                <input 
                                    autoFocus
                                    type="number" 
                                    value={inventoryForm.quantity || ''}
                                    onChange={(e) => setInventoryForm({...inventoryForm, quantity: Number(e.target.value)})}
                                    className="w-full px-4 py-3 pl-4 pr-12 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none font-bold text-2xl text-emerald-600 transition-all"
                                    placeholder="0"
                                />
                                {importMode === 'buy_unit' && selectedService.conversion_factor && selectedService.conversion_factor > 1 && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                                        = {((inventoryForm.quantity || 0) * selectedService.conversion_factor).toLocaleString()} {selectedService.unit_sell}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase">Ghi chú (Tùy chọn)</label>
                            <input 
                                type="text" 
                                value={inventoryForm.notes}
                                onChange={(e) => setInventoryForm({...inventoryForm, notes: e.target.value})}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 outline-none font-medium"
                                placeholder="VD: Nhập hàng từ NPP..."
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                    <button 
                        onClick={() => setIsImportModalOpen(false)}
                        className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        Hủy
                    </button>
                    <button 
                        onClick={handleImport}
                        disabled={inventoryForm.quantity <= 0}
                        className="flex-1 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Xác nhận nhập
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Adjust Modal */}
      {isAdjustModalOpen && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50/50">
                    <h3 className="text-xl font-black text-amber-800 flex items-center gap-2">
                        <RefreshCw className="w-6 h-6" />
                        Kiểm kê: {selectedService.name}
                    </h3>
                    <button onClick={() => setIsAdjustModalOpen(false)} className="p-2 hover:bg-amber-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-amber-600" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="bg-amber-50 p-4 rounded-xl text-amber-800 text-sm mb-4">
                        <p>Đang điều chỉnh số lượng thực tế trong kho.</p>
                        <p className="font-bold mt-1">Tồn hiện tại trên hệ thống: {selectedService.stock_quantity} {selectedService.unit_sell}</p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase">Số lượng thực tế ({selectedService.unit_sell})</label>
                        <input 
                            autoFocus
                            type="number" 
                            value={inventoryForm.quantity}
                            onChange={(e) => setInventoryForm({...inventoryForm, quantity: Number(e.target.value)})}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none font-bold text-2xl text-amber-600 transition-all"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase">Lý do điều chỉnh</label>
                        <input 
                            type="text" 
                            value={inventoryForm.notes}
                            onChange={(e) => setInventoryForm({...inventoryForm, notes: e.target.value})}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none font-medium"
                            placeholder="VD: Hư hỏng, thất thoát, tìm thấy..."
                        />
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                    <button 
                        onClick={() => setIsAdjustModalOpen(false)}
                        className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        Hủy
                    </button>
                    <button 
                        onClick={handleAdjust}
                        className="flex-1 py-3 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200 transition-colors"
                    >
                        Cập nhật tồn kho
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
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-400 uppercase bg-slate-50 sticky top-0">
                                <tr>
                                    <th className="px-6 py-3">Thời gian</th>
                                    <th className="px-6 py-3">Loại</th>
                                    <th className="px-6 py-3 text-right">Số lượng</th>
                                    <th className="px-6 py-3 text-right">Tồn sau</th>
                                    <th className="px-6 py-3">Ghi chú</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {logs.map(log => (
                                    <tr key={log.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 text-slate-500">
                                            {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "px-2 py-1 rounded text-xs font-bold",
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
                                        </td>
                                        <td className={cn(
                                            "px-6 py-4 text-right font-bold",
                                            log.quantity > 0 ? "text-emerald-600" : "text-red-600"
                                        )}>
                                            {log.quantity > 0 ? '+' : ''}{log.quantity}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-800">
                                            {log.balance_after}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 max-w-xs truncate" title={log.notes || ''}>
                                            {log.notes || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-100 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-4">Tên dịch vụ</th>
                                <th className="px-6 py-4 text-center">Tồn hiện tại</th>
                                <th className="px-6 py-4">Đơn vị nhập</th>
                                <th className="px-6 py-4 w-40">Số lượng nhập</th>
                                <th className="px-6 py-4">Quy đổi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {bulkItems.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-400">Không có dịch vụ nào đang theo dõi tồn kho.</td>
                                </tr>
                            ) : (
                                bulkItems.map((item, index) => {
                                    const service = services.find(s => s.id === item.id);
                                    if (!service) return null;
                                    
                                    return (
                                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-700">
                                                {service.name}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={cn(
                                                    "px-2 py-1 rounded text-xs font-bold",
                                                    (service.stock_quantity || 0) <= (service.min_stock_level || 5) ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                                                )}>
                                                    {service.stock_quantity} {service.unit_sell}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {service.unit_buy && service.unit_sell && service.unit_buy !== service.unit_sell ? (
                                                     <div className="flex bg-slate-100 rounded-lg p-1 w-fit">
                                                        <button 
                                                            onClick={() => {
                                                                const newItems = [...bulkItems];
                                                                newItems[index].mode = 'buy_unit';
                                                                setBulkItems(newItems);
                                                            }}
                                                            className={cn(
                                                                "px-3 py-1 rounded text-xs font-bold transition-all",
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
                                                                "px-3 py-1 rounded text-xs font-bold transition-all",
                                                                item.mode === 'sell_unit' ? "bg-white shadow text-blue-600" : "text-slate-400"
                                                            )}
                                                        >
                                                            {service.unit_sell}
                                                        </button>
                                                     </div>
                                                ) : (
                                                    <span className="text-slate-500 font-medium pl-2">{service.unit_sell}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <input 
                                                    type="number" 
                                                    min="0"
                                                    value={item.qty || ''}
                                                    onChange={(e) => {
                                                        const newItems = [...bulkItems];
                                                        newItems[index].qty = Number(e.target.value);
                                                        setBulkItems(newItems);
                                                    }}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-bold text-slate-800"
                                                    placeholder="0"
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-slate-400 text-xs">
                                                {item.qty > 0 && item.mode === 'buy_unit' && service.conversion_factor && service.conversion_factor > 1 && (
                                                    <span>= <strong className="text-emerald-600">{item.qty * service.conversion_factor}</strong> {service.unit_sell}</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
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

    </div>
  );
}
