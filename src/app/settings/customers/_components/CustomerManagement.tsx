"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Customer } from '@/types';
import { 
  Search, 
  User, 
  Phone, 
  CreditCard, 
  FileText, 
  ChevronLeft, 
  MoreVertical, 
  Edit2, 
  History, 
  DollarSign, 
  Users,
  X,
  Save,
  Trash2,
  Sparkles,
  MapPin
} from 'lucide-react';
import { EventService } from '@/services/events';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, cn } from '@/lib/utils';
import Link from 'next/link';
import { useNotification } from '@/context/NotificationContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCustomerBalance } from '@/hooks/useCustomerBalance';
import CustomerDetail from './CustomerDetail';
import { CustomerRow } from './CustomerRow';

export default function CustomerManagement() {
  const { showNotification } = useNotification();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    id_card: '',
    address: '',
    notes: ''
  });

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('full_name', { ascending: true });

    if (data) {
      setCustomers(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsAddingNew(false);
    setEditForm({
      full_name: customer.full_name || '',
      phone: customer.phone || '',
      id_card: customer.id_card || '',
      address: customer.address || '',
      notes: customer.notes || ''
    });
  };

  const handleAddNewCustomer = () => {
    setEditingCustomer(null);
    setIsAddingNew(true);
    setEditForm({
      full_name: '',
      phone: '',
      id_card: '',
      address: '',
      notes: ''
    });
  };

  const handleSaveCustomer = async () => {
    if (!editForm.full_name.trim()) {
      showNotification('Vui lòng nhập tên khách hàng', 'error');
      return;
    }

    if (isAddingNew) {
      const { error } = await supabase
        .from('customers')
        .insert([{
          full_name: editForm.full_name,
          phone: editForm.phone,
          id_card: editForm.id_card,
          address: editForm.address,
          notes: editForm.notes,
          balance: 0,
          visit_count: 0,
          total_spent: 0
        }]);

      if (!error) {
        fetchCustomers();
        setIsAddingNew(false);
        showNotification('Đã thêm khách hàng mới', 'success');
      } else {
        showNotification('Lỗi khi thêm: ' + error.message, 'error');
      }
      return;
    }

    if (!editingCustomer) return;

    const { error } = await supabase
      .from('customers')
      .update({
        full_name: editForm.full_name,
        phone: editForm.phone,
        id_card: editForm.id_card,
        address: editForm.address,
        notes: editForm.notes
      })
      .eq('id', editingCustomer.id);

    if (!error) {
      fetchCustomers();
      setEditingCustomer(null);
      showNotification('Đã cập nhật thông tin khách hàng', 'success');
    } else {
      console.error('Lỗi khi cập nhật khách hàng:', error);
      if (error.message.includes('column') || error.code === '42703') {
        showNotification('Lỗi cơ sở dữ liệu. Vui lòng liên hệ hỗ trợ.', 'error');
      } else {
        showNotification('Không thể lưu thay đổi: ' + error.message, 'error');
      }
    }
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    if (customer.full_name === 'Khách mới') {
      showNotification('Không thể xóa khách hàng mặc định "Khách mới"', 'error');
      return;
    }

    const reason = window.prompt(`Bạn có chắc chắn muốn xóa khách hàng "${customer.full_name}"? Mọi lịch sử đặt phòng sẽ được gộp vào khách hàng mặc định. Vui lòng nhập lý do:`);
    if (!reason) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Đang xử lý...',
      description: 'Đang gộp dữ liệu và xóa khách hàng...',
      onConfirm: async () => {
        try {
          // 1. Tìm ID của "Khách mới" mặc định
          const { data: defaultCust } = await supabase
            .from('customers')
            .select('id')
            .eq('full_name', 'Khách mới')
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

          const defaultId = defaultCust?.id;

          if (!defaultId) {
            throw new Error('Không tìm thấy khách hàng mặc định "Khách mới". Vui lòng tạo lại khách hàng này trước.');
          }

          // 2. Cập nhật các booking và invoice liên quan về Khách mới
          const [bookingUpdate, invoiceUpdate] = await Promise.all([
            supabase
              .from('bookings')
              .update({ customer_id: defaultId })
              .eq('customer_id', customer.id),
            supabase
              .from('invoices')
              .update({ customer_id: defaultId })
              .eq('customer_id', customer.id)
          ]);

          if (bookingUpdate.error) throw bookingUpdate.error;
          if (invoiceUpdate.error) throw invoiceUpdate.error;

          // 3. Xóa khách hàng
          const { error: deleteError } = await supabase
            .from('customers')
            .delete()
            .eq('id', customer.id);

          if (deleteError) throw deleteError;

          // 4. Ghi log sự kiện
          await EventService.emit({
            type: 'CUSTOMER_DELETE',
            entity_type: 'customers',
            entity_id: customer.id,
            action: 'Xóa khách hàng',
            reason: reason,
            old_value: customer,
            severity: 'warning'
          });

          showNotification('Đã xóa khách hàng và cập nhật lịch sử', 'success');
          fetchCustomers();
        } catch (error: any) {
          showNotification('Lỗi khi xóa: ' + error.message, 'error');
        } finally {
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleCleanupDuplicates = async () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Dọn dẹp khách trùng?',
      description: 'Hệ thống sẽ gộp tất cả khách hàng có tên "Khách mới" hoặc không có thông tin vào một khách hàng duy nhất. Bạn có muốn tiếp tục?',
      onConfirm: async () => {
        setLoading(true);
        try {
          // 1. Lấy tất cả khách hàng
          const { data: allCustomers } = await supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: true });

          if (!allCustomers) return;

          // 2. Tìm "Khách mới" chuẩn (cái đầu tiên được tạo)
          const master = allCustomers.find(c => c.full_name === 'Khách mới') || allCustomers[0];
          
          if (!master) {
            showNotification('Không tìm thấy khách hàng để làm chuẩn', 'error');
            return;
          }

          // 3. Lọc ra những khách hàng cần gộp (tên là Khách mới nhưng khác ID master)
          const duplicates = allCustomers.filter(c => 
            c.id !== master.id && 
            (c.full_name === 'Khách mới' || (!c.phone && !c.id_card && !c.address))
          );

          if (duplicates.length === 0) {
            showNotification('Không tìm thấy khách hàng trùng lặp nào', 'info');
            return;
          }

          let count = 0;
          for (const dupe of duplicates) {
            // Cập nhật booking và invoice
            await Promise.all([
              supabase
                .from('bookings')
                .update({ customer_id: master.id })
                .eq('customer_id', dupe.id),
              supabase
                .from('invoices')
                .update({ customer_id: master.id })
                .eq('customer_id', dupe.id)
            ]);
            
            // Xóa khách trùng
            await supabase
              .from('customers')
              .delete()
              .eq('id', dupe.id);
            
            count++;
          }

          showNotification(`Đã dọn dẹp và gộp ${count} khách hàng thành công`, 'success');
          fetchCustomers();
        } catch (error: any) {
          showNotification('Lỗi khi dọn dẹp: ' + error.message, 'error');
        } finally {
          setLoading(false);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const filteredCustomers = customers.filter(c =>
    c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.id_card?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="pb-32 pt-4 px-4 max-w-4xl mx-auto">
      {/* Detail View Overlay */}
      <AnimatePresence>
        {selectedCustomerId && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[150] bg-white"
          >
            <CustomerDetail 
              customerId={selectedCustomerId} 
              onClose={() => setSelectedCustomerId(null)} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="p-2 -ml-2 rounded-full active:bg-slate-200 transition-colors">
            <ChevronLeft className="h-6 w-6 text-slate-600" />
          </Link>
          <h1 className="text-xl font-bold text-slate-800">Quản lý Khách hàng</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddNewCustomer}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-all shadow-sm active:scale-95"
          >
            <Users size={14} />
            Thêm khách
          </button>
          <button
            onClick={handleCleanupDuplicates}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold text-xs hover:bg-emerald-200 transition-all shadow-sm active:scale-95"
            title="Dọn dẹp các khách hàng trùng lặp"
          >
            <Sparkles size={14} />
            Dọn khách
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên, số điện thoại hoặc CCCD..."
            value={searchTerm}
            onChange={handleSearch}
            className="h-14 w-full rounded-2xl bg-slate-200/50 pl-12 pr-4 text-base font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-inner"
          />
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-3xl border border-blue-100">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Users size={16} />
            <span className="text-[10px] font-black uppercase tracking-wider">Tổng khách</span>
          </div>
          <div className="text-2xl font-black text-blue-900">{customers.length}</div>
        </div>
        <div className="bg-emerald-50 p-4 rounded-3xl border border-emerald-100">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <DollarSign size={16} />
            <span className="text-[10px] font-black uppercase tracking-wider">Tổng doanh thu KH</span>
          </div>
          <div className="text-xl font-black text-emerald-900">
            {formatCurrency(customers.reduce((sum, c) => sum + (c.total_spent || 0), 0))}
          </div>
        </div>
      </div>

      {/* Customer List */}
      <div className="space-y-4">
        {filteredCustomers.map((customer) => (
          <CustomerRow 
            key={customer.id} 
            customer={customer} 
            onEdit={handleEditCustomer}
            onDelete={handleDeleteCustomer}
            onSelect={setSelectedCustomerId}
          />
        ))}

        {filteredCustomers.length === 0 && (
          <div className="text-center py-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="text-slate-300" size={32} />
            </div>
            <p className="text-slate-400 font-bold">Không tìm thấy khách hàng nào</p>
          </div>
        )}
      </div>

      {/* Edit Customer Modal */}
      <AnimatePresence>
        {(editingCustomer || isAddingNew) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-black text-slate-800">
                      {isAddingNew ? 'Thêm khách hàng mới' : 'Sửa thông tin khách hàng'}
                    </h2>
                    {editingCustomer && (
                      <p className="text-sm font-bold text-slate-400">ID: {editingCustomer.id.slice(0, 8)}...</p>
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      setEditingCustomer(null);
                      setIsAddingNew(false);
                    }}
                    className="p-3 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Họ và tên</label>
                    <input
                      type="text"
                      value={editForm.full_name}
                      onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                      className="w-full h-12 px-4 rounded-2xl bg-slate-100 border-none font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all"
                      placeholder="Nguyễn Văn A"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Số điện thoại</label>
                      <input
                        type="tel"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="w-full h-12 px-4 rounded-2xl bg-slate-100 border-none font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all"
                        placeholder="090..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">CCCD/Hộ chiếu</label>
                      <input
                        type="text"
                        value={editForm.id_card}
                        onChange={(e) => setEditForm({ ...editForm, id_card: e.target.value })}
                        className="w-full h-12 px-4 rounded-2xl bg-slate-100 border-none font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all"
                        placeholder="001..."
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Địa chỉ</label>
                    <input
                      type="text"
                      value={editForm.address}
                      onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      className="w-full h-12 px-4 rounded-2xl bg-slate-100 border-none font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all"
                      placeholder="Hà Nội, Việt Nam"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Ghi chú</label>
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      className="w-full h-32 p-4 rounded-2xl bg-slate-100 border-none font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                      placeholder="Khách thích tầng cao, không hút thuốc..."
                    />
                  </div>

                  <button
                    onClick={handleSaveCustomer}
                    className="w-full h-14 bg-blue-600 text-white rounded-[1.5rem] font-black text-sm uppercase tracking-widest shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Save size={18} />
                    Lưu thông tin
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
