'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { MoreHorizontal, Plus, Trash2, Edit, Package, Search, Tag, DollarSign, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, cn, formatInputCurrency, parseCurrency } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type Service = {
  id: string;
  name: string;
  price: number;
  unit: string;
  is_active: boolean;
  stock: number | null;
  service_category_id: string | null;
  service_categories: { name: string } | null;
};

type Category = {
  id: string;
  name: string;
};

export default function ServiceList() {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isStockOpen, setIsStockOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    price: 0,
    unit: '',
    is_active: true,
    stock: 0,
    service_category_id: ''
  });
  
  // Stock update state
  const [stockChange, setStockChange] = useState({ amount: 0, reason: '' });
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: 'danger' | 'info';
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const fetchServices = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('services')
      .select(`*, service_categories ( name )`)
      .order('name', { ascending: true });

    if (error) toast.error('Lỗi khi tải dịch vụ');
    else setServices(data as Service[]);
    setLoading(false);
  }, []);

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase.from('service_categories').select('id, name').order('name');
    if (!error) setCategories(data);
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      if (!isMounted) return;
      await Promise.all([fetchServices(), fetchCategories()]);
    };

    loadData();
    
    return () => {
      isMounted = false;
    };
  }, [fetchServices, fetchCategories]);

  const handleServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: formData.name,
      price: formData.price,
      unit: formData.unit,
      is_active: formData.is_active,
      stock: formData.stock,
      service_category_id: formData.service_category_id || null
    };

    if (selectedService) {
      const { error } = await supabase.from('services').update(data).eq('id', selectedService.id);
      if (error) toast.error('Lỗi cập nhật');
      else {
        toast.success('Đã cập nhật');
        setIsFormOpen(false);
        fetchServices();
      }
    } else {
      const { error } = await supabase.from('services').insert([data]);
      if (error) toast.error('Lỗi thêm mới');
      else {
        toast.success('Đã thêm mới');
        setIsFormOpen(false);
        fetchServices();
      }
    }
  };

  const handleStockUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;

    const newStock = (selectedService.stock || 0) + stockChange.amount;
    
    const { error: updateError } = await supabase
      .from('services')
      .update({ stock: newStock })
      .eq('id', selectedService.id);

    if (updateError) {
      toast.error('Lỗi cập nhật kho');
      return;
    }

    await supabase.from('stock_history').insert([{
      service_id: selectedService.id,
      action_type: stockChange.amount > 0 ? 'IMPORT' : 'EXPORT',
      quantity: Math.abs(stockChange.amount),
      details: {
        reason: stockChange.reason,
        stock_before: selectedService.stock || 0,
        stock_after: newStock,
        service_name: selectedService.name
      }
    }]);

    toast.success('Cập nhật kho thành công');
    setIsStockOpen(false);
    fetchServices();
  };

  const handleDelete = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Xóa dịch vụ?',
      description: 'Bạn có chắc chắn muốn xóa dịch vụ này? Hành động này không thể hoàn tác.',
      variant: 'danger',
      onConfirm: async () => {
        const { error } = await supabase.from('services').delete().eq('id', id);
        if (error) {
          toast.error('Lỗi khi xóa');
        } else {
          toast.success('Đã xóa');
          fetchServices();
        }
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.service_categories?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm tên dịch vụ, loại..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-14 w-full rounded-2xl bg-slate-200/50 pl-12 pr-4 text-base font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-inner"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-[2rem] bg-slate-100" />
          ))
        ) : filteredServices.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-slate-200 py-20 text-slate-400 bg-white/50">
            <Package className="h-12 w-12 opacity-20 mb-4" />
            <p className="text-lg font-bold">Không tìm thấy dịch vụ</p>
          </div>
        ) : (
          filteredServices.map((service) => (
            <motion.div
              key={service.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="group relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h4 className="text-lg font-black text-slate-800 line-clamp-1">{service.name}</h4>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                      {service.service_categories?.name || 'Chưa phân loại'}
                    </span>
                    {!service.is_active && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-500 uppercase tracking-tighter">Ngừng bán</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => {
                      setSelectedService(service);
                      setFormData({
                        name: service.name,
                        price: service.price,
                        unit: service.unit,
                        is_active: service.is_active,
                        stock: service.stock || 0,
                        service_category_id: service.service_category_id || ''
                      });
                      setIsFormOpen(true);
                    }}
                    className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    <Edit size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(service.id)}
                    className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-4">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Giá bán</p>
                  <p className="text-lg font-black text-blue-600">{formatCurrency(service.price)}đ<span className="text-xs font-bold text-slate-400">/{service.unit}</span></p>
                </div>
                
                <button 
                  onClick={() => {
                    setSelectedService(service);
                    setStockChange({ amount: 0, reason: '' });
                    setIsStockOpen(true);
                  }}
                  className={cn(
                    "flex flex-col items-end rounded-2xl px-4 py-2 transition-all active:scale-95",
                    (service.stock || 0) <= 5 ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-600"
                  )}
                >
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Tồn kho</span>
                  <span className="text-sm font-black">{service.stock !== null ? service.stock : '-'}</span>
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto">
        <button
          onClick={() => {
            setSelectedService(null);
            setFormData({ name: '', price: 0, unit: 'Cái', is_active: true, stock: 0, service_category_id: '' });
            setIsFormOpen(true);
          }}
          className="flex h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-base font-bold text-white shadow-xl shadow-blue-200 active:scale-[0.96] transition-all"
        >
          <Plus className="h-5 w-5" />
          THÊM DỊCH VỤ MỚI
        </button>
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-0">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative w-full h-full bg-slate-50 p-8 shadow-2xl flex flex-col overflow-y-auto rounded-none"
            >
              <form onSubmit={handleServiceSubmit} className="space-y-6">
                <div className="flex items-center justify-between pt-4">
                  <h3 className="text-xl font-bold text-slate-800">{selectedService ? 'Sửa dịch vụ' : 'Thêm dịch vụ mới'}</h3>
                  <button type="button" onClick={() => setIsFormOpen(false)} className="rounded-full bg-slate-200 p-3 text-slate-500 hover:bg-slate-300 transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6 flex-1">
                  <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
                    <div className="flex items-center gap-2 text-blue-600 mb-2">
                      <Tag size={18} />
                      <span className="font-bold text-sm">Thông tin dịch vụ</span>
                    </div>
                    
                    <div className="space-y-4">
                      <FormInput 
                        label="Tên dịch vụ" 
                        value={formData.name} 
                        onChange={v => setFormData({...formData, name: v})} 
                        placeholder="VD: Coca Cola"
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormInput 
                          label="Loại" 
                          type="select"
                          value={formData.service_category_id} 
                          onChange={v => setFormData({...formData, service_category_id: v})}
                          options={[{id: '', name: 'Chưa phân loại'}, ...categories]}
                        />
                        <FormInput 
                          label="Đơn vị tính" 
                          value={formData.unit} 
                          onChange={v => setFormData({...formData, unit: v})} 
                          placeholder="VD: Lon, Cái..."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
                    <div className="flex items-center gap-2 text-emerald-600 mb-2">
                      <DollarSign size={18} />
                      <span className="font-bold text-sm">Giá & Kho</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormInput 
                        label="Giá bán" 
                        type="currency"
                        value={formData.price} 
                        onChange={v => setFormData({...formData, price: v})} 
                      />
                      <FormInput 
                        label="Tồn ban đầu" 
                        type="number"
                        value={formData.stock} 
                        onChange={v => setFormData({...formData, stock: Number(v)})} 
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold text-slate-800">Đang kinh doanh</p>
                        <p className="text-xs text-slate-400">Hiển thị để khách đặt</p>
                      </div>
                      <input 
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={e => setFormData({...formData, is_active: e.target.checked})}
                        className="h-6 w-11 rounded-full bg-slate-200 transition-all focus:ring-blue-500 appearance-none cursor-pointer checked:bg-blue-600 relative after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all checked:after:translate-x-5"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 h-14 rounded-2xl bg-slate-200 font-bold text-slate-600 hover:bg-slate-300 transition-colors">Hủy</button>
                  <button type="submit" className="flex-[2] flex h-14 items-center justify-center rounded-2xl bg-blue-600 font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                    <Save className="mr-2" size={20}/>
                    {selectedService ? 'Lưu thay đổi' : 'Thêm mới'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stock Update Modal */}
      <AnimatePresence>
        {isStockOpen && selectedService && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-0">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative w-full h-full bg-slate-50 p-8 shadow-2xl flex flex-col overflow-y-auto rounded-none"
            >
              <div className="flex items-center justify-between pt-4 mb-8">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Cập nhật kho</h3>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{selectedService.name}</p>
                </div>
                <button type="button" onClick={() => setIsStockOpen(false)} className="rounded-full bg-slate-200 p-3 text-slate-500 hover:bg-slate-300 transition-all">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleStockUpdate} className="space-y-6 flex-1">
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">Tồn hiện tại</span>
                    <span className="text-lg font-black text-slate-800">{selectedService.stock || 0}</span>
                  </div>

                  <FormInput 
                    label="Số lượng thay đổi" 
                    type="number"
                    placeholder="+ nhập, - xuất"
                    value={stockChange.amount}
                    onChange={v => setStockChange({...stockChange, amount: Number(v)})}
                  />
                  
                  <FormInput 
                    label="Lý do" 
                    placeholder="VD: Nhập hàng mới..."
                    value={stockChange.reason}
                    onChange={v => setStockChange({...stockChange, reason: v})}
                  />
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsStockOpen(false)} className="flex-1 h-14 rounded-2xl bg-slate-200 font-bold text-slate-600 hover:bg-slate-300 transition-colors">Hủy</button>
                  <button 
                    type="submit"
                    className={cn(
                      "flex-[2] h-14 rounded-2xl font-bold text-white transition-all shadow-lg",
                      stockChange.amount >= 0 ? "bg-emerald-600 shadow-emerald-100" : "bg-rose-600 shadow-rose-100"
                    )}
                  >
                    {stockChange.amount >= 0 ? 'NHẬP KHO' : 'XUẤT KHO'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        variant={confirmConfig.variant}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

interface FormInputProps {
  label: string;
  value: any;
  onChange: (val: any) => void;
  type?: 'text' | 'number' | 'currency' | 'select';
  placeholder?: string;
  options?: Array<{ id: string; name: string }>;
}

function FormInput({ label, value, onChange, type = 'text', placeholder, options }: FormInputProps) {
  const [displayValue, setDisplayValue] = useState(type === 'currency' ? formatInputCurrency(value?.toString() || '0') : value);

  useEffect(() => {
    let isMounted = true;
    if (isMounted) {
      if (type === 'currency') {
        setDisplayValue(formatInputCurrency(value?.toString() || '0'));
      } else {
        setDisplayValue(value);
      }
    }
    return () => { isMounted = false; };
  }, [value, type]);

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">{label}</label>
      {type === 'select' ? (
        <select 
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-14 w-full rounded-2xl border-transparent bg-slate-50 px-4 text-base font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
        >
          {options.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      ) : type === 'currency' ? (
        <div className="relative">
          <input 
            type="text"
            value={displayValue}
            onChange={e => {
              const formatted = formatInputCurrency(e.target.value);
              setDisplayValue(formatted);
              onChange(parseCurrency(formatted));
            }}
            placeholder={placeholder}
            className="h-14 w-full rounded-2xl border-transparent bg-slate-50 px-4 text-base font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">đ</span>
        </div>
      ) : (
        <input 
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-14 w-full rounded-2xl border-transparent bg-slate-50 px-4 text-base font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
        />
      )}
    </div>
  );
}

