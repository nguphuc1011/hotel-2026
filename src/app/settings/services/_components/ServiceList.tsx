'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Edit, Package, Search, Tag, DollarSign, X, Save, AlertCircle, ArrowUpCircle, ArrowDownCircle, MoreVertical, Edit2, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { EventService } from '@/services/events';
import { useNotification } from '@/context/NotificationContext';
import { formatCurrency, cn } from '@/lib/utils';
import { NumericInput } from '@/components/ui/NumericInput';

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
  const { showNotification } = useNotification();
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isStockOpen, setIsStockOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    price: 0,
    unit: 'Cái',
    is_active: true,
    stock: 0,
    service_category_id: ''
  });

  const [stockData, setStockData] = useState({
    quantity: 1,
    type: 'IMPORT' as 'IMPORT' | 'EXPORT',
    reason: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch categories first
      const { data: catData, error: catError } = await supabase
        .from('service_categories')
        .select('id, name')
        .order('name');
      
      if (catError) {
        if (catError.message.includes('relation') || catError.message.includes('not found')) {
          throw new Error('Cơ sở dữ liệu chưa được thiết lập. Vui lòng chạy lệnh SQL Reset.');
        }
        throw catError;
      }
      setCategories(catData || []);

      // Fetch services
      const { data: servData, error: servError } = await supabase
        .from('services')
        .select(`*, service_categories ( name )`)
        .order('name', { ascending: true });

      if (servError) {
        if (servError.message.includes('relation') || servError.message.includes('not found')) {
          throw new Error('Cơ sở dữ liệu chưa được thiết lập. Vui lòng chạy lệnh SQL Reset.');
        }
        throw servError;
      }
      setServices(servData as Service[] || []);
    } catch (err: any) {
      console.error('Lỗi tải dữ liệu:', err);
      setError(err.message || 'Không thể kết nối đến cơ sở dữ liệu');
      showNotification('Lỗi tải dữ liệu', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const payload = {
      name: formData.name,
      price: formData.price,
      unit: formData.unit,
      is_active: formData.is_active,
      stock: formData.stock,
      service_category_id: formData.service_category_id || null
    };

    try {
      let result;
      let reason = '';

      if (selectedService) {
        // Kiểm tra gian lận giá: Giảm giá niêm yết
        if (formData.price < selectedService.price) {
          reason = window.prompt(`Cảnh báo: Bạn đang GIẢM GIÁ niêm yết của dịch vụ "${selectedService.name}" từ ${formatCurrency(selectedService.price)} xuống ${formatCurrency(formData.price)}. Vui lòng nhập lý do (bắt buộc):`) || '';
          if (!reason.trim()) {
            showNotification('Bắt buộc phải có lý do khi giảm giá dịch vụ!', 'error');
            setSubmitting(false);
            return;
          }
        }

        result = await supabase.from('services').update(payload).eq('id', selectedService.id);

        if (!result.error && reason) {
          await EventService.emit({
            type: 'SERVICE_PRICE_REDUCTION',
            entity_type: 'services',
            entity_id: selectedService.id,
            action: 'Giảm giá dịch vụ',
            reason: reason,
            old_value: selectedService,
            new_value: payload,
            severity: 'warning'
          });
        }
      } else {
        result = await supabase.from('services').insert([payload]);
      }

      if (result.error) throw result.error;

      showNotification(selectedService ? 'Đã cập nhật' : 'Đã thêm mới', 'success');
      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Lỗi lưu dịch vụ:', err);
      alert(`LỖI LƯU DỮ LIỆU:\n${err.message}\n\nMẹo: Kiểm tra xem bạn đã chạy SQL khởi tạo chưa?`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || submitting) return;
    setSubmitting(true);

    try {
      const currentStock = selectedService.stock || 0;
      const change = stockData.type === 'IMPORT' ? stockData.quantity : -stockData.quantity;
      const newStock = currentStock + change;

      if (newStock < 0) {
        throw new Error('Số lượng tồn kho không thể âm');
      }

      // 1. Cập nhật bảng services
      const { error: updateError } = await supabase
        .from('services')
        .update({ stock: newStock })
        .eq('id', selectedService.id);

      if (updateError) throw updateError;

      // 2. Thêm vào lịch sử stock_history
      const { error: historyError } = await supabase
        .from('stock_history')
        .insert([{
          service_id: selectedService.id,
          action_type: stockData.type,
          quantity: stockData.quantity,
          details: {
            reason: stockData.reason || (stockData.type === 'IMPORT' ? 'Nhập kho bổ sung' : 'Xuất kho'),
            stock_before: currentStock,
            stock_after: newStock,
            service_name: selectedService.name
          }
        }]);

      if (historyError) throw historyError;

      showNotification(`Đã ${stockData.type === 'IMPORT' ? 'nhập' : 'xuất'} kho thành công`, 'success');
      setIsStockOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Lỗi cập nhật kho:', err);
      alert(`LỖI:\n${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (service: any) => {
    const reason = window.prompt(`Bạn có chắc chắn muốn xóa dịch vụ "${service.name}"? Vui lòng nhập lý do:`);
    if (!reason) return;

    try {
      const { error } = await supabase.from('services').delete().eq('id', service.id);
      if (error) throw error;

      await EventService.emit({
        type: 'SERVICE_DELETE',
        entity_type: 'services',
        entity_id: service.id,
        action: 'Xóa dịch vụ',
        reason: reason,
        old_value: service,
        severity: 'warning'
      });

      showNotification('Đã xóa thành công', 'success');
      fetchData();
    } catch (err: any) {
      console.error('Lỗi xóa:', err);
      showNotification('Lỗi khi xóa dịch vụ', 'error');
    }
  };

  const filteredServices = services.filter(s => {
    if (!s) return false;
    const name = s.name || '';
    const catName = s.service_categories?.name || '';
    const query = searchQuery.toLowerCase();
    return name.toLowerCase().includes(query) || catName.toLowerCase().includes(query);
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-16 w-16 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Trang Dịch vụ đang gặp sự cố</h2>
        <p className="text-slate-500 mb-6 max-w-md">{error}</p>
        <button 
          onClick={() => fetchData()}
          className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold"
        >
          Thử tải lại trang
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search & Add */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm dịch vụ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 w-full rounded-xl bg-white border border-slate-200 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => {
            setSelectedService(null);
            setFormData({ name: '', price: 0, unit: 'Cái', is_active: true, stock: 0, service_category_id: '' });
            setIsFormOpen(true);
          }}
          className="h-12 px-6 rounded-xl bg-blue-600 text-white font-bold flex items-center gap-2"
        >
          <Plus size={20} />
          Thêm
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-2xl" />)
        ) : filteredServices.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
            <Package size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-bold">Chưa có dịch vụ nào</p>
          </div>
        ) : (
          filteredServices.map(service => (
            <div key={service.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{service?.name || 'Không tên'}</h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                    {service?.service_categories?.name || 'Chưa phân loại'}
                  </span>
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
                    className="p-2 text-slate-400 hover:text-blue-600"
                  >
                    <Edit size={18} />
                  </button>
                  <button onClick={() => handleDelete(service)} className="p-2 text-slate-400 hover:text-rose-600">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-end border-t pt-4 gap-4">
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Giá bán</p>
                  <p className="font-black text-blue-600">{formatCurrency(service.price)}/{service.unit}</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Tồn kho</p>
                    <p className={cn(
                      "font-bold",
                      (service.stock ?? 0) < 5 ? "text-rose-600 animate-pulse" : "text-slate-800"
                    )}>
                      {service.stock ?? 0}
                    </p>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setSelectedService(service);
                      setStockData({ quantity: 1, type: 'IMPORT', reason: '' });
                      setIsStockOpen(true);
                    }}
                    className="flex items-center gap-2 bg-slate-100 hover:bg-blue-600 hover:text-white px-3 py-2 rounded-xl transition-all group"
                    title="Nhập/Xuất kho"
                  >
                    <Package size={16} className="text-slate-500 group-hover:text-white" />
                    <span className="text-xs font-bold">Nhập/Xuất</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Simplified Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">{selectedService ? 'Sửa dịch vụ' : 'Thêm dịch vụ mới'}</h3>
              <button onClick={() => setIsFormOpen(false)}><X /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Tên dịch vụ</label>
                <input 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full h-12 bg-slate-50 rounded-xl px-4 outline-none border border-transparent focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Giá bán</label>
                  <NumericInput 
                    value={formData.price}
                    onChange={val => setFormData({...formData, price: val})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Đơn vị</label>
                  <input 
                    value={formData.unit}
                    onChange={e => setFormData({...formData, unit: e.target.value})}
                    className="w-full h-12 bg-slate-50 rounded-xl px-4 outline-none border border-transparent focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Loại dịch vụ</label>
                <select 
                  value={formData.service_category_id}
                  onChange={e => setFormData({...formData, service_category_id: e.target.value})}
                  className="w-full h-12 bg-slate-50 rounded-xl px-4 outline-none border border-transparent focus:border-blue-500"
                >
                  <option value="">Chưa phân loại</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 h-12 rounded-xl bg-slate-100 font-bold">Hủy</button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-[2] h-12 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : 'Lưu dữ liệu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Stock Management Modal */}
      {isStockOpen && selectedService && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold">Quản lý kho</h3>
                <p className="text-sm text-slate-500">{selectedService.name}</p>
              </div>
              <button onClick={() => setIsStockOpen(false)}><X /></button>
            </div>

            <form onSubmit={handleStockSubmit} className="space-y-6">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setStockData({ ...stockData, type: 'IMPORT' })}
                  className={cn(
                    "flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all",
                    stockData.type === 'IMPORT' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  <ArrowUpCircle size={18} />
                  Nhập kho
                </button>
                <button
                  type="button"
                  onClick={() => setStockData({ ...stockData, type: 'EXPORT' })}
                  className={cn(
                    "flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all",
                    stockData.type === 'EXPORT' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  <ArrowDownCircle size={18} />
                  Xuất kho
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Số lượng</label>
                  <NumericInput
                    value={stockData.quantity}
                    onChange={val => setStockData({ ...stockData, quantity: val })}
                    placeholder="1"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Lý do (Tùy chọn)</label>
                  <input
                    placeholder={stockData.type === 'IMPORT' ? "VD: Nhập hàng mới" : "VD: Xuất hủy, hỏng"}
                    value={stockData.reason}
                    onChange={e => setStockData({ ...stockData, reason: e.target.value })}
                    className="w-full h-12 bg-slate-50 rounded-xl px-4 outline-none border border-transparent focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-2xl flex justify-between items-center">
                <span className="text-sm font-medium text-blue-700">Tồn kho sau xử lý:</span>
                <span className="text-xl font-black text-blue-700">
                  {(selectedService.stock || 0) + (stockData.type === 'IMPORT' ? stockData.quantity : -stockData.quantity)}
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  "w-full h-14 rounded-2xl text-white font-bold text-lg shadow-lg transition-all active:scale-[0.98]",
                  stockData.type === 'IMPORT' ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600",
                  submitting && "opacity-50 cursor-not-allowed"
                )}
              >
                {submitting ? 'Đang xử lý...' : (stockData.type === 'IMPORT' ? 'Xác nhận nhập kho' : 'Xác nhận xuất kho')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
