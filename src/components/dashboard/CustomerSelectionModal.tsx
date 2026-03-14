'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Loader2, User, Phone, CreditCard, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';
import { customerService, Customer } from '@/services/customerService';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';

interface CustomerSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (customer: Customer) => Promise<void>;
}

export default function CustomerSelectionModal({ isOpen, onClose, onSelect }: CustomerSelectionModalProps) {
    const { alert: alertDialog } = useGlobalDialog();
    const [mounted, setMounted] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // New Customer Fields
    const [newCustomerPhone, setNewCustomerPhone] = useState('');
    const [newCustomerIdCard, setNewCustomerIdCard] = useState('');

    const searchRef = useRef<HTMLDivElement>(null);

    // Helper to normalize string for search
    const normalize = (str: string) => {
        return str
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .trim();
    };

    useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch customers on open
    useEffect(() => {
        if (isOpen) {
            const fetchCustomers = async () => {
                try {
                    setIsSearching(true);
                    const { data } = await customerService.getCustomers({ limit: 1000 });
                    setAllCustomers(data);
                } catch (e) {
                    console.error("Failed to load customers", e);
                } finally {
                    setIsSearching(false);
                }
            };
            fetchCustomers();
            
            // Reset states
            setSearchTerm('');
            setCustomers([]);
            setNewCustomerPhone('');
            setNewCustomerIdCard('');
            setIsSubmitting(false);
        }
    }, [isOpen]);

    // Local Search Logic - Exact match with CheckInModal
    useEffect(() => {
        if (!searchTerm.trim()) {
            setCustomers([]);
            return;
        }

        const searchNorm = normalize(searchTerm);
        const filtered = allCustomers.filter(c => {
            const nameNorm = normalize(c.full_name);
            const phone = c.phone || '';
            const idCard = c.id_card || '';
            return nameNorm.includes(searchNorm) || phone.includes(searchNorm) || idCard.includes(searchNorm);
        }).slice(0, 5);

        setCustomers(filtered);
    }, [searchTerm, allCustomers]);

    // Handle Click Outside to close dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setCustomers([]);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [searchRef]);

    const handleSelectExisting = async (customer: Customer) => {
        setIsSubmitting(true);
        try {
            await onSelect(customer);
            onClose();
        } catch (error: any) {
            alertDialog({
                title: 'Lỗi',
                message: error.message || 'Không thể chọn khách hàng này',
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreateAndSelect = async () => {
        if (!searchTerm.trim()) return;

        setIsSubmitting(true);
        try {
            const newCustomer = await customerService.createCustomer({
                full_name: searchTerm,
                phone: newCustomerPhone,
                id_card: newCustomerIdCard,
                balance: 0
            });
            
            if (newCustomer) {
                await onSelect(newCustomer);
                onClose();
            }
        } catch (error: any) {
            alertDialog({
                title: 'Lỗi',
                message: error.message || 'Không thể tạo khách hàng mới',
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className={cn(
                "w-full bg-white shadow-2xl overflow-hidden flex flex-col animate-in duration-300",
                "h-[92vh] mt-auto rounded-t-[40px] slide-in-from-bottom-full md:h-auto md:max-w-lg md:rounded-[32px] md:zoom-in-95 md:max-h-[90vh] md:mt-0"
            )}>
                {/* --- HEADER --- */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
                            <User className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 leading-none">Chọn khách hàng</h3>
                            <p className="text-xs text-slate-500 mt-1 font-medium">Tìm hoặc tạo khách hàng mới</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full transition-all active:scale-95 border border-slate-200 shadow-sm"
                    >
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* --- BODY --- */}
                <div className="flex-1 p-6 space-y-6 bg-slate-50 relative overflow-y-auto custom-scrollbar">
                    
                    {/* Warning / Explanation */}
                    <div className="bg-orange-50 rounded-[32px] p-6 flex gap-4 border border-orange-100 shadow-sm animate-in slide-in-from-top-2">
                        <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center shrink-0">
                            <AlertCircle className="w-6 h-6 text-orange-600" />
                        </div>
                        <div className="text-sm text-orange-800 flex-1 leading-tight">
                            <span className="font-black block mb-1 uppercase tracking-widest text-[10px]">Yêu cầu chọn khách hàng</span>
                            <p className="font-bold">Khách vãng lai không được phép ghi nợ. Vui lòng chọn khách hàng có sẵn hoặc tạo mới để tiếp tục.</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4 relative z-50" ref={searchRef}>
                        <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1 flex items-center gap-2">
                            <Search className="w-4 h-4" /> Tìm kiếm khách hàng
                        </label>
                        <div className="relative group bg-slate-50 rounded-[24px] p-1 transition-shadow hover:shadow-md border border-slate-100">
                            <div className="flex items-center px-4">
                                <Search className="w-5 h-5 text-slate-400 mr-3" />
                                <input
                                    type="text"
                                    placeholder="Tìm tên, SĐT, CCCD..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full py-4 bg-transparent border-none text-base font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-0 outline-none"
                                    autoFocus
                                />
                                {isSearching && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                            </div>

                            {/* Dropdown Results */}
                            {customers.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-[24px] shadow-xl overflow-hidden z-[102] p-1 border border-slate-100 max-h-[300px] overflow-y-auto">
                                    {customers.map(customer => (
                                        <button 
                                            key={customer.id}
                                            onClick={() => handleSelectExisting(customer)}
                                            disabled={isSubmitting}
                                            className="w-full px-4 py-3 hover:bg-blue-50 rounded-xl flex justify-between items-center group transition-colors text-left"
                                        >
                                            <div>
                                                <div className="font-bold text-slate-700 group-hover:text-blue-700">{customer.full_name}</div>
                                                <div className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">
                                                    {customer.phone || 'N/A'} • {customer.id_card || 'N/A'}
                                                </div>
                                            </div>
                                            {customer.balance !== 0 && (
                                                <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest", customer.balance < 0 ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600")}>
                                                    {formatMoney(customer.balance)}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* New Customer Form */}
                    {searchTerm.length > 0 && customers.length === 0 && (
                        <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4 animate-in slide-in-from-top-2 fade-in duration-300">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide px-1">
                                <User size={14} className="text-blue-500" />
                                <span>Tạo khách hàng mới</span>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="relative group bg-slate-50 rounded-[24px] p-1 border border-slate-100">
                                    <div className="flex items-center px-4">
                                        <Phone className="w-4 h-4 text-slate-400 mr-3" />
                                        <input 
                                            type="tel" 
                                            placeholder="Số điện thoại"
                                            value={newCustomerPhone}
                                            onChange={(e) => setNewCustomerPhone(e.target.value)}
                                            className="w-full py-3.5 bg-transparent border-none text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-0 outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="relative group bg-slate-50 rounded-[24px] p-1 border border-slate-100">
                                    <div className="flex items-center px-4">
                                        <CreditCard className="w-4 h-4 text-slate-400 mr-3" />
                                        <input 
                                            type="text" 
                                            placeholder="CCCD/CMND"
                                            value={newCustomerIdCard}
                                            onChange={(e) => setNewCustomerIdCard(e.target.value)}
                                            className="w-full py-3.5 bg-transparent border-none text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-0 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleCreateAndSelect}
                                disabled={isSubmitting}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-bold shadow-lg shadow-blue-600/30 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-wider"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <User className="w-5 h-5" />
                                        <span>Tạo & Chọn khách hàng</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                    
                    {/* Empty State / Prompt */}
                    {!searchTerm && (
                        <div className="text-center py-12 px-6 animate-in fade-in duration-500 opacity-40">
                            <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center mx-auto mb-4">
                                <Search className="w-10 h-10 text-slate-400" />
                            </div>
                            <p className="text-sm font-bold text-slate-500 leading-relaxed uppercase tracking-widest">Nhập tên hoặc số điện thoại<br/>để tìm kiếm khách hàng</p>
                        </div>
                    )}
                </div>

                {/* --- FOOTER --- */}
                <div className="p-6 bg-white border-t border-slate-100 flex items-center gap-4 shrink-0">
                    <button 
                        onClick={onClose}
                        className="w-full py-4 rounded-[24px] font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-wider"
                    >
                        Hủy bỏ
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
