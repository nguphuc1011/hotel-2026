'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Loader2, User, Phone, CreditCard, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
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
        <div className="fixed inset-0 z-[70000] flex items-center justify-center backdrop-blur-sm bg-slate-900/40 p-4">
            <div className="w-full max-w-lg h-[550px] bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                    <h3 className="text-lg font-bold text-slate-800">Chọn khách hàng</h3>
                    <button 
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    
                    {/* Warning / Explanation */}
                    <div className="bg-orange-50 rounded-2xl p-4 flex gap-3 border border-orange-100">
                        <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-orange-800">
                            <span className="font-bold block mb-1">Yêu cầu chọn khách hàng</span>
                            Khách vãng lai không được phép ghi nợ. Vui lòng chọn khách hàng có sẵn hoặc tạo mới để tiếp tục thanh toán.
                        </div>
                    </div>

                    <div className="relative" ref={searchRef}>
                        <div className="flex items-center bg-slate-50 rounded-[24px] border border-slate-200 px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all shadow-sm">
                            <Search className="w-5 h-5 text-slate-400 mr-3" />
                            <input
                                type="text"
                                placeholder="Tìm tên, SĐT, CCCD..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="flex-1 bg-transparent border-none outline-none text-base font-semibold text-slate-800 placeholder:text-slate-400"
                                autoFocus
                            />
                            {isSearching && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                        </div>

                        {/* Dropdown Results */}
                        {customers.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-[24px] shadow-xl overflow-hidden z-50 p-1 border border-slate-100 max-h-[300px] overflow-y-auto">
                                {customers.map(customer => (
                                    <button 
                                        key={customer.id}
                                        onClick={() => handleSelectExisting(customer)}
                                        disabled={isSubmitting}
                                        className="w-full px-4 py-3 hover:bg-blue-50 rounded-xl flex justify-between items-center group transition-colors text-left"
                                    >
                                        <div>
                                            <div className="font-bold text-slate-700 group-hover:text-blue-700">{customer.full_name}</div>
                                            <div className="text-xs text-slate-400 font-medium mt-0.5">
                                                {customer.phone || 'Không có SĐT'} • {customer.id_card || 'Không có CCCD'}
                                            </div>
                                        </div>
                                        {customer.balance !== 0 && (
                                            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", customer.balance < 0 ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600")}>
                                                {customer.balance.toLocaleString()}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* New Customer Form (Show if no results or explicit typing) */}
                    {searchTerm.length > 0 && customers.length === 0 && (
                        <div className="space-y-4 animate-in slide-in-from-top-2 fade-in duration-300">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wide px-1">
                                <User size={14} />
                                <span>Tạo khách hàng mới</span>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input 
                                        type="tel" 
                                        placeholder="Số điện thoại"
                                        value={newCustomerPhone}
                                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                                        className="w-full bg-slate-50 border-none rounded-[20px] pl-10 pr-4 py-3.5 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                                    />
                                </div>
                                <div className="relative">
                                    <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input 
                                        type="text" 
                                        placeholder="CCCD/CMND"
                                        value={newCustomerIdCard}
                                        onChange={(e) => setNewCustomerIdCard(e.target.value)}
                                        className="w-full bg-slate-50 border-none rounded-[20px] pl-10 pr-4 py-3.5 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleCreateAndSelect}
                                disabled={isSubmitting}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <User className="w-5 h-5" />
                                        <span>Tạo khách hàng & Chọn</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                    
                    {/* Empty State / Prompt */}
                    {!searchTerm && (
                        <div className="text-center py-8 opacity-40">
                            <Search className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                            <p className="text-sm font-medium text-slate-500">Nhập tên hoặc số điện thoại để tìm kiếm</p>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
