'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Activity, 
  AlertCircle, 
  TrendingUp, 
  Users, 
  DollarSign, 
  ShieldAlert, 
  CheckCircle2, 
  Clock,
  History,
  Calendar,
  Filter,
  ArrowRight
} from 'lucide-react';
import { formatMoney } from '@/utils/format';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { vi } from 'date-fns/locale';

interface ActivityItem {
  id: string;
  type: 'cash_flow' | 'audit_log';
  category?: string;
  amount?: number;
  description: string;
  occurred_at: string;
  created_by_name?: string;
  is_sensitive?: boolean;
  metadata?: any;
}

interface SummaryData {
  revenue: number;
  occupancy: number;
  sensitive_count: number;
  variance: number;
}

interface AdminCommandCenterProps {
  hotelId: string;
  initialTab?: 'stats' | 'stream';
}

export default function AdminCommandCenter({ hotelId, initialTab = 'stats' }: AdminCommandCenterProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'stream'>(initialTab);

  // Sync internal tab with prop
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // 1. Fetch Initial Data
  const fetchData = async () => {
    if (!hotelId) {
      console.error('AdminCommandCenter: Missing hotelId');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      console.log('AdminCommandCenter: Fetching data for hotelId:', hotelId);
      const yesterday = subDays(new Date(), 1);
      const startOfYesterday = startOfDay(yesterday).toISOString();
      const endOfYesterday = endOfDay(yesterday).toISOString();

      // Fetch Yesterday Summary
      const { data: cfYesterday, error: cfYError } = await supabase
        .from('cash_flow')
        .select('amount, flow_type, category')
        .gte('occurred_at', startOfYesterday)
        .lte('occurred_at', endOfYesterday)
        .eq('hotel_id', hotelId);

      if (cfYError) {
        console.error('Summary CF Error Message:', cfYError.message);
        console.error('Summary CF Error Details:', cfYError.details);
        console.error('Summary CF Error Hint:', cfYError.hint);
        console.error('Full CF Error Object:', JSON.stringify(cfYError, null, 2));
      }

      const yesterdayRevenue = cfYesterday?.reduce((sum, tx) => 
        tx.flow_type === 'IN' ? sum + Number(tx.amount) : sum, 0) || 0;

      // Variance calculation from shifts
      const { data: shiftData, error: srError } = await supabase
        .from('shifts')
        .select('difference')
        .gte('end_time', startOfYesterday)
        .lte('end_time', endOfYesterday)
        .eq('hotel_id', hotelId);
      
      if (srError) {
        console.error('Summary SR Error Message:', srError.message);
        console.error('Summary SR Error Details:', srError.details);
        console.error('Full SR Error Object:', JSON.stringify(srError, null, 2));
      }
      
      const totalVariance = shiftData?.reduce((sum, r) => sum + (Number(r.difference) || 0), 0) || 0;

      // Fetch Recent Activities
      const [cfRes, auditRes, staffRes] = await Promise.all([
        supabase
          .from('cash_flow')
          .select('id, category, amount, description, occurred_at, created_by, flow_type, verified_by_staff_id, verified_by_staff_name, payment_method_code, ref_id')
          .eq('hotel_id', hotelId)
          .order('occurred_at', { ascending: false })
          .limit(100),
        supabase
          .from('audit_logs')
          .select('id, explanation, created_at, staff_id, total_amount, booking_id')
          .eq('hotel_id', hotelId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('staff')
          .select('id, full_name')
          .eq('hotel_id', hotelId)
      ]);

      console.log('AdminCommandCenter: Query Results:', {
        cfCount: cfRes.data?.length || 0,
        auditCount: auditRes.data?.length || 0,
        staffCount: staffRes.data?.length || 0
      });

      if (cfRes.error) console.error('CashFlow Fetch Error:', cfRes.error);
      if (auditRes.error) console.error('AuditLogs Fetch Error:', auditRes.error);

      const staffMap = new Map(staffRes.data?.map(s => [s.id, s.full_name]) || []);

      const merged: ActivityItem[] = [
        ...(cfRes.data?.map(tx => {
          const amount = Number(tx.amount);
          const isCredit = tx.payment_method_code === 'credit';
          const isLargeOpEx = tx.flow_type === 'OUT' && amount > 1000000;
          const isAdjustment = tx.category === 'Điều chỉnh';
          
          // Try to extract room number from description if join is missing
          const roomMatch = tx.description?.match(/phòng\s+([A-Z0-9]+)/i) || tx.description?.match(/P\.([A-Z0-9]+)/i);
          const roomNumber = roomMatch ? roomMatch[1] : null;
          
          const isSensitive = isCredit || isLargeOpEx || isAdjustment || tx.verified_by_staff_id !== null;

          let description = tx.description;
          if (isCredit) description = `[CHO NỢ] ${description}`;
          if (isLargeOpEx) description = `[CHI LỚN] ${description}`;

          return {
            id: tx.id,
            type: 'cash_flow' as const,
            category: tx.category,
            amount: amount,
            description: description,
            occurred_at: tx.occurred_at,
            created_by_name: tx.verified_by_staff_name || staffMap.get(tx.created_by) || 'Hệ thống',
            is_sensitive: isSensitive,
            metadata: { 
              staff_id: tx.verified_by_staff_id || tx.created_by, 
              is_credit: isCredit,
              room_number: roomNumber
            }
          };
        }) || []),
        ...(auditRes.data?.map(log => {
          const explanation = log.explanation || {};
          let cleanDesc = '';
          let isSensitive = false;
          let amount = Number(log.total_amount) || 0;
          
          // Try to extract room number from explanation
          const roomNumber = explanation.room_name || explanation.room_number || null;

          // 1. Detect Action from explanation object
          if (explanation.action === 'update_booking_details') {
            const changes = explanation.changes || {};
            const items = [];
            if (changes.customer_name) items.push(`Đổi tên KH -> ${changes.customer_name}`);
            if (changes.check_in_at) items.push(`Sửa giờ Check-in -> ${format(new Date(changes.check_in_at), 'HH:mm dd/MM')}`);
            if (changes.custom_price !== undefined) {
              items.push(`Sửa giá phòng -> ${Number(changes.custom_price).toLocaleString()}đ`);
            }
            
            cleanDesc = `Sửa thông tin: ${items.join(', ') || 'Cập nhật chung'}`;
            isSensitive = true;
          } 
          // 2. Detect Cancellation
          else if (explanation.action === 'cancel_booking') {
            const rName = explanation.room_name || 'Phòng';
            const penalty = Number(explanation.penalty_amount) || 0;
            cleanDesc = `[HỦY PHÒNG] P.${rName}${penalty > 0 ? ` - Phạt ${penalty.toLocaleString()}đ` : ''}`;
            isSensitive = true;
            amount = penalty;
          }
          // 3. Detect Checkout Details (Waivers, Discounts)
          else if (explanation.total_amount !== undefined && explanation.surcharge_amount !== undefined) {
            const sysSurcharge = Number(explanation.surcharge_amount) || 0;
            const actualSurcharge = Number(explanation.custom_surcharge) || 0;
            const discount = Number(explanation.discount_amount) || 0;
            const rName = explanation.room_name || 'Phòng';

            if (sysSurcharge > 0 && actualSurcharge === 0) {
              cleanDesc = `[MIỄN PHỤ THU] P.${rName} - Quá giờ ${sysSurcharge.toLocaleString()}đ nhưng không thu`;
              isSensitive = true;
            } else if (discount > 0) {
              cleanDesc = `[GIẢM GIÁ] P.${rName} - Giảm ${discount.toLocaleString()}đ`;
              isSensitive = true;
            } else {
              cleanDesc = `Check-out P.${rName}`;
            }
            amount = Number(explanation.total_amount);
          }
          // 4. Fallback
          else {
            const lines = Array.isArray(explanation) ? explanation : [];
            const summaryLine = lines.find((line: string) => 
              line.includes('Thanh toán') || line.includes('Check-out') || 
              line.includes('Hủy phòng') || line.includes('Sửa giá')
            );
            cleanDesc = summaryLine || (lines.length > 0 ? lines[0] : 'Hoạt động hệ thống');
            isSensitive = cleanDesc.includes('Hủy') || cleanDesc.includes('Sửa giá') || cleanDesc.includes('Giảm giá');
          }

          return {
            id: log.id,
            type: 'audit_log' as const,
            description: cleanDesc,
            occurred_at: log.created_at,
            created_by_name: staffMap.get(log.staff_id) || 'Hệ thống',
            is_sensitive: isSensitive,
            metadata: { 
              staff_id: log.staff_id,
              room_number: roomNumber
            },
            amount: amount
          };
        }) || [])
      ].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()).slice(0, 100);

      setActivities(merged);

      // Summary Stats
      const sensitiveToday = merged.filter(a => a.is_sensitive && new Date(a.occurred_at) >= startOfDay(new Date())).length;
      const { count: occupiedCount } = await supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'checked_in').eq('hotel_id', hotelId);
      const { count: totalRooms } = await supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('hotel_id', hotelId);

      setSummary({
        revenue: yesterdayRevenue,
        occupancy: totalRooms ? Math.round(((occupiedCount || 0) / totalRooms) * 100) : 0,
        sensitive_count: sensitiveToday,
        variance: totalVariance
      });

    } catch (error) {
      console.error('Error fetching admin command center data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // 2. Setup Realtime Subscriptions
    const channel = supabase
      .channel(`admin-command-${hotelId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'cash_flow',
        filter: `hotel_id=eq.${hotelId}`
      }, (payload) => {
        const newTx = payload.new;
        setActivities(prev => [{
          id: newTx.id,
          type: 'cash_flow',
          category: newTx.category,
          amount: Number(newTx.amount),
          description: newTx.description,
          occurred_at: newTx.occurred_at,
          is_sensitive: newTx.category === 'Điều chỉnh' || newTx.amount > 5000000
        }, ...prev].slice(0, 20));
      })
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'audit_logs',
        filter: `hotel_id=eq.${hotelId}`
      }, (payload) => {
        const newLog = payload.new;
        setActivities(prev => [{
          id: newLog.id,
          type: 'audit_log',
          description: Array.isArray(newLog.explanation) ? newLog.explanation.join(', ') : String(newLog.explanation),
          occurred_at: newLog.created_at,
          is_sensitive: true
        }, ...prev].slice(0, 20));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId]);

  const sensitiveActivities = useMemo(() => 
    activities.filter(a => a.is_sensitive), 
  [activities]);

  // Group sensitive stats by staff
  const staffStats = useMemo(() => {
    const stats: Record<string, { name: string, day: number, week: number, month: number }> = {};
    const now = new Date();
    const startOfToday = startOfDay(now);
    const startOfWeek = subDays(now, 7);
    const startOfMonth = subDays(now, 30);

    activities.forEach(a => {
      if (!a.is_sensitive) return;
      const staffId = a.metadata?.staff_id;
      if (!staffId) return;
      
      const staffName = a.created_by_name || 'Hệ thống';
      if (!stats[staffId]) {
        stats[staffId] = { name: staffName, day: 0, week: 0, month: 0 };
      }

      const date = new Date(a.occurred_at);
      if (date >= startOfToday) stats[staffId].day++;
      if (date >= startOfWeek) stats[staffId].week++;
      if (date >= startOfMonth) stats[staffId].month++;
    });

    return Object.values(stats).sort((a, b) => b.month - a.month);
  }, [activities]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {activeTab === 'stats' ? (
        <div className="space-y-8">
          {/* 1. Daily Summary Card */}
          <section className="bg-white rounded-[32px] border border-slate-200/60 shadow-sm overflow-hidden p-6 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                  <History size={24} className="text-blue-600" />
                  Tổng hợp Ngày hôm qua
                </h2>
                <p className="text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest mt-1">
                  {format(subDays(new Date(), 1), 'eeee, dd MMMM yyyy', { locale: vi })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={fetchData}
                  className="p-2 md:px-4 md:py-2 bg-slate-100 hover:bg-slate-200 rounded-xl md:rounded-2xl text-[10px] md:text-[11px] font-black text-slate-600 uppercase tracking-widest border border-slate-200 flex items-center gap-2 transition-all active:scale-95"
                >
                  <Clock size={14} className={cn(loading && "animate-spin")} />
                  <span className="hidden md:inline">Tải lại dữ liệu</span>
                </button>
                <div className="px-3 py-1.5 md:px-4 md:py-2 bg-slate-50 rounded-xl md:rounded-2xl text-[10px] md:text-[11px] font-black text-emerald-600 uppercase tracking-widest border border-emerald-100 flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  <span>Đã Audit</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <div className="space-y-1 md:space-y-2">
                <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Doanh thu thực</p>
                <p className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter">{formatMoney(summary?.revenue || 0)}</p>
              </div>
              <div className="space-y-1 md:space-y-2 border-l border-slate-100 pl-4 md:pl-6">
                <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Công suất</p>
                <p className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter">{summary?.occupancy}%</p>
              </div>
              <div className="space-y-1 md:space-y-2 border-l border-slate-100 pl-4 md:pl-6">
                <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Nhạy cảm</p>
                <p className={cn(
                  "text-xl md:text-3xl font-black tracking-tighter",
                  (summary?.sensitive_count || 0) > 5 ? "text-rose-600" : "text-slate-900"
                )}>
                  {summary?.sensitive_count}
                </p>
              </div>
              <div className="space-y-1 md:space-y-2 border-l border-slate-100 pl-4 md:pl-6">
                <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Lệch quỹ</p>
                <p className={cn(
                  "text-xl md:text-3xl font-black tracking-tighter",
                  (summary?.variance || 0) !== 0 ? "text-rose-600" : "text-emerald-600"
                )}>
                  {formatMoney(summary?.variance || 0)}
                </p>
              </div>
            </div>
          </section>

          {/* Staff Sensitive Stats Table */}
          <section className="bg-white rounded-[32px] border border-slate-200/60 shadow-sm overflow-hidden p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6 md:mb-8">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                <Users size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Thống kê Vi phạm</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Theo nhân viên</p>
              </div>
            </div>

            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-50 text-left">
                    <th className="pb-4 text-[10px] font-black text-slate-300 uppercase tracking-widest">Nhân viên</th>
                    <th className="pb-4 text-[10px] font-black text-slate-300 uppercase tracking-widest text-center">Ngày</th>
                    <th className="pb-4 text-[10px] font-black text-slate-300 uppercase tracking-widest text-center">Tuần</th>
                    <th className="pb-4 text-[10px] font-black text-slate-300 uppercase tracking-widest text-center">Tháng</th>
                    <th className="pb-4 text-[10px] font-black text-slate-300 uppercase tracking-widest text-right">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {staffStats.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-300 text-xs font-bold italic">Không có dữ liệu vi phạm</td>
                    </tr>
                  ) : (
                    staffStats.map((staff, idx) => (
                      <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                              {staff.name.charAt(0)}
                            </div>
                            <span className="text-sm font-black text-slate-700">{staff.name}</span>
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          <span className={cn(
                            "px-2 py-1 rounded-md text-xs font-black",
                            staff.day > 3 ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-500"
                          )}>
                            {staff.day}
                          </span>
                        </td>
                        <td className="py-4 text-center text-sm font-bold text-slate-600">{staff.week}</td>
                        <td className="py-4 text-center text-sm font-bold text-slate-600">{staff.month}</td>
                        <td className="py-4 text-right">
                          {staff.day > 5 ? (
                            <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center justify-end gap-1">
                              <AlertCircle size={12} />
                              Cần nhắc
                            </span>
                          ) : (
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-end gap-1">
                              <CheckCircle2 size={12} />
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 animate-in slide-in-from-bottom-4 duration-500">
          {/* Detailed Activity Stream */}
          <section className="bg-white rounded-[32px] border border-slate-200/60 shadow-sm overflow-hidden flex flex-col h-[70vh] md:h-[800px]">
            <div className="p-6 md:p-8 border-b border-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <Activity size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Luồng Hoạt động Chi tiết</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Thời gian thực</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Live</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-2 no-scrollbar">
              {/* Desktop Header */}
              <div className="hidden md:grid grid-cols-12 px-4 py-2 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                <div className="col-span-1">Giờ</div>
                <div className="col-span-2">Phòng</div>
                <div className="col-span-2">Nhân viên</div>
                <div className="col-span-5">Hành động</div>
                <div className="col-span-2 text-right">Số tiền</div>
              </div>

              {activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                  <Activity size={48} strokeWidth={1} className="mb-4 opacity-20" />
                  <p className="font-black uppercase tracking-widest text-xs text-center">Đang chờ dữ liệu...</p>
                </div>
              ) : (
                activities.map((activity) => (
                  <div 
                    key={activity.id}
                    className={cn(
                      "flex flex-col md:grid md:grid-cols-12 items-start md:items-center p-4 rounded-2xl border transition-all duration-300 gap-2 md:gap-4",
                      activity.is_sensitive 
                        ? "bg-rose-50/40 border-rose-100 hover:bg-rose-50/60" 
                        : "bg-white border-transparent hover:border-slate-100 hover:bg-slate-50/50"
                    )}
                  >
                    {/* Mobile: Top Row */}
                    <div className="flex items-center justify-between w-full md:hidden">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400">{format(new Date(activity.occurred_at), 'HH:mm')}</span>
                        <div className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-black uppercase",
                          activity.metadata?.room_number ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-300"
                        )}>
                          {activity.metadata?.room_number ? `P.${activity.metadata.room_number}` : 'Hệ thống'}
                        </div>
                      </div>
                      {activity.amount !== undefined && activity.amount !== 0 && (
                        <p className={cn(
                          "text-xs font-black",
                          activity.amount > 0 ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {activity.amount > 0 ? '+' : ''}{formatMoney(activity.amount)}
                        </p>
                      )}
                    </div>

                    {/* Desktop/Mobile Columns */}
                    <div className="hidden md:block col-span-1 text-[11px] font-bold text-slate-400">
                      {format(new Date(activity.occurred_at), 'HH:mm')}
                    </div>

                    <div className="hidden md:block col-span-2">
                      <div className={cn(
                        "w-fit px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider",
                        activity.metadata?.room_number ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-300"
                      )}>
                        {activity.metadata?.room_number ? `P.${activity.metadata.room_number}` : 'Hệ thống'}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-[8px] font-black text-slate-400 shrink-0">
                          {activity.created_by_name?.charAt(0)}
                        </div>
                        <span className="text-[11px] font-black text-slate-700 truncate max-w-[100px] md:max-w-none">
                          {activity.created_by_name}
                        </span>
                      </div>
                    </div>

                    <div className="col-span-5 w-full">
                      <div className="flex items-center gap-2">
                        {activity.is_sensitive && <ShieldAlert size={14} className="text-rose-500 shrink-0" />}
                        <p className={cn(
                          "text-xs font-bold leading-snug break-words md:truncate",
                          activity.is_sensitive ? "text-rose-900" : "text-slate-600"
                        )}>
                          {activity.description}
                        </p>
                      </div>
                    </div>

                    <div className="hidden md:block col-span-2 text-right">
                      {activity.amount !== undefined && activity.amount !== 0 ? (
                        <p className={cn(
                          "text-xs font-black",
                          activity.amount > 0 ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {activity.amount > 0 ? '+' : ''}{formatMoney(activity.amount)}
                        </p>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-300">--</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="p-6 md:p-8 border-t border-slate-50 bg-slate-50/30 shrink-0">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                   <div className="flex items-center gap-2">
                     <div className="w-3 h-3 rounded bg-rose-50 border border-rose-100" />
                     <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nhạy cảm</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <div className="w-3 h-3 rounded bg-white border border-slate-100" />
                     <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bình thường</span>
                   </div>
                </div>
                <button className="w-full md:w-auto py-3 px-6 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200">
                  Tải Báo cáo (.excel)
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
