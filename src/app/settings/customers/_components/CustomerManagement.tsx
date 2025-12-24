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
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, cn } from '@/lib/utils';
import Link from 'next/link';

export default function CustomerManagement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [notes, setNotes] = useState('');

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

  const handleEditNotes = (customer: Customer) => {
    setEditingCustomer(customer);
    setNotes(customer.notes || '');
  };

  const handleSaveNotes = async () => {
    if (!editingCustomer) return;

    const { error } = await supabase
      .from('customers')
      .update({ notes })
      .eq('id', editingCustomer.id);

    if (!error) {
      fetchCustomers();
      setEditingCustomer(null);
      setNotes('');
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.id_card?.toLowerCase().includes(searchTerm.toLowerCase())
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
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/settings" className="p-2 -ml-2 rounded-full active:bg-slate-200 transition-colors">
          <ChevronLeft className="h-6 w-6 text-slate-600" />
        </Link>
        <h1 className="text-xl font-bold text-slate-800">Quản lý Khách hàng</h1>
      </div>

      {/* Search Bar */}
      <div className="mb-8 sticky top-16 z-30 py-2 bg-slate-50/80 backdrop-blur-sm">
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
          <motion.div
            key={customer.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="group bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all active:scale-[0.99]"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">{customer.full_name}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                      <Phone size={12} />
                      {customer.phone || '---'}
                    </div>
                    <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                      <CreditCard size={12} />
                      {customer.id_card || '---'}
                    </div>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleEditNotes(customer)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-all"
              >
                <Edit2 size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1">
                  <History size={10} /> Lượt đến
                </span>
                <span className="text-sm font-black text-slate-700">{customer.visit_count || 0} lần</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1">
                  <DollarSign size={10} /> Tổng chi tiêu
                </span>
                <span className="text-sm font-black text-emerald-600">{formatCurrency(customer.total_spent || 0)}</span>
              </div>
            </div>

            {customer.notes && (
              <div className="mt-4 p-3 bg-yellow-50/50 rounded-2xl border border-yellow-100/50">
                <div className="flex items-center gap-2 text-yellow-700 mb-1">
                  <FileText size={12} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Ghi chú</span>
                </div>
                <p className="text-xs font-bold text-yellow-800 leading-relaxed">{customer.notes}</p>
              </div>
            )}
          </motion.div>
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

      {/* Edit Notes Modal */}
      <AnimatePresence>
        {editingCustomer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-black text-slate-800">Ghi chú khách hàng</h2>
                    <p className="text-sm font-bold text-slate-400">{editingCustomer.full_name}</p>
                  </div>
                  <button 
                    onClick={() => setEditingCustomer(null)}
                    className="p-3 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Nội dung ghi chú</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full h-40 rounded-3xl bg-slate-50 p-4 text-base font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300 resize-none border-transparent"
                      placeholder="Nhập ghi chú về thói quen, sở thích hoặc lưu ý đặc biệt..."
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => setEditingCustomer(null)}
                      className="flex-1 h-14 rounded-2xl bg-slate-100 font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      Hủy
                    </button>
                    <button 
                      onClick={handleSaveNotes}
                      className="flex-[2] flex h-14 items-center justify-center rounded-2xl bg-blue-600 font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                    >
                      <Save className="mr-2" size={20} />
                      Lưu ghi chú
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
